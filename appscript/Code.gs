// ═══════════════════════════════════════════════════════════
// MediaKings CRM — Google Apps Script API
// Деплой: Extensions → Apps Script → Deploy → Web app
//   Execute as: Me | Who has access: Anyone
// После деплоя запусти initSheets() один раз
// ═══════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1Jwiu0Kd49tCiJY26naZ_JV4o1zCykaWjPAfiWHwpGlc';
const API_KEY = 'mk2024';

function doGet(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  try {
    const p = e.parameter;
    if (p.key !== API_KEY) throw new Error('Unauthorized');
    const data = p.data ? JSON.parse(p.data) : null;
    let result;
    switch (p.action) {
      case 'list':        result = listRecords(p.table);                         break;
      case 'create':      result = createRecord(p.table, data);                  break;
      case 'update':      result = updateRecord(p.table, p.id, data);            break;
      case 'delete':      result = deleteRecord(p.table, p.id);                  break;
      case 'createEvent': result = createCalendarEvent(p.title, p.date, p.time, p.desc); break;
      case 'updateEvent': result = updateCalendarEvent(p.eventId, p.title, p.date, p.time, p.desc); break;
      case 'deleteEvent': result = deleteCalendarEvent(p.eventId); break;
      case 'init':            result = { message: initSheets() };                    break;
      case 'getFinanceData':  result = getFinanceData(p.sheet);                     break;
      default: throw new Error('Unknown action: ' + p.action);
    }
    output.setContent(JSON.stringify(result));
  } catch(err) {
    output.setContent(JSON.stringify({ error: err.message }));
  }
  return output;
}

// ─── Google Calendar
function createCalendarEvent(title, date, time, desc) {
  if (!date || !time) throw new Error('Не указана дата или время');
  const start = parseDateTime(date, time);
  const end   = new Date(start.getTime() + 60 * 60 * 1000); // 1 час по умолчанию
  const cal   = CalendarApp.getDefaultCalendar();
  const event = cal.createEvent(title || 'Консультация', start, end, {
    description: desc || ''
  });
  return { success: true, eventId: event.getId(), title: event.getTitle() };
}

function updateCalendarEvent(eventId, title, date, time, desc) {
  if (!eventId) throw new Error('Не указан ID события (eventId)');
  if (!date || !time) throw new Error('Не указана дата или время');
  const start = parseDateTime(date, time);
  const end   = new Date(start.getTime() + 60 * 60 * 1000);
  const cal   = CalendarApp.getDefaultCalendar();
  
  try {
    const event = cal.getEventById(eventId);
    if (!event) {
      // Если событие было удалено вручную, пересоздаем его
      return createCalendarEvent(title, date, time, desc);
    }
    event.setTitle(title || 'Консультация');
    event.setTime(start, end);
    event.setDescription(desc || '');
    return { success: true, eventId: event.getId(), title: event.getTitle() };
  } catch (err) {
    // В случае ошибок поиска (например, неверный ID), пробуем создать новое
    return createCalendarEvent(title, date, time, desc);
  }
}

function deleteCalendarEvent(eventId) {
  if (!eventId) throw new Error('Не указан ID события (eventId)');
  const cal   = CalendarApp.getDefaultCalendar();
  try {
    const event = cal.getEventById(eventId);
    if (event) {
      event.deleteEvent();
    }
  } catch (err) {
    // Игнорируем ошибку удаления, если событие уже стёрто
  }
  return { success: true };
}

function parseDateTime(dateStr, timeStr) {
  let year, month, day;
  if (dateStr.indexOf('.') > -1) {
    const parts = dateStr.split('.').map(Number); // DD.MM.YYYY
    year = parts[2];
    month = parts[1] - 1;
    day = parts[0];
  } else {
    const parts = dateStr.split('-').map(Number); // YYYY-MM-DD
    year = parts[0];
    month = parts[1] - 1;
    day = parts[2];
  }
  const timeParts = timeStr.split(':').map(Number);
  return new Date(year, month, day, timeParts[0], timeParts[1], 0);
}

// ─── Sheet helpers
function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Лист не найден: ' + name);
  return sheet;
}

function listRecords(tableName) {
  const sheet = getSheet(tableName);
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return { records: [] };
  const headers  = data[0].map(h => String(h).trim());
  const hasIdCol = headers[0].toUpperCase() === 'ID';
  const records  = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.every(v => v === '' || v === null || v === undefined)) continue;
    const id = hasIdCol ? String(row[0]) : 'row_' + (i + 1);
    if (hasIdCol && !row[0]) continue;
    const fields = {};
    const start  = hasIdCol ? 1 : 0;
    for (let j = start; j < headers.length; j++) {
      if (!headers[j]) continue;
      const val = row[j];
      fields[headers[j]] = val instanceof Date
        ? Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm')
        : (val !== undefined && val !== null ? val : '');
    }
    records.push({ id, fields });
  }
  return { records };
}

function findRowById(sheet, id) {
  const ids = sheet.getRange('A:A').getValues().flat();
  for (let i = 1; i < ids.length; i++) {
    if (String(ids[i]) === String(id)) return i + 1;
  }
  return -1;
}

function createRecord(tableName, fields) {
  const sheet   = getSheet(tableName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const hasIdCol = headers[0].toUpperCase() === 'ID';
  if (hasIdCol) {
    const newId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    const row   = [newId];
    for (let j = 1; j < headers.length; j++) {
      row.push(fields[headers[j]] !== undefined ? fields[headers[j]] : '');
    }
    sheet.appendRow(row);
    return { records: [{ id: newId, fields }] };
  } else {
    const row = headers.map(h => (fields[h] !== undefined ? fields[h] : ''));
    sheet.appendRow(row);
    const newRowIdx = sheet.getLastRow();
    return { records: [{ id: 'row_' + newRowIdx, fields }] };
  }
}

function updateRecord(tableName, id, fields) {
  const sheet   = getSheet(tableName);
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const hasIdCol = headers[0].toUpperCase() === 'ID';
  let rowIdx;
  if (hasIdCol) {
    rowIdx = findRowById(sheet, id);
    if (rowIdx === -1) throw new Error('Запись не найдена: ' + id);
  } else {
    rowIdx = parseInt(String(id).replace('row_', ''), 10);
    if (isNaN(rowIdx)) throw new Error('Неверный ID: ' + id);
  }
  const start = hasIdCol ? 1 : 0;
  // Auto-add missing columns then write values
  for (const [key, val] of Object.entries(fields)) {
    if (!key) continue;
    let colIdx = headers.indexOf(key);
    if (colIdx === -1) {
      // Column doesn't exist — append it to the header row
      colIdx = headers.length;
      headers.push(key);
      sheet.getRange(1, colIdx + 1).setValue(key);
    }
    if (colIdx >= start) {
      sheet.getRange(rowIdx, colIdx + 1).setValue(val);
    }
  }
  return { id, fields };
}

function deleteRecord(tableName, id) {
  const sheet   = getSheet(tableName);
  const headers = sheet.getRange(1, 1, 1, 1).getValues()[0].map(h => String(h).trim());
  const hasIdCol = headers[0].toUpperCase() === 'ID';
  let rowIdx;
  if (hasIdCol) {
    rowIdx = findRowById(sheet, id);
    if (rowIdx === -1) throw new Error('Запись не найдена: ' + id);
  } else {
    rowIdx = parseInt(String(id).replace('row_', ''), 10);
    if (isNaN(rowIdx)) throw new Error('Неверный ID: ' + id);
  }
  sheet.deleteRow(rowIdx);
  return { deleted: true, id };
}

// ─── Финансовая синхронизация из ФИНАНСЫ МК
const FINANCE_SPREADSHEET_ID = '15X7TEZIvJWG0xcS-UlmDWFOr8TbxddezAPcSwTgxuGY';

function getFinanceData(sheetName) {
  const ss = SpreadsheetApp.openById(FINANCE_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName || 'Доходы');
  if (!sheet) throw new Error('Лист не найден: ' + sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { rows: [] };
  const headers = data[0].map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const val = row[j];
      obj[headers[j]] = val instanceof Date
        ? Utilities.formatDate(val, 'Asia/Almaty', 'yyyy-MM-dd')
        : (val !== undefined && val !== null ? String(val) : '');
    }
    rows.push(obj);
  }
  return { rows, count: rows.length };
}

// ─── Init sheets
function initSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const schemas = {
    'Клиенты':    ['ID','Имя','Ниша','Телефон','Email','Статус','Дата создания'],
    'Сделки':     ['ID','Название сделки','Клиент ID','Клиент','Ниша клиента','Тариф','Статус сделки','Сценариев','Снято','Смонтировано','Сторис','Дата создания'],
    'Операции':   ['ID','Тип операции','Сделка ID','Сделка','Исполнитель ID','Исполнитель','Кол-во','Кол-во часов','Статус оплаты','Дата'],
    'Сотрудники': ['ID','Имя','Роль','Телефон','Активный'],
    'Тарифы':     ['ID','Название тарифа','Описание','Цена'],
  };
  const created = [];
  for (const [name, headers] of Object.entries(schemas)) {
    if (ss.getSheetByName(name)) continue;
    const s = ss.insertSheet(name);
    const range = s.getRange(1, 1, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight('bold');
    range.setBackground('#1e293b');
    range.setFontColor('#818cf8');
    s.setFrozenRows(1);
    headers.forEach((_, i) => s.autoResizeColumn(i + 1));
    created.push(name);
  }
  return created.length ? 'Созданы листы: ' + created.join(', ') : 'Все листы уже существуют';
}
