// Baserow REST API адаптер
// Заменяет Google Sheets / Apps Script backend
// Интерфейс совместим с app.js (Airtable.getAll / create / update / remove)

// ════════════════════════════
// JWT TOKEN MANAGER
// ════════════════════════════

const JWTManager = {
  _access: null,
  _refresh: null,
  _expiresAt: 0,
  _initPromise: null,

  // Загрузка из localStorage
  _load() {
    try {
      const raw = localStorage.getItem('brw_jwt');
      if (!raw) return;
      const d = JSON.parse(raw);
      this._access  = d.access  || null;
      this._refresh = d.refresh || null;
      this._expiresAt = d.exp   || 0;
    } catch(e) { /* ignore */ }
  },

  // Сохранение в localStorage
  _save() {
    localStorage.setItem('brw_jwt', JSON.stringify({
      access:  this._access,
      refresh: this._refresh,
      exp:     this._expiresAt,
    }));
  },

  // Логин по email/password → access + refresh токены
  async _login() {
    const res = await fetch('https://api.baserow.io/api/user/token-auth/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:    CONFIG.BASEROW_EMAIL,
        password: CONFIG.BASEROW_PASSWORD,
      }),
    });
    if (!res.ok) throw new Error('Baserow JWT login failed: ' + res.status);
    const d = await res.json();
    this._access     = d.token || d.access_token;
    this._refresh    = d.refresh_token;
    this._expiresAt  = Date.now() + 9 * 60 * 1000; // 9 мин (токен живёт 10 мин)
    this._save();
  },

  // Обновление access токена по refresh токену
  async _doRefresh() {
    const res = await fetch('https://api.baserow.io/api/user/token-refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this._refresh }),
    });
    if (!res.ok) {
      // Refresh протух — перелогиниться
      await this._login();
      return;
    }
    const d = await res.json();
    this._access    = d.token || d.access_token;
    this._expiresAt = Date.now() + 9 * 60 * 1000;
    this._save();
  },

  // Инициализация при старте приложения
  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      this._load();
      // Если токен есть и не протух — оставляем
      if (this._access && Date.now() < this._expiresAt - 30000) return;
      // Если есть refresh — обновляем
      if (this._refresh) {
        try { await this._doRefresh(); return; } catch(e) { /* fall through to login */ }
      }
      // Полный логин
      await this._login();
    })().catch(e => {
      console.warn('JWT init failed, falling back to Database Token:', e.message);
      this._access = null;
    });
    return this._initPromise;
  },

  // Получить актуальный JWT заголовок
  async getAuthHeader() {
    // Автообновление если < 30 сек до истечения
    if (this._access && Date.now() > this._expiresAt - 30000) {
      try {
        if (this._refresh) await this._doRefresh();
        else await this._login();
      } catch(e) {
        this._access = null;
      }
    }
    if (this._access) return 'JWT ' + this._access;
    // Фолбек на Database Token
    return 'Token ' + CONFIG.BASEROW_TOKEN;
  },
};

// Запускаем инициализацию немедленно (не блокируем загрузку страницы)
JWTManager.init();

// ════════════════════════════
// ПОЛЯ И МАППИНГ ДЛЯ BASEROW
// ════════════════════════════

const ActiveFieldsCache = {};

const FIELD_MAPS = {
  toCRM: {
    get [CONFIG.TABLES.LEADS]() {
      return {
        'First Name':'Имя', 'Имя':'Имя',
        'Last Name':'Дата', 'Дата':'Дата',
        'Email':'Источник', 'Источник':'Источник',
        'Ниша':'Ниша',
        'Phone':'Телефон', 'Телефон':'Телефон',
        'Position':'Воронка', 'Воронка':'Воронка',
        'Company':'Клиент ID', 'Клиент ID':'Клиент ID',
        'Deals':'Проекты', 'Сделки':'Проекты', 'Проекты':'Проекты',
        'Activities':'Операции', 'Операции':'Операции',
        'Дата консультации':'Дата консультации',
        'Время консультации':'Время консультации',
        'Бюджет':'Бюджет',
        'Менеджер':'Менеджер',
        'Комментарий':'Комментарий',
        'Консультация проведена':'Консультация проведена',
        'Дата назначения':'Дата назначения',
        'Дата продажи':'Дата продажи',
        'Дата возврата':'Дата возврата',
        'Архивирован':'Архивирован',
        'Причина: Не целевой':'Причина: Не целевой',
        'Оплата':'Оплата',
        'Instagram':'Instagram',
        'Задачи':'Задачи',
        'История':'История',
        'Комментарии_Лог':'Комментарии_Лог',
        'Google_Event_ID':'Google_Event_ID',
      };
    },
    get [CONFIG.TABLES.CLIENTS]() {
      return {
        'Name':'Имя', 'Имя':'Имя', 'Имя клиента':'Имя',
        'Ниша':'Ниша',
        'Компания':'Компания',
        'Phone':'Телефон', 'Телефон':'Телефон', 'Телефон клиента':'Телефон',
        'Website':'Email', 'Email':'Email',
        'Address':'Статус', 'Статус':'Статус',
        'Дата создания':'Дата создания'
      };
    },
    get [CONFIG.TABLES.DEALS]() {
      return {
        'Название проекта':'Название проекта',
        'Статус проекта':'Статус работы', 'Статус сделки':'Статус работы', 'Статус работы':'Статус работы',
        'Дата создания':'Дата создания',
        'Клиент ID':'Клиент ID', 'Клиент':'Клиент',
        'Контакты ID':'Контакты ID',
        'Операции ID':'Операции ID', 'Операции':'Операции',
        'Сценариев':'Сценариев', 'Снято':'Снято', 'Смонтировано':'Смонтировано', 'Сторис':'Сторис',
        'Тариф ID':'Тариф ID', 'Тариф':'Тариф',
        'Сотрудник ID':'Сотрудник ID', 'Сотрудник':'Сотрудник',
        'Дата начала':'Дата начала',
        'Сроки заказа План':'Сроки заказа План',
        'Сроки заказа Факт':'Сроки заказа Факт',
        'Дата завершения':'Дата завершения',
        'Ссылка на Бриф':'Ссылка на Бриф',
        'Ссылка на сценарии':'Ссылка на сценарии',
        'Ссылка на Инстаграм':'Ссылка на Инстаграм',
        'Стоимость заказа':'Стоимость заказа',
        'Оплачено':'Оплачено',
        'Остаток долга':'Остаток долга',
        'Статус оплаты':'Статус оплаты',
        'Комментарий':'Комментарий',
        'Проджект ID':'Проджект ID', 'Проджект':'Проджект',
        'Заявка ID':'Заявка ID', 'Заявка':'Заявка',
      };
    },
    get [CONFIG.TABLES.OPERATIONS]() {
      return {
        'Activity':'Тип операции', 'Тип операции':'Тип операции',
        'Type':'Статус оплаты', 'Статус оплаты':'Статус оплаты',
        'Date':'Дата', 'Дата':'Дата',
        'Notes':'Проект', 'Проект':'Проект', 'Сделка':'Проект',
        'Deal':'Проект ID', 'Проект ID':'Проект ID', 'Сделка ID':'Проект ID',
        'Исполнитель':'Исполнитель ID', 'Исполнитель ID':'Исполнитель ID',
        'Кол-во':'Кол-во', 'Кол-во часов':'Кол-во часов'
      };
    },
    get [CONFIG.TABLES.EMPLOYEES]() {
      return {
        'Имя':'Имя',
        'Email':'Email',
        'Пароль':'Пароль',
        'Права доступа':'Роль',
        'Должность':'Должность',
        'Активный':'Активный',
        'Телефон':'Телефон'
      };
    },
    get [CONFIG.TABLES.PERMISSIONS]() {
      return {
        'Роль':'Роль',
        'Доступ: Лиды':'Доступ: Лиды',
        'Редактирование: Лиды':'Редактирование: Лиды',
        'Только свои Лиды':'Только свои Лиды',
        'Доступ: Клиенты':'Доступ: Клиенты',
        'Доступ: Проекты':'Доступ: Проекты',
        'Доступ: Операции':'Доступ: Операции',
        'Доступ: Финансы':'Доступ: Финансы',
        'Доступ: Отчеты':'Доступ: Отчеты',
        'Доступ: Настройки':'Доступ: Настройки',
        'Доступ: Календарь':'Доступ: Календарь'
      };
    },
    get [CONFIG.TABLES.TARIFFS]() {
      return {
        'Название':'Название', 'Стоимость':'Стоимость'
      };
    },
    get [CONFIG.TABLES.FINANCE_CATEGORIES]() {
      return {
        'Наименование': 'Наименование', 'Вкл': 'Вкл',
        'Отображать в расходах': 'Отображать в расходах',
        'Отображать в доходах': 'Отображать в доходах',
        'Синонимы': 'Синонимы', 'Лимиты': 'Лимиты',
        'Тип': 'Тип'
      };
    },
    get [CONFIG.TABLES.FINANCE_ACCOUNTS]() {
      return {
        'Наименование': 'Наименование', 'Вкл': 'Вкл', 'Основной': 'Основной',
        'Синонимы': 'Синонимы', 'Начальное значение': 'Начальное значение',
        'Баланс счета': 'Баланс счета', 'Комиссия с расходов, %': 'Комиссия с расходов, %',
        'Автосписание комиссии с расходов': 'Автосписание комиссии с расходов',
        'Комиссия с доходов, %': 'Комиссия с доходов, %',
        'Автосписание комиссии с доходов': 'Автосписание комиссии с доходов',
        'Валюта': 'Валюта'
      };
    },
    get [CONFIG.TABLES.FINANCE_INCOMES]() {
      return {
        'ID транзакции': 'ID транзакции', 'Дата транзакции': 'Дата транзакции',
        'Источник': 'Источник', 'Категория': 'Категория',
        'Сумма': 'Сумма', 'Цена тарифа': 'Цена тарифа', 'Примечание': 'Примечание',
        'Кто добавил': 'Кто добавил', 'Дата добавления': 'Дата добавления', 'Валюта': 'Валюта',
        'Клиент': 'Клиент', 'Менеджер': 'Менеджер', 'Заказ': 'Заказ', 'Партнер': 'Партнер'
      };
    },
    get [CONFIG.TABLES.FINANCE_EXPENSES]() {
      return {
        'ID транзакции': 'ID транзакции', 'Дата транзакции': 'Дата транзакции', 'Бюджет': 'Бюджет',
        'Источник': 'Источник', 'Категория': 'Категория', 'Сумма': 'Сумма',
        'Примечание': 'Примечание', 'Кто добавил': 'Кто добавил', 'Дата добавления': 'Дата добавления',
        'Валюта': 'Валюта', 'Сотрудник': 'Сотрудник', 'Заказ': 'Заказ'
      };
    },
    get [CONFIG.TABLES.MARKETING]() {
      return {
        'Name': 'Имя', 'Имя': 'Имя',
        'Дата': 'Дата',
        'Расход': 'Расход',
        'Показы': 'Показы',
        'Клики': 'Клики',
        'Аккаунт': 'Аккаунт'
      };
    },
    get [CONFIG.TABLES.CALLS]() {
      return {
        'Name': 'Имя', 'Имя': 'Имя',
        'Дата': 'Дата',
        'Менеджер': 'Менеджер',
        'Ссылка на запись': 'Ссылка на запись',
        'Оценка': 'Оценка',
        'Аудит': 'Аудит',
        'Транскрипт': 'Транскрипт',
        'Лиды': 'Лиды',
        'Лиды ID': 'Лиды ID'
      };
    }
  },
  toBaserow: {
    get [CONFIG.TABLES.LEADS]() {
      return {
        'Имя':'First Name', 'Дата':'Last Name', 'Источник':'Email', 'Ниша':'Ниша', 'Телефон':'Phone', 'Воронка':'Воронка',
        'Клиент ID':'Company', 'Проекты ID':'Deals', 'Сделки ID':'Deals', 'Операции ID':'Activities',
        'Бюджет':'Бюджет', 'Менеджер':'Менеджер', 'Комментарий':'Комментарий',
        'Консультация проведена':'Консультация проведена',
        'Дата назначения':'Дата назначения', 'Дата продажи':'Дата продажи', 'Дата возврата':'Дата возврата',
        'Архивирован':'Архивирован',
        'Причина: Не целевой':'Причина: Не целевой',
        'Ссылка на запись':'Ссылка на запись',
        'Оплата':'Оплата',
        'Instagram':'Instagram',
        'Задачи':'Задачи',
        'История':'История',
        'Комментарии_Лог':'Комментарии_Лог',
        'Google_Event_ID':'Google_Event_ID',
      };
    },
    get [CONFIG.TABLES.CLIENTS]() {
      return {
        'Имя':'Имя клиента', 'Ниша':'Ниша', 'Компания':'Компания', 'Телефон':'Телефон клиента', 'Email':'Email', 'Статус':'Статус'
      };
    },
    get [CONFIG.TABLES.DEALS]() {
      return {
        'Название проекта':'Название проекта',
        'Статус работы':'Статус проекта',
        'Дата создания':'Дата создания',
        'Клиент ID':'Клиент', 'Операции ID':'Операции',
        'Сценариев':'Сценариев', 'Снято':'Снято', 'Смонтировано':'Смонтировано', 'Сторис':'Сторис',
        'Тариф ID':'Тариф', 'Сотрудник ID':'Сотрудник',
        'Дата начала':'Дата начала',
        'Сроки заказа План':'Сроки заказа План',
        'Сроки заказа Факт':'Сроки заказа Факт',
        'Дата завершения':'Дата завершения',
        'Ссылка на Бриф':'Ссылка на Бриф',
        'Ссылка на сценарии':'Ссылка на сценарии',
        'Ссылка на Инстаграм':'Ссылка на Инстаграм',
        'Стоимость заказа':'Стоимость заказа',
        'Оплачено':'Оплачено',
        'Статус оплаты':'Статус оплаты',
        'Комментарий':'Комментарий',
        'Проджект ID':'Проджект',
        'Заявка ID':'Заявка',
      };
    },
    get [CONFIG.TABLES.OPERATIONS]() {
      return {
        'Тип операции':'Activity', 'Статус оплаты':'Type', 'Дата':'Date', 'Проект':'Notes',
        'Проект ID':'Deal', 'Исполнитель ID':'Исполнитель',
        'Кол-во':'Кол-во', 'Кол-во часов':'Кол-во часов'
      };
    },
    get [CONFIG.TABLES.EMPLOYEES]() {
      return {
        'Имя':'Имя',
        'Email':'Email',
        'Пароль':'Пароль',
        'Роль':'Права доступа',
        'Должность':'Должность',
        'Активный':'Активный',
        'Телефон':'Телефон'
      };
    },
    get [CONFIG.TABLES.PERMISSIONS]() {
      return {
        'Роль':'Роль',
        'Доступ: Лиды':'Доступ: Лиды',
        'Редактирование: Лиды':'Редактирование: Лиды',
        'Только свои Лиды':'Только свои Лиды',
        'Доступ: Клиенты':'Доступ: Клиенты',
        'Доступ: Проекты':'Доступ: Проекты',
        'Доступ: Операции':'Доступ: Операции',
        'Доступ: Финансы':'Доступ: Финансы',
        'Доступ: Отчеты':'Доступ: Отчеты',
        'Доступ: Настройки':'Доступ: Настройки',
        'Доступ: Календарь':'Доступ: Календарь'
      };
    },
    get [CONFIG.TABLES.TARIFFS]() {
      return {
        'Название':'Название', 'Стоимость':'Стоимость'
      };
    },
    get [CONFIG.TABLES.FINANCE_CATEGORIES]() {
      return {
        'Наименование': 'Наименование', 'Вкл': 'Вкл',
        'Отображать в расходах': 'Отображать в расходах',
        'Отображать в доходах': 'Отображать в доходах',
        'Синонимы': 'Синонимы', 'Лимиты': 'Лимиты',
        'Тип': 'Тип'
      };
    },
    get [CONFIG.TABLES.FINANCE_ACCOUNTS]() {
      return {
        'Наименование': 'Наименование', 'Вкл': 'Вкл', 'Основной': 'Основной',
        'Синонимы': 'Синонимы', 'Начальное значение': 'Начальное значение',
        'Баланс счета': 'Баланс счета', 'Комиссия с расходов, %': 'Комиссия с расходов, %',
        'Автосписание комиссии с расходов': 'Автосписание комиссии с расходов',
        'Комиссия с доходов, %': 'Комиссия с доходов, %',
        'Автосписание комиссии с доходов': 'Автосписание комиссии с доходов',
        'Валюта': 'Валюта'
      };
    },
    get [CONFIG.TABLES.FINANCE_INCOMES]() {
      return {
        'ID транзакции': 'ID транзакции', 'Дата транзакции': 'Дата транзакции',
        'Источник ID': 'Источник', 'Категория ID': 'Категория',
        'Сумма': 'Сумма', 'Цена тарифа': 'Цена тарифа', 'Примечание': 'Примечание',
        'Кто добавил': 'Кто добавил', 'Дата добавления': 'Дата добавления', 'Валюта': 'Валюта',
        'Клиент ID': 'Клиент', 'Менеджер ID': 'Менеджер', 'Заказ ID': 'Проект', 'Партнер': 'Партнер',
        'Лид ID': 'Лид ID'
      };
    },
    get [CONFIG.TABLES.FINANCE_EXPENSES]() {
      return {
        'ID транзакции': 'ID транзакции', 'Дата транзакции': 'Дата транзакции', 'Бюджет': 'Бюджет',
        'Источник ID': 'Источник', 'Категория ID': 'Категория', 'Сумма': 'Сумма',
        'Примечание': 'Примечание', 'Кто добавил': 'Кто добавил', 'Дата добавления': 'Дата добавления',
        'Валюта': 'Валюта', 'Сотрудник ID': 'Сотрудник', 'Заказ ID': 'Проект',
        'Лид ID': 'Лид ID'
      };
    },
    get [CONFIG.TABLES.MARKETING]() {
      return {
        'Имя': 'Name',
        'Дата': 'Дата',
        'Расход': 'Расход',
        'Показы': 'Показы',
        'Клики': 'Клики',
        'Аккаунт': 'Аккаунт'
      };
    },
    get [CONFIG.TABLES.CALLS]() {
      return {
        'Имя': 'Name',
        'Дата': 'Дата',
        'Менеджер': 'Менеджер',
        'Ссылка на запись': 'Ссылка на запись',
        'Оценка': 'Оценка',
        'Аудит': 'Аудит',
        'Транскрипт': 'Транскрипт',
        'Лиды': 'Лиды',
        'Лиды ID': 'Лиды'
      };
    }
  },
};

// Нормализация строки Baserow → {id, fields} с CRM именами полей
function normalizeRow(row, tableId) {
  const map = FIELD_MAPS.toCRM[tableId] || {};
  const { id, order, ...rest } = row;
  const fields = {};
  for (const [k, v] of Object.entries(rest)) {
    const crmKey = map[k] || k;
    
    if (Array.isArray(v)) {
      if (v.length > 0 && typeof v[0] === 'object' && 'id' in v[0]) {
        // Связанная строка (link_row)
        const names = v.map(x => x.value).filter(Boolean).join(', ');
        const ids = v.map(x => String(x.id)).filter(Boolean).join(', ');
        fields[crmKey] = names;
        fields[crmKey + ' ID'] = ids;
      } else {
        // Обычный массив
        fields[crmKey] = v.filter(Boolean).join(', ');
      }
    } else {
      // single_select или другие типы объектов
      const val = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
      if (val === null || val === undefined || val === '') continue;
      fields[crmKey] = val;
    }
  }
  return { id: String(id), fields };
}

// Денормализация: CRM поля → Baserow поля (с учетом кэша активных колонок)
function denormalizeFields(fields, tableId) {
  const map = FIELD_MAPS.toBaserow[tableId] || {};
  const activeFields = ActiveFieldsCache[tableId] || [];
  const result = {};
  for (const [k, v] of Object.entries(fields)) {
    let brKey = null;
    
    // 1. Поиск ключа Baserow
    if (activeFields.length > 0) {
      if (activeFields.includes(k)) {
        brKey = k;
      } else {
        const mappedKey = map[k];
        if (mappedKey) {
          // Если поле есть в статическом маппинге — включаем его всегда.
          // Это важно для полей, которые имеют null у всех строк и не вошли в кэш
          // (например, новое поле "Причина отказа" при первой загрузке).
          brKey = mappedKey;
        } else {
          continue; // Поле не в маппинге и не в кэше — пропускаем
        }
      }
    } else {
      // 2. Фолбек к статическому маппингу
      brKey = map[k] || k;
    }
    
    // Fields that can be explicitly set to null (e.g. to clear a single_select)
    const nullableFields = [
      'Причина: Не целевой', 'Бюджет', 'Ссылка на запись', 'Оплата', 'Instagram',
      'Задачи', 'История', 'Комментарии_Лог', 'Google_Event_ID',
      // Project fields
      'Стоимость заказа', 'Оплачено',
      'Дата начала', 'Сроки заказа План', 'Сроки заказа Факт', 'Дата завершения',
      'Ссылка на Бриф', 'Ссылка на сценарии', 'Ссылка на Инстаграм',
    ];
    if (v === null || v === undefined) {
      if (nullableFields.includes(brKey)) result[brKey] = null;
      continue;
    }

    // 3. Форматирование связей (link_row) в массив целых чисел
    const boolFields = ['Консультация проведена'];
    const isLinkRow = !boolFields.includes(brKey) && (k.endsWith(' ID') || ['Company', 'Contact', 'Deals', 'Activities', 'Deal', 'Employee', 'Исполнитель', 'Тариф', 'Сотрудник', 'Менеджер', 'Этап', 'Воронка', 'Права доступа'].includes(brKey));

    if (isLinkRow) {
      if (Array.isArray(v)) {
        result[brKey] = v.map(x => parseInt(x, 10)).filter(Number.isInteger);
      } else if (typeof v === 'string' && v.trim() !== '') {
        result[brKey] = v.split(',').map(x => parseInt(x.trim(), 10)).filter(Number.isInteger);
      } else if (Number.isInteger(v)) {
        result[brKey] = [v];
      } else if (typeof v === 'number') {
        result[brKey] = [Math.floor(v)];
      }
    } else {
      result[brKey] = v;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

const Baserow = {
  async req(method, path, body = null) {
    const authHeader = await JWTManager.getAuthHeader();
    const res = await fetch('https://api.baserow.io/api' + path, {
      method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Если 401 — токен мог протухнуть между запросами, обновляем и повторяем
    if (res.status === 401) {
      try {
        await JWTManager._login();
        const retryAuth = await JWTManager.getAuthHeader();
        const retry = await fetch('https://api.baserow.io/api' + path, {
          method,
          headers: { 'Authorization': retryAuth, 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (retry.status === 204) return {};
        const retryJson = await retry.json();
        if (!retry.ok) throw new Error(retryJson.detail || retryJson.error || 'Ошибка ' + retry.status);
        return retryJson;
      } catch(e) {
        throw new Error('Авторизация потеряна: ' + e.message);
      }
    }

    if (res.status === 204) return {};
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || json.error || 'Ошибка ' + res.status);
    return json;
  },

  // Получить все строки (автопагинация)
  async getAll(tableId) {
    if (!tableId) return [];
    const rows = [];
    let page = 1;
    for (;;) {
      const d = await Baserow.req('GET',
        `/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}`);
      
      // Заполняем кэш активных полей при первом запросе
      if (page === 1 && d.results && d.results.length > 0) {
        const sample = d.results[0];
        ActiveFieldsCache[tableId] = Object.keys(sample).filter(k => k !== 'id' && k !== 'order');
      }
      
      rows.push(...d.results.map(r => normalizeRow(r, tableId)));
      if (!d.next) break;
      page++;
    }
    return rows;
  },

  // Получить одну страницу (для синхронизации)
  async getPage(tableId, page = 1, size = 200) {
    if (!tableId) return { results: [], next: null };
    const d = await Baserow.req('GET',
      `/database/rows/table/${tableId}/?user_field_names=true&size=${size}&page=${page}`);
    return {
      results: (d.results || []).map(r => normalizeRow(r, tableId)),
      next: d.next || null,
    };
  },

  // Создать строку
  async create(tableId, fields) {
    if (!tableId) return { records: [] };
    const body = denormalizeFields(fields, tableId);
    if (!body) return { records: [{ id: 'tmp_' + Date.now(), fields }] };
    const row = await Baserow.req('POST',
      `/database/rows/table/${tableId}/?user_field_names=true`, body);
    return { records: [normalizeRow(row, tableId)] };
  },

  // Обновить строку
  async update(tableId, id, fields) {
    if (!tableId || !id) return {};
    const body = denormalizeFields(fields, tableId);
    if (!body) return {};
    return Baserow.req('PATCH',
      `/database/rows/table/${tableId}/${id}/?user_field_names=true`, body);
  },

  // Обновить строки пакетом (batch update)
  async batchUpdate(tableId, items) {
    if (!tableId || !items || !items.length) return { records: [] };
    const baserowItems = [];
    for (const item of items) {
      const body = denormalizeFields(item.fields, tableId);
      if (body) {
        baserowItems.push({
          id: parseInt(item.id, 10),
          ...body
        });
      }
    }
    if (baserowItems.length === 0) return { records: [] };
    const BATCH_SIZE = 150;
    const results = [];
    for (let i = 0; i < baserowItems.length; i += BATCH_SIZE) {
      const chunk = baserowItems.slice(i, i + BATCH_SIZE);
      const res = await Baserow.req('PATCH',
        `/database/rows/table/${tableId}/batch/?user_field_names=true`,
        { items: chunk }
      );
      if (res && res.items) {
        results.push(...res.items.map(r => normalizeRow(r, tableId)));
      }
    }
    return { records: results };
  },

  // Удалить строку
  async remove(tableId, id) {
    if (!tableId || !id) return {};
    return Baserow.req('DELETE', `/database/rows/table/${tableId}/${id}/`);
  },

  // Получить схему полей таблицы (только JWT)
  async getSchema(tableId) {
    if (!tableId) return [];
    try {
      const d = await Baserow.req('GET', `/database/fields/table/${tableId}/`);
      return Array.isArray(d) ? d : (d.results || []);
    } catch(e) {
      console.warn('getSchema failed:', e.message);
      return [];
    }
  },

  // Получить все рабочие пространства (только JWT)
  async getWorkspaces() {
    return Baserow.req('GET', '/workspaces/');
  },

  // Найти сотрудника по Email
  async findEmployeeByEmail(email) {
    const emps = await Baserow.getAll(CONFIG.TABLES.EMPLOYEES);
    const cleanEmail = String(email || '').trim().toLowerCase();
    return emps.find(e => String(e.fields['Email'] || '').trim().toLowerCase() === cleanEmail) || null;
  },

  // Получить права для роли
  async getRolePermissions(roleName) {
    if (!roleName) return null;
    try {
      const perms = await Baserow.getAll(CONFIG.TABLES.PERMISSIONS);
      const cleanRole = String(roleName || '').trim().toLowerCase();
      const found = perms.find(p => String(p.fields['Роль'] || '').trim().toLowerCase() === cleanRole);
      if (found) return found.fields;
    } catch(e) {
      console.warn('Failed to fetch role permissions from Baserow:', e.message);
    }
    return null;
  },

  // Создать строки пакетом (batch create)
  async batchCreate(tableId, items) {
    if (!tableId || !items || !items.length) return { records: [] };
    const baserowItems = [];
    for (const fields of items) {
      const body = denormalizeFields(fields, tableId);
      if (body) {
        baserowItems.push(body);
      }
    }
    if (baserowItems.length === 0) return { records: [] };
    const BATCH_SIZE = 150;
    const results = [];
    for (let i = 0; i < baserowItems.length; i += BATCH_SIZE) {
      const chunk = baserowItems.slice(i, i + BATCH_SIZE);
      const res = await Baserow.req('POST',
        `/database/rows/table/${tableId}/batch/?user_field_names=true`,
        { items: chunk }
      );
      if (res && res.items) {
        results.push(...res.items.map(r => normalizeRow(r, tableId)));
      }
    }
    return { records: results };
  },

  // Удалить строки пакетом (batch delete)
  async batchDelete(tableId, ids) {
    if (!tableId || !ids || !ids.length) return {};
    const numericIds = ids.map(id => parseInt(id, 10)).filter(Number.isInteger);
    if (numericIds.length === 0) return {};
    const BATCH_SIZE = 150;
    for (let i = 0; i < numericIds.length; i += BATCH_SIZE) {
      const chunk = numericIds.slice(i, i + BATCH_SIZE);
      await Baserow.req('POST',
        `/database/rows/table/${tableId}/batch-delete/`,
        { items: chunk }
      );
    }
    return {};
  },
};

// Алиас для совместимости с app.js
const Airtable = Baserow;
