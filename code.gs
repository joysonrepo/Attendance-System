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
  ensureStudentHeaderLayout(sheet);
  const { idx } = headerIndexMap(sheet);
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
  const numCols = sheet.getLastColumn();
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

  Logger.log('handleAttendance: rowIndex=' + rowIndex + ', date=' + date + ', group=' + group);
  Logger.log('Fields: father=' + fatherName + ', mother=' + motherName + ', dob=' + dateOfBirth + ', class=' + studentClass + ', phone=' + phone + ', gender=' + gender + ', place=' + place + ', mode=' + modeOfTransport);
  Logger.log('Column assignments: ' + JSON.stringify(cols));

  if (fatherName !== undefined) sheet.getRange(rowIndex, cols.fatherNameCol).setValue(fatherName || '');
  if (motherName !== undefined) sheet.getRange(rowIndex, cols.motherNameCol).setValue(motherName || '');
  if (dateOfBirth !== undefined) sheet.getRange(rowIndex, cols.dobCol).setValue(dateOfBirth || '');
  if (studentClass !== undefined) sheet.getRange(rowIndex, cols.classCol).setValue(studentClass || '');
  if (phone !== undefined) sheet.getRange(rowIndex, cols.phoneCol).setValue(phone || '');
  if (gender !== undefined) sheet.getRange(rowIndex, cols.genderCol).setValue(gender || '');
  if (place !== undefined) sheet.getRange(rowIndex, cols.placeCol).setValue(place || '');
  if (modeOfTransport !== undefined && group === 'Church') sheet.getRange(rowIndex, cols.modeCol).setValue(modeOfTransport || '');

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

  sheet.getRange(lastRow, cols.slnoCol).setValue(nextSlNo);
  sheet.getRange(lastRow, cols.nameCol).setValue(name);
  sheet.getRange(lastRow, cols.fatherNameCol).setValue(fatherName || '');
  sheet.getRange(lastRow, cols.motherNameCol).setValue(motherName || '');
  sheet.getRange(lastRow, cols.dobCol).setValue(dateOfBirth || '');
  sheet.getRange(lastRow, cols.classCol).setValue(studentClass);
  sheet.getRange(lastRow, cols.phoneCol).setValue(phone);
  sheet.getRange(lastRow, cols.genderCol).setValue(gender);
  sheet.getRange(lastRow, cols.placeCol).setValue(place);

  if (group === 'Church' && modeOfTransport) {
    sheet.getRange(lastRow, cols.modeCol).setValue(modeOfTransport);
  }

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
  const data = sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();
  let present = 0, absent = 0;
  const groupCounts = {junior:{present:0,absent:0}, inter:{present:0,absent:0}, senior:{present:0,absent:0}};

  const list = data.map(r => {
    const name = String(r[cols.nameCol-1] || '').trim();
    const studentClass = String(r[cols.classCol-1] || '').trim().toUpperCase();
    const status = String(r[colIndex-1] || '').trim() || 'Not Set';

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
  const data = sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();

  const junior = [];
  const inter = [];
  const senior = [];

  data.forEach(r => {
    const name = String(r[cols.nameCol-1] || '').trim();
    if (!name) return;

    const studentClass = String(r[cols.classCol-1] || '').trim().toUpperCase();
    const status = String(r[colIndex-1] || '').trim() || 'Not Set';
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
