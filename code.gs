// Sheet name will be determined by 'group' parameter (Church or RFF)
// Sheet headers can be in any order; we map by header names.

function doGet(e) {
  const path = (e && e.parameter && e.parameter.path) ? e.parameter.path : '';
  if (path === 'students') return handleStudents(e);
  if (path === 'stats') return handleStats(e);
  if (path === 'dates') return handleGetDates(e);
  if (path === 'report') return handleGenerateReport(e);
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
  const classCol = idx['class'] || 3;
  const phoneCol = idx['phone'] || 4;
  const genderCol = idx['gender'] || 5;
  const placeCol = idx['place'] || 6;

  const numCols = sheet.getLastColumn();
  const values = sheet.getRange(2,1,lastRow-1, numCols).getValues();
  const list = values.map((row,i) => ({
    id: i+1,
    rowIndex: i+2, // actual sheet row
    name: String(row[nameCol-1] || '').trim(),
    class: String(row[classCol-1] || '').trim(),
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
  const {name, studentClass, phone, gender, place, date, status, group} = body;
  if (!name || !studentClass || !gender || !date || !status) return jsonOutput({error:'Missing required fields'}, 400);

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
  const classCol = idx['class'] || 3;
  const phoneCol = idx['phone'] || 4;
  const genderCol = idx['gender'] || 5;
  const placeCol = idx['place'] || 6;

  sheet.getRange(lastRow, slnoCol).setValue(nextSlNo);
  sheet.getRange(lastRow, nameCol).setValue(name);
  sheet.getRange(lastRow, classCol).setValue(studentClass);
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
  if (colIndex === 0) return jsonOutput({error:'No attendance for date yet', list:[], counts:{total:0,present:0,absent:0,group:{junior:{present:0,absent:0},inter:{present:0,absent:0},senior:{present:0,absent:0}}}});
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonOutput({date, list:[], counts:{total:0,present:0,absent:0,group:{junior:{present:0,absent:0},inter:{present:0,absent:0},senior:{present:0,absent:0}}}});
  
  const { idx } = headerIndexMap(sheet);
  const nameCol = idx['name'] || 2;
  const classCol = idx['class'] || 3;
  
  const data = sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();
  let present = 0, absent = 0;
  const groupCounts = {junior:{present:0,absent:0}, inter:{present:0,absent:0}, senior:{present:0,absent:0}};
  
  const list = data.map(r => {
    const name = String(r[nameCol-1] || '').trim();
    const studentClass = String(r[classCol-1] || '').trim().toUpperCase();
    const status = String(r[colIndex-1] || '').trim() || 'Not Set';
    
    // Determine group based on class
    let group = 'senior';
    if (studentClass === 'KG' || studentClass === '1' || studentClass === '2' || studentClass === '3') {
      group = 'junior';
    } else if (studentClass === '4' || studentClass === '5' || studentClass === '6') {
      group = 'inter';
    }
    
    if (status === 'Present') {
      present++;
      groupCounts[group].present++;
    } else if (status === 'Absent') {
      absent++;
      groupCounts[group].absent++;
    }
    return {name, class: studentClass, status, group};
  }).filter(x => x.name);
  
  const out = {date, list, counts:{total:list.length, present, absent, group:groupCounts}};
  return jsonOutput(out);
}

function jsonOutput(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handleGetDates(e) {
  const group = (e && e.parameter && e.parameter.group) ? e.parameter.group : 'Church';
  const sheet = getSheet(group);
  const headers = headerRow(sheet);
  
  // Filter out non-date headers (first 6 columns are student info)
  const dates = headers.slice(6).filter(h => h && String(h).match(/^\d{4}-\d{2}-\d{2}$/));
  return jsonOutput({dates: dates});
}

function handleGenerateReport(e) {
  const date = (e.parameter.date || '').trim();
  const group = (e.parameter.group || 'Church').trim();
  
  if (!date) return jsonOutput({error:'date parameter required'}, 400);
  
  const sheet = getSheet(group);
  const headers = headerRow(sheet);
  const colIndex = headers.indexOf(date) + 1;
  
  if (colIndex === 0) return jsonOutput({error:'No attendance for date: ' + date}, 404);
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonOutput({error:'No students found'}, 404);
  
  const { idx } = headerIndexMap(sheet);
  const nameCol = idx['name'] || 2;
  const classCol = idx['class'] || 3;
  
  const data = sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();
  
  // Group students by Junior, Inter, Senior
  const junior = [];
  const inter = [];
  const senior = [];
  
  data.forEach(r => {
    const name = String(r[nameCol-1] || '').trim();
    if (!name) return;
    
    const studentClass = String(r[classCol-1] || '').trim().toUpperCase();
    const status = String(r[colIndex-1] || '').trim() || 'Not Set';
    
    const student = {
      name: name,
      class: studentClass,
      status: status
    };
    
    if (studentClass === 'KG' || studentClass === '1' || studentClass === '2' || studentClass === '3') {
      junior.push(student);
    } else if (studentClass === '4' || studentClass === '5' || studentClass === '6') {
      inter.push(student);
    } else {
      senior.push(student);
    }
  });
  
  // Sort by class within each group
  const classOrder = {'KG': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, '11': 11, '12': 12};
  const sortByClass = (a, b) => (classOrder[a.class] || 99) - (classOrder[b.class] || 99);
  
  junior.sort(sortByClass);
  inter.sort(sortByClass);
  senior.sort(sortByClass);
  
  return jsonOutput({
    date: date,
    group: group,
    junior: junior,
    inter: inter,
    senior: senior
  });
}
