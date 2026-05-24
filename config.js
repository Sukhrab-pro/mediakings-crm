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
