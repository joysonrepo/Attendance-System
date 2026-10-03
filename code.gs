// Sheet name will be determined by 'group' parameter (Church or RFF)
// Sheet headers can be in any order; we map by header names.

function renderIndex(e) {
  const group = e && e.parameter && e.parameter.group === 'RFF' ? 'RFF' : 'Church';
  const page = e && e.parameter && e.parameter.page === 'report' ? 'report' : 'attendance';
  const template = HtmlService.createTemplateFromFile('shell');
  template.group = group;
  template.page = page;
  template.module = group.toLowerCase() + '-' + (page === 'report' ? 'reports' : 'attendance');
  return template.evaluate()
    .setTitle('River Kids ' + group + (page === 'report' ? ' Reports' : ' Attendance'))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet(e) {
  const path = (e && e.parameter && e.parameter.path) ? e.parameter.path : '';
  if (!path) return renderIndex(e);
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
  headers.forEach((h,i) => {
    const lowerH = h.toLowerCase();
    idx[lowerH] = i+1; // 1-based
  });
  Logger.log('Headers found: ' + JSON.stringify(headers));
  Logger.log('Header index map: ' + JSON.stringify(idx));
  return { headers, idx };
}

function ensureDateColumn(sheet, dateISO) {
  const headers = headerRow(sheet);
  let colIndex = headers.indexOf(dateISO) + 1; // 1-based if found
  if (colIndex === 0) { // not found
    colIndex = headers.length + 1;
    sheet.getRange(1, colIndex).setValue(dateISO);
  }
  return colIndex;
}

function isDateHeader(value) {
  return !!value && String(value).trim().match(/^\d{4}-\d{2}-\d{2}$/);
}

function ensureStudentHeaderLayout(sheet) {
  const desired = ['Father Name', 'Mother Name', 'Date of Birth'];
  const headers = headerRow(sheet).map(h => String(h).trim());
  let insertAt = headers.findIndex(isDateHeader);
  if (insertAt === -1) insertAt = headers.length;

  desired.forEach(headerName => {
    const currentHeaders = headerRow(sheet).map(h => String(h).trim());
    const existingIndex = currentHeaders.findIndex(h => h.toLowerCase() === headerName.toLowerCase());
    if (existingIndex === -1) {
      sheet.insertColumnBefore(insertAt + 1);
      sheet.getRange(1, insertAt + 1).setValue(headerName);
      insertAt++;
    }
  });
}

function getStudentColumnMap(sheet) {
  let { idx } = headerIndexMap(sheet);
  const requiredHeaders = ['father name', 'mother name', 'date of birth'];
  if (requiredHeaders.some(name => !idx[name])) {
    ensureStudentHeaderLayout(sheet);
    ({ idx } = headerIndexMap(sheet));
  }
  return {
    slnoCol: idx['sl. no'] || 1,
    nameCol: idx['name'] || 2,
    fatherNameCol: idx['father name'],
    motherNameCol: idx['mother name'],
    dobCol: idx['date of birth'],
    classCol: idx['class'] || 6,
    phoneCol: idx['phone'] || 7,
    genderCol: idx['gender'] || 8,
    placeCol: idx['place'] || 9,
    modeCol: idx['transport'] || 10
  };
}

function handleStudents(e) {
  const group = (e && e.parameter && e.parameter.group) ? e.parameter.group : 'Church';
  const sheet = getSheet(group);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonOutput([]); // No data rows

  const cols = getStudentColumnMap(sheet);
  const numCols = Math.max(cols.slnoCol, cols.nameCol, cols.fatherNameCol || 0,
    cols.motherNameCol || 0, cols.dobCol || 0, cols.classCol, cols.phoneCol,
    cols.genderCol, cols.placeCol, group === 'Church' ? cols.modeCol : 0);
  const values = sheet.getRange(2,1,lastRow-1, numCols).getValues();
  const list = values.map((row,i) => {
    const modeValue = String(row[cols.modeCol-1] || '').trim();
    return {
      id: i+1,
      rowIndex: i+2, // actual sheet row
      name: String(row[cols.nameCol-1] || '').trim(),
      fatherName: String(row[cols.fatherNameCol-1] || '').trim(),
      motherName: String(row[cols.motherNameCol-1] || '').trim(),
      dateOfBirth: String(row[cols.dobCol-1] || '').trim(),
      class: String(row[cols.classCol-1] || '').trim(),
      phone: String(row[cols.phoneCol-1] || '').trim(),
      gender: String(row[cols.genderCol-1] || '').trim(),
      place: String(row[cols.placeCol-1] || '').trim(),
      modeOfTransport: group === 'Church' ? modeValue : ''
    };
  }).filter(r => r.name);
  return jsonOutput(list);
}

function handleAttendance(body) {
  const {rowIndex, date, status, group, fatherName, motherName, dateOfBirth, studentClass, phone, gender, place, modeOfTransport} = body;
  if (!rowIndex || !date || !status) return jsonOutput({error:'Missing fields'}, 400);

  const sheet = getSheet(group || 'Church');
  const cols = getStudentColumnMap(sheet);
  const metadataWidth = Math.max(cols.nameCol, cols.fatherNameCol || 0,
    cols.motherNameCol || 0, cols.dobCol || 0, cols.classCol, cols.phoneCol,
    cols.genderCol, cols.placeCol, group === 'Church' ? cols.modeCol : 0);
  const metadataRange = sheet.getRange(rowIndex, 1, 1, metadataWidth);
  const metadata = metadataRange.getValues()[0];

  if (fatherName !== undefined && cols.fatherNameCol) metadata[cols.fatherNameCol - 1] = fatherName || '';
  if (motherName !== undefined && cols.motherNameCol) metadata[cols.motherNameCol - 1] = motherName || '';
  if (dateOfBirth !== undefined && cols.dobCol) metadata[cols.dobCol - 1] = dateOfBirth || '';
  if (studentClass !== undefined) metadata[cols.classCol - 1] = studentClass || '';
  if (phone !== undefined) metadata[cols.phoneCol - 1] = phone || '';
  if (gender !== undefined) metadata[cols.genderCol - 1] = gender || '';
  if (place !== undefined) metadata[cols.placeCol - 1] = place || '';
  if (modeOfTransport !== undefined && group === 'Church') metadata[cols.modeCol - 1] = modeOfTransport || '';
  metadataRange.setValues([metadata]);

  const colIndex = ensureDateColumn(sheet, date);
  sheet.getRange(rowIndex, colIndex).setValue(status);
  return jsonOutput({message: 'Attendance recorded and student details updated'});
}

function handleNewStudent(body) {
  const {name, fatherName, motherName, dateOfBirth, studentClass, phone, gender, place, date, status, group, modeOfTransport} = body;
  if (!name || !studentClass || !gender || !date || !status) return jsonOutput({error:'Missing required fields'}, 400);

  const sheet = getSheet(group || 'Church');
  const cols = getStudentColumnMap(sheet);
  const lastRow = sheet.getLastRow() + 1;

  // Calculate next Sl. No (fallback to column A if header missing)
  let nextSlNo = 1;
  if (lastRow > 2) {
    const lastSlNo = sheet.getRange(lastRow-1, cols.slnoCol).getValue();
    nextSlNo = (Number(lastSlNo) || 0) + 1;
  }

  const metadataWidth = Math.max(cols.slnoCol, cols.nameCol, cols.fatherNameCol || 0,
    cols.motherNameCol || 0, cols.dobCol || 0, cols.classCol, cols.phoneCol,
    cols.genderCol, cols.placeCol, group === 'Church' ? cols.modeCol : 0);
  const metadata = new Array(metadataWidth).fill('');
  metadata[cols.slnoCol - 1] = nextSlNo;
  metadata[cols.nameCol - 1] = name;
  if (cols.fatherNameCol) metadata[cols.fatherNameCol - 1] = fatherName || '';
  if (cols.motherNameCol) metadata[cols.motherNameCol - 1] = motherName || '';
  if (cols.dobCol) metadata[cols.dobCol - 1] = dateOfBirth || '';
  metadata[cols.classCol - 1] = studentClass;
  metadata[cols.phoneCol - 1] = phone || '';
  metadata[cols.genderCol - 1] = gender;
  metadata[cols.placeCol - 1] = place || '';
  if (group === 'Church' && cols.modeCol) metadata[cols.modeCol - 1] = modeOfTransport || '';
  sheet.getRange(lastRow, 1, 1, metadataWidth).setValues([metadata]);

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

  const cols = getStudentColumnMap(sheet);
  const metadataWidth = Math.max(cols.nameCol, cols.classCol);
  const data = sheet.getRange(2, 1, lastRow - 1, metadataWidth).getValues();
  const attendance = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();
  let present = 0, absent = 0;
  const groupCounts = {junior:{present:0,absent:0}, inter:{present:0,absent:0}, senior:{present:0,absent:0}};

  const list = data.map((r, index) => {
    const name = String(r[cols.nameCol-1] || '').trim();
    const studentClass = String(r[cols.classCol-1] || '').trim().toUpperCase();
    const status = String(attendance[index][0] || '').trim() || 'Not Set';

    let groupBucket = 'senior';
    if (studentClass === 'KG' || studentClass === '1' || studentClass === '2' || studentClass === '3') {
      groupBucket = 'junior';
    } else if (studentClass === '4' || studentClass === '5' || studentClass === '6') {
      groupBucket = 'inter';
    }

    if (status === 'Present') {
      present++;
      groupCounts[groupBucket].present++;
    } else if (status === 'Absent') {
      absent++;
      groupCounts[groupBucket].absent++;
    }
    return {name, class: studentClass, status, group: groupBucket};
  }).filter(x => x.name);

  return jsonOutput({date, list, counts:{total:list.length, present, absent, group:groupCounts}});
}

function jsonOutput(obj, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handleGetDates(e) {
  const group = (e && e.parameter && e.parameter.group) ? e.parameter.group : 'Church';
  const sheet = getSheet(group);
  const headers = headerRow(sheet);
  const dates = headers.filter(h => h && String(h).match(/^\d{4}-\d{2}-\d{2}$/));
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

  const cols = getStudentColumnMap(sheet);
  const modeCol = group === 'Church' ? cols.modeCol : 0;
  const metadataWidth = Math.max(cols.nameCol, cols.classCol, modeCol);
  const data = sheet.getRange(2, 1, lastRow - 1, metadataWidth).getValues();
  const attendance = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues();

  const junior = [];
  const inter = [];
  const senior = [];

  data.forEach((r, index) => {
    const name = String(r[cols.nameCol-1] || '').trim();
    if (!name) return;

    const studentClass = String(r[cols.classCol-1] || '').trim().toUpperCase();
    const status = String(attendance[index][0] || '').trim() || 'Not Set';
    const modeOfTransport = group === 'Church' ? String(r[modeCol-1] || '').trim() : '';

    const student = {
      name: name,
      class: studentClass,
      status: status,
      modeOfTransport: modeOfTransport
    };

    if (studentClass === 'KG' || studentClass === '1' || studentClass === '2' || studentClass === '3') {
      junior.push(student);
    } else if (studentClass === '4' || studentClass === '5' || studentClass === '6') {
      inter.push(student);
    } else {
      senior.push(student);
    }
  });

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
