// Sheet name will be determined by 'group' parameter (Church or RFF)
// Sheet headers can be in any order; we map by header names.

function doGet(e) {
  const path = (e && e.parameter && e.parameter.path) ? e.parameter.path : '';
  if (path === 'students') return handleStudents(e);
  if (path === 'stats') return handleStats(e);
  return jsonOutput({error: 'Unknown GET endpoint', path});
}

function doPost(e) {
  const path = (e && e.parameter && e.parameter.path) ? e.parameter.path : '';
  const body = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : '{}');
  if (path === 'attendance') return handleAttendance(body);
  if (path === 'newStudent') return handleNewStudent(body);
  return jsonOutput({error: 'Unknown POST endpoint', path});
}

function getSheet(sheetName) {
  if (!sheetName) sheetName = 'Church'; // default
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) return jsonOutput({error: 'Sheet not found: ' + sheetName}, 404);
  return sheet;
}

function headerRow(sheet) {
  return sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
}

function headerIndexMap(sheet) {
  const headers = headerRow(sheet).map(h => String(h).trim());
  const idx = {};
  headers.forEach((h,i) => { idx[h.toLowerCase()] = i+1; }); // 1-based
  return { headers, idx };
}

function ensureDateColumn(sheet, dateISO) {
  const headers = headerRow(sheet);
  let colIndex = headers.indexOf(dateISO) + 1; // 1-based if found
  if (colIndex === 0) { // not found
    colIndex = headers.length + 1;
    sheet.getRange(1,colIndex).setValue(dateISO);
  }
  return colIndex;
}

function handleStudents(e) {
  const group = (e && e.parameter && e.parameter.group) ? e.parameter.group : 'Church';
  const sheet = getSheet(group);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonOutput([]); // No data rows
  const { idx } = headerIndexMap(sheet);
  const slnoCol = idx['sl. no'] || 1;
  const nameCol = idx['name'] || 2;
  const ageCol = idx['age'] || 3;
  const phoneCol = idx['phone'] || 4;
  const genderCol = idx['gender'] || 5;
  const placeCol = idx['place'] || 6;

  const numCols = sheet.getLastColumn();
  const values = sheet.getRange(2,1,lastRow-1, numCols).getValues();
  const list = values.map((row,i) => ({
    id: i+1,
    rowIndex: i+2, // actual sheet row
    name: String(row[nameCol-1] || '').trim(),
    age: row[ageCol-1] || '',
    phone: String(row[phoneCol-1] || '').trim(),
    gender: String(row[genderCol-1] || '').trim(),
    place: String(row[placeCol-1] || '').trim()
  })).filter(r => r.name);
  return jsonOutput(list);
}

function handleAttendance(body) {
  const {rowIndex, date, status, group} = body;
  if (!rowIndex || !date || !status) return jsonOutput({error:'Missing fields'}, 400);
  const sheet = getSheet(group || 'Church');
  const colIndex = ensureDateColumn(sheet, date);
  sheet.getRange(rowIndex, colIndex).setValue(status);
  return jsonOutput({message: 'Attendance recorded'});
}

function handleNewStudent(body) {
  const {name, age, phone, gender, place, date, status, group} = body;
  if (!name || !age || !gender || !date || !status) return jsonOutput({error:'Missing required fields'}, 400);

  const sheet = getSheet(group || 'Church');
  const lastRow = sheet.getLastRow() + 1;
  const { idx } = headerIndexMap(sheet);

  // Calculate next Sl. No (fallback to column A if header missing)
  let nextSlNo = 1;
  if (lastRow > 2) {
    const lastSlNo = sheet.getRange(lastRow-1, idx['sl. no'] || 1).getValue();
    nextSlNo = (Number(lastSlNo) || 0) + 1;
  }

  // Write row by header names
  const slnoCol = idx['sl. no'] || 1;
  const nameCol = idx['name'] || 2;
  const ageCol = idx['age'] || 3;
  const phoneCol = idx['phone'] || 4;
  const genderCol = idx['gender'] || 5;
  const placeCol = idx['place'] || 6;

  sheet.getRange(lastRow, slnoCol).setValue(nextSlNo);
  sheet.getRange(lastRow, nameCol).setValue(name);
  sheet.getRange(lastRow, ageCol).setValue(age);
  sheet.getRange(lastRow, phoneCol).setValue(phone);
  sheet.getRange(lastRow, genderCol).setValue(gender);
  sheet.getRange(lastRow, placeCol).setValue(place);

  // Add attendance in date column
  const colIndex = ensureDateColumn(sheet, date);
  sheet.getRange(lastRow, colIndex).setValue(status);

  return jsonOutput({message:'New student added & attendance recorded', rowIndex: lastRow});
}

function handleStats(e) {
  const date = (e.parameter.date || '').trim();
  const group = (e.parameter.group || 'Church').trim();
  if (!date) return jsonOutput({error:'date parameter required'}, 400);
  const sheet = getSheet(group);
  const headers = headerRow(sheet);
  const colIndex = headers.indexOf(date) + 1;
  if (colIndex === 0) return jsonOutput({error:'No attendance for date yet', list:[], counts:{total:0,present:0,absent:0,group:{g1:{present:0,absent:0},g2:{present:0,absent:0},g3:{present:0,absent:0}}}});
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonOutput({date, list:[], counts:{total:0,present:0,absent:0,group:{g1:{present:0,absent:0},g2:{present:0,absent:0},g3:{present:0,absent:0}}}});
  
  const data = sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();
  let present = 0, absent = 0;
  const groupCounts = {g1:{present:0,absent:0}, g2:{present:0,absent:0}, g3:{present:0,absent:0}};
  const list = data.map(r => {
    const name = String(r[1] || '').trim(); // Column B (Name)
    const age = Number(r[2]); // Column C (Age)
    const status = String(r[colIndex-1] || '').trim() || 'Not Set';
    const group = age >=4 && age <=7 ? '4-7' : (age >=8 && age <=12 ? '8-12' : '13+');
    if (status === 'Present') {
      present++;
      if (group === '4-7') groupCounts.g1.present++; else if (group === '8-12') groupCounts.g2.present++; else groupCounts.g3.present++;
    } else if (status === 'Absent') {
      absent++;
      if (group === '4-7') groupCounts.g1.absent++; else if (group === '8-12') groupCounts.g2.absent++; else groupCounts.g3.absent++;
    }
    return {name, age, status, group};
  }).filter(x => x.name);
  const out = {date, list, counts:{total:list.length, present, absent, group:groupCounts}};
  return jsonOutput(out);
}

function jsonOutput(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
