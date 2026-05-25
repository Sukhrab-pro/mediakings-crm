// Конфигурация MediaKings CRM — Baserow backend
const CONFIG = {
  // Baserow Database Token (фолбек для CRUD)
  BASEROW_TOKEN: 'zXm3mufAkgSGklcvBT5lMFWheayIrFwM',

  // Baserow JWT (полный доступ — схема + данные)
  BASEROW_EMAIL: 'skazhicho@gmail.com',
  BASEROW_PASSWORD: '@190891Dmy',

  // Google Apps Script — только для Google Календаря
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxK1NV50o8lV-3QkBtUPI0r8nhhiEySoZosFN7VxeKpddn0MBxgPyd_52PomCcYeHMQLQ/exec',
  API_KEY: 'mk2024',

  // Baserow таблицы (database 447885)
  TABLES: { LEADS:      991622,  // Contacts → Лиды
    CLIENTS:    991338,  // Companies → Клиенты
    DEALS:      991341,  // Deals → Сделки
    OPERATIONS: 991342,  // Activities → Операции
    EMPLOYEES:  991339,
    TARIFFS:    991340,
    PIPELINES:  991927,
    STAGES:     991928,
    SERVICES:   992401,
    PERMISSIONS: 993580,
    FINANCE_CATEGORIES: 992640,
    FINANCE_ACCOUNTS:   992641,
    FINANCE_INCOMES:    992642,
    FINANCE_EXPENSES:   992643
  },

  // CRM поля (после нормализации)
  LEAD_FIELDS: {
    name:   ['Имя'],
    phone:  ['Телефон'],
    stage:  ['Воронка'],
    date:   ['Дата'],
    source: ['Источник'],
  }
};

// Глобальные хелперы для работы с датами и текущим пользователем во избежание сбоев локали на разных устройствах
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDateTimeString(d = new Date()) {
  const todayStr = getLocalDateString(d);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${todayStr}T${hh}:${mm}`;
}

function getCRMCurrentUser() {
  const activeUser = localStorage.getItem('crm_current_user');
  if (activeUser) return activeUser;
  
  try {
    const user = JSON.parse(localStorage.getItem('crm_user') || 'null');
    return user ? user.name : '';
  } catch (e) {
    return '';
  }
}

// Разбор строки даты (поддерживает DD.MM.YYYY и YYYY-MM-DD)
function parseDateStr(str) {
  if (!str) return null;
  let m = String(str).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  m = String(str).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  const d = new Date(str); return isNaN(d) ? null : d;
}

// Проверка совпадения дат в формате YYYY-MM-DD
function isSameDay(dateStr, targetYmd) {
  if (!dateStr) return false;
  const d = parseDateStr(dateStr);
  if (!d) return false;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}` === targetYmd;
}


