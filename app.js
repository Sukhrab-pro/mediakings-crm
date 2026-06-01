// === ERP CORE INITIALIZATION & UTILITIES ===
// ─── State
const State = {
  leads: [], clients: [], deals: [], employees: [], tariffs: [], operations: [], calls: [],
  pipelines: [], stages: [],
  currentPipelineId: localStorage.getItem('currentPipelineId') || null,
  currentPage: 'leads',
  showArchived: false,
  columnSorting: JSON.parse(localStorage.getItem('crm_column_sorting') || '{}'),
  
  // Фильтры лидов
  filterSearch: '',
  filterManager: '',
  filterDateType: '', // 'assign' | 'consult' | ''
  filterDate: '',     // 'YYYY-MM-DD' | ''

  // Фильтры показателей (статистики)
  statsPeriod: 'this_week', // 'today' | 'this_week' | 'last_week' | 'month' | 'custom'
  statsCustomFrom: '',      // 'YYYY-MM-DD'
  statsCustomTo: '',        // 'YYYY-MM-DD'

  // Финансы
  financeIncomes: [],
  financeExpenses: [],
  financeAccounts: [],
  financeCategories: [],
  financePeriod: 'all',
  financeTab: 'incomes',
  financeSearch: '',
  financeSelectedAccount: null
};

const SelectionState = {
  active: false,
  column: null,
  selectedIds: new Set()
};

let DEFAULT_FUNNEL_STAGES = [
  { key: 'Новая заявка',             color: '#6366f1', group: 'main' },
  { key: 'В обработке (3 касания)',  color: '#8b5cf6', group: 'main' },
  { key: 'Консультация назначена',   color: '#3b82f6', group: 'main' },
  { key: 'КП на рассмотрении',       color: '#f59e0b', group: 'main' },
  { key: 'Договор на рассмотрении',  color: '#f97316', group: 'main' },
  { key: 'Связаться позднее',        color: '#64748b', group: 'main' },
  { key: 'На прогрев',               color: '#94a3b8', group: 'reject' },
  { key: 'Не обработано',            color: '#475569', group: 'reject' },
  { key: 'Не целевой',               color: '#64748b', group: 'reject' },
  { key: 'Продано',                  color: '#22c55e', group: 'sold',   blocked: true },
  { key: 'Возвраты',                 color: '#ef4444', group: 'refund', blocked: true },
];

Object.defineProperty(window, 'FUNNEL_STAGES', {
  get() {
    if (!State.currentPipelineId || !State.stages || State.stages.length === 0) {
      return DEFAULT_FUNNEL_STAGES;
    }
    const colorMap = {
      'indigo': '#6366f1',
      'purple': '#8b5cf6',
      'blue': '#3b82f6',
      'orange': '#f59e0b',
      'gray': '#64748b',
      'light-blue': '#94a3b8',
      'red': '#ef4444',
      'green': '#22c55e'
    };
    return State.stages
      .filter(s => {
        const pipeId = s.fields['Воронка ID'] || (Array.isArray(s.fields['Воронка']) ? s.fields['Воронка'][0] : s.fields['Воронка']);
        return String(pipeId || '') === String(State.currentPipelineId);
      })
      .map(s => ({
        id: s.id,
        key: s.fields['Название'] || '',
        color: colorMap[s.fields['Цвет']] || s.fields['Цвет'] || '#64748b',
        group: s.fields['Группа'] || 'main',
        blocked: !!s.fields['Заблокирован']
      }));
  },
  configurable: true
});

const MANAGER_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
function getManagerColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return MANAGER_COLORS[Math.abs(h) % MANAGER_COLORS.length];
}

const DragState = { leadId: null, fromStage: null };
let _justDropped = false;
let _refreshTimer = null;

// ─── Автообновление (30 секунд) — синх с Google Sheets
function startAutoRefresh() {
  stopAutoRefresh();
  _refreshTimer = setInterval(async () => {
    // Не обновляем во время перетаскивания карточки
    if (DragState.leadId) return;
    try {
      const leads = await Airtable.getAll(CONFIG.TABLES.LEADS);
      State.leads = leads;
      renderKanban(leads);
      renderLeadsStats();
    } catch(e) { /* тихо игнорируем ошибку обновления */ }
  }, 30000);
}
function stopAutoRefresh() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

// ─── Field helpers
function getField(fields, keys) {
  for (const k of keys) {
    if (k in fields && fields[k] !== '' && fields[k] !== null && fields[k] !== undefined)
      return fields[k];
  }
  return '';
}
function getStageFieldName(fields) {
  for (const k of CONFIG.LEAD_FIELDS.stage) { if (k in fields) return k; }
  return 'Воронка';
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(val) {
  if (!val) return '';
  const s = String(val);
  if (/^\d{2}\.\d{2}/.test(s)) return s.substring(0,10);
  const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('ru-RU');
}
function parseLeadDate(lead) {
  if (!lead) return null;
  const raw = lead.fields['Дата'] || '';
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1]);
  const d = new Date(raw); return isNaN(d) ? null : d;
}
function setColumnSort(stageKey, sortType) {
  closeAllDropdownMenus();
  if (sortType === 'default') {
    delete State.columnSorting[stageKey];
  } else {
    State.columnSorting[stageKey] = sortType;
  }
  localStorage.setItem('crm_column_sorting', JSON.stringify(State.columnSorting));
  renderKanban(State.leads);
}

// ─── Sidebar toggle
function toggleSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const layout  = document.querySelector('.app-layout');
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('collapsed');
  if (layout) layout.classList.toggle('sidebar-collapsed', isCollapsed);
  document.documentElement.setAttribute('data-sb', isCollapsed ? 'collapsed' : 'expanded');
  localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
}
function initSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const layout  = document.querySelector('.app-layout');
  if (!sidebar) return;
  // Collapsed по умолчанию, expanded только если явно '0'
  const collapsed = localStorage.getItem('sidebar_collapsed') !== '0';
  sidebar.classList.toggle('collapsed', collapsed);
  if (layout) layout.classList.toggle('sidebar-collapsed', collapsed);
  document.documentElement.setAttribute('data-sb', collapsed ? 'collapsed' : 'expanded');
}

// ─── Router
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(n => n.classList.add('active'));
  State.currentPage = page;
  // Обновляем заголовок мобильной шапки
  const titleEl = document.getElementById('mobile-topbar-title');
  if (titleEl) titleEl.textContent = _MOBILE_PAGE_TITLES[page] || page;
  updateMobileBar();
  if (page === 'leads') startAutoRefresh();
  else stopAutoRefresh();
  loadPage(page);
}
async function loadPage(page) {
  if (page === 'leads')      await loadLeads();
  if (page === 'clients')    await loadClients();
  if (page === 'deals')      await loadDeals();
  if (page === 'operations') await loadOperations();
  if (page === 'finance')    { resetFinancePeriodInit(); await loadFinance(); }
  if (page === 'calendar')   await loadCalendarPage();
  if (page === 'analytics')  await loadAnalytics();
  if (page === 'employees')  await loadAdminEmployees();
  if (page === 'tariffs')    await loadAdminTariffs();
  if (page === 'services')   await loadAdminServices();
  if (page === 'partners')   await loadAdminPartners();
  if (page === 'tariff-constructor') await loadTariffConstructor();
}

// ─── Toast / Loading
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}
function spinner(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
}

// ════════════════════════════
// ЛИДЫ
// ════════════════════════════

// ─── Mobile top bar helpers
const _MOBILE_PAGE_TITLES = {
  leads: '🎯 Лиды', clients: '👥 Клиенты', deals: '📁 Проекты',
  operations: '📋 Операции', finance: '💰 Финансы', calendar: '📅 Календарь',
  analytics: '📊 Отчёты', employees: '👤 Сотрудники', tariffs: '🏷️ Тарифы',
  services: '💲 Цены на услуги', partners: '🤝 Партнеры'
};

function updateMobileBar() {
  const backBtn = document.getElementById('mobile-back-btn');
  if (!backBtn) return;
  const anyOpen = document.querySelectorAll('.overlay.open').length > 0;
  if (anyOpen) backBtn.classList.add('visible');
  else backBtn.classList.remove('visible');
}

function mobileGoBack() {
  const openOverlays = document.querySelectorAll('.overlay.open');
  if (openOverlays.length > 0) {
    openOverlays[openOverlays.length - 1].classList.remove('open');
    updateMobileBar();
  }
}

function openDrawer(id) {
  document.getElementById(id).classList.add('open');
  if(id==='drawer-lead') { populateLeadStageSelect(); populateEmployeeSelect('l-manager'); }
  if(id==='drawer-deal') { populateClientSelect(); populateTariffSelect('d-tariff'); populateEmployeeSelect('d-project'); }
  if(id==='drawer-operation'){populateDealSelect('op-deal');populateEmployeeSelect('op-employee');}
  updateMobileBar();
}
function closeDrawer(id) {
  document.getElementById(id).classList.remove('open');
  updateMobileBar();
  
  if (id === 'drawer-client' && window.State && State.uniClientCallbackActive) {
    State.uniClientCallbackActive = false;
    openDrawer('drawer-operation-unified');
  }
  if (id === 'drawer-deal' && window.State && State.uniDealCallbackActive) {
    State.uniDealCallbackActive = false;
    openDrawer('drawer-operation-unified');
  }
}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeDrawer(o.id);}));

function fabAction(){
  const p = State.currentPage;
  if(p==='leads')     { openDrawer('drawer-lead'); return; }
  if(p==='clients')   { if(window.prepareClientDrawer) window.prepareClientDrawer(); openDrawer('drawer-client'); return; }
  if(p==='deals')     { openDrawer('drawer-deal'); return; }
  if(p==='operations'){ openDrawer('drawer-operation'); return; }
  if(p==='finance')   { openAddOperationMenu(); return; }
}

function statusBadge(status){
  const map={'Активный':'green','Активная':'green','Новая':'blue','В работе':'blue','Завершена':'gray','Приостановлена':'yellow','Неактивный':'gray','Оплачено':'green','Не оплачено':'red','Частично':'yellow','Новая заявка':'blue','В обработке (3 касания)':'blue','Консультация назначена':'blue','КП на рассмотрении':'yellow','Договор на рассмотрении':'yellow','Предоплата получена':'green','Полная оплата получена':'green','Связаться позднее':'gray','На прогрев':'gray','Не обработано':'gray','Отказ по причине':'red','Не целевой':'gray','Продано':'green','Возвраты':'red','Отменена (Возврат)':'red',
    // Статусы проекта
    'На паузе':'yellow','Готово':'green','Отменён':'red'};
  const color=map[status]||'gray';
  return status?`<span class="badge badge-${color}">${escHtml(status)}</span>`:'';
}

// ════════════════════════════
// АНАЛИТИКА — бизнес отчёты
// ════════════════════════════

const AnState = {
  tab:    'funnel',  // funnel | managers | refunds | economics
  period: 'all',     // all | today | week | month | custom
  startDate: null,
  endDate: null,
  manager: '',
  pfStartDate: '',
  pfEndDate: '',
  pfPlan: 0,
  pfAvgCheck: 0,
  pfSalesConv: 0,
  pfShowRate: 0,
  mktStartDate: '',
  mktEndDate: '',
  mktWebhookUrl: '',
  mktAdAccountId: '',
  mktUsdRate: 450
};


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// ════════════════════════════
// СИСТЕМА АВТОРИЗАЦИИ И ПРАВ
// ════════════════════════════
async function initApp() {
  const user = JSON.parse(localStorage.getItem('crm_user') || 'null');
  if (!user) {
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('btn-logout').style.display = 'none';
  } else {
    // 1. Попытка получить актуальную роль сотрудника напрямую из БД на случай изменений прав
    let activeRole = user.role;
    try {
      if (user.email) {
        const employee = await Airtable.findEmployeeByEmail(user.email);
        if (employee) {
          const dbRole = String(employee.fields['Роль'] || '').trim();
          if (dbRole && dbRole !== user.role) {
            user.role = dbRole;
            localStorage.setItem('crm_user', JSON.stringify(user));
            activeRole = dbRole;
          }
        }
      }
    } catch (e) {
      console.warn('Не удалось обновить роль пользователя с сервера, используем локальный кэш:', e.message);
    }

    const perms = await Airtable.getRolePermissions(activeRole);
    if (!perms) {
      localStorage.removeItem('crm_user');
      localStorage.removeItem('crm_current_user');
      document.getElementById('login-overlay').style.display = 'flex';
      document.getElementById('btn-logout').style.display = 'none';
      const errorEl = document.getElementById('login-error');
      if (errorEl) {
        errorEl.textContent = `Доступ запрещен: роль "${activeRole}" не найдена в таблице "Права доступа". Обратитесь к администратору.`;
        errorEl.style.display = 'block';
      }
      return;
    }
    
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('btn-logout').style.display = 'inline-flex';
    
    State.currentUser = user;
    State.permissions = perms;
    
    applyPermissionsUI();
    
    // Переход на доступную страницу по умолчанию
    let defaultPage = 'leads';
    if (!perms['Доступ: Лиды']) {
      if (perms['Доступ: Клиенты']) defaultPage = 'clients';
      else if (perms['Доступ: Проекты']) defaultPage = 'deals';
      else if (perms['Доступ: Операции']) defaultPage = 'operations';
      else if (perms['Доступ: Финансы']) defaultPage = 'finance';
      else if (perms['Доступ: Календарь']) defaultPage = 'calendar';
      else if (perms['Доступ: Отчеты']) defaultPage = 'analytics';
    }
    
    navigate(defaultPage);

    // Request notification permission
    if (window.Notification && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Start background check for tasks
    if (!window._dueTasksCheckerStarted) {
      window._dueTasksCheckerStarted = true;
      startDueTasksChecker();
    }
  }
}

function applyPermissionsUI() {
  const perms = State.permissions;
  if (!perms) return;

  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(btn => {
    const page = btn.getAttribute('data-page');
    let hasAccess = true;
    if (page === 'leads' && !perms['Доступ: Лиды']) hasAccess = false;
    if (page === 'clients' && !perms['Доступ: Клиенты']) hasAccess = false;
    if (page === 'deals' && !perms['Доступ: Проекты']) hasAccess = false;
    if (page === 'operations' && !perms['Доступ: Операции']) hasAccess = false;
    if (page === 'finance' && !perms['Доступ: Финансы']) hasAccess = false;
    if (page === 'calendar' && !perms['Доступ: Календарь']) hasAccess = false;
    if (page === 'analytics' && !perms['Доступ: Отчеты']) hasAccess = false;
    
    btn.style.display = hasAccess ? 'flex' : 'none';
  });

  const settingsBtns = document.querySelectorAll('[onclick="openPipelineSettings()"]');
  settingsBtns.forEach(btn => {
    btn.style.display = perms['Доступ: Настройки'] ? 'inline-flex' : 'none';
  });
}

async function submitLogin() {
  const emailEl = document.getElementById('login-email');
  const passwordEl = document.getElementById('login-password');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');

  const email = emailEl.value.trim();
  const password = passwordEl.value.trim();
  errorEl.style.display = 'none';

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner"></span> Вход...`;

  try {
    const employee = await Airtable.findEmployeeByEmail(email);
    if (!employee) {
      throw new Error('Пользователь с таким Email не найден');
    }
    
    const dbPassword = String(employee.fields['Пароль'] || '').trim();
    if (!dbPassword || dbPassword !== password) {
      throw new Error('Неверный пароль');
    }

    const role = String(employee.fields['Роль'] || '').trim();
    if (!role) {
      throw new Error('Вам не назначена роль (Права доступа) в системе. Обратитесь к администратору.');
    }

    const perms = await Airtable.getRolePermissions(role);
    if (!perms) {
      throw new Error(`Роль "${role}" не найдена в таблице "Права доступа". Обратитесь к администратору.`);
    }

    const crmUser = {
      id: employee.id,
      name: employee.fields['Имя'],
      email: employee.fields['Email'],
      role: role
    };

    localStorage.setItem('crm_user', JSON.stringify(crmUser));
    localStorage.setItem('crm_current_user', crmUser.name);

    emailEl.value = '';
    passwordEl.value = '';

    await initApp();
    toast('Вход выполнен успешно ✓');
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Войти';
  }
}

function logout() {
  if (!confirm('Вы действительно хотите выйти из системы?')) return;
  localStorage.removeItem('crm_user');
  localStorage.removeItem('crm_current_user');
  location.reload();
}

// ─── Task reminders notification badge & modal drawer list
function updateTasksReminderNotification() {
  const currentUser = getCRMCurrentUser();
  const btnDesktop = document.getElementById('btn-tasks-reminder');
  const btnMobile = document.getElementById('btn-mobile-tasks-reminder');
  
  if (!currentUser || !State.leads || State.leads.length === 0) {
    if (btnDesktop) btnDesktop.style.display = 'none';
    if (btnMobile) btnMobile.style.display = 'none';
    return;
  }

  // Helper to check if lead is archived
  const isArchivedLocal = (lead) => {
    const activeFields = window.ActiveFieldsCache?.[CONFIG.TABLES.LEADS] || [];
    if (activeFields.includes('Архивирован')) {
      return lead.fields['Архивирован'] === true || lead.fields['Архивирован'] === 'true';
    }
    const localArchived = JSON.parse(localStorage.getItem('crm_archived_leads') || '[]');
    return localArchived.includes(lead.id);
  };

  const activeLeads = State.leads.filter(l => !isArchivedLocal(l));
  const todayStr = getLocalDateString();
  const cleanCurrentUser = currentUser.trim().toLowerCase();
  
  const readTaskIds = JSON.parse(localStorage.getItem('crm_read_tasks') || '[]');
  
  let totalDueTasksCount = 0;
  let unreadDueTasksCount = 0;

  activeLeads.forEach(l => {
    const tasks = safeJsonParse(l.fields['Задачи'] || '[]');
    const myActiveDueTasks = tasks.filter(t => {
      if (t.done || t.cancelled) return false;
      if (t.user && t.user.trim().toLowerCase() !== cleanCurrentUser) return false;
      if (!t.dueDate) return false;
      return t.dueDate <= todayStr;
    });
    totalDueTasksCount += myActiveDueTasks.length;
    myActiveDueTasks.forEach(t => {
      if (!readTaskIds.includes(t.id)) {
        unreadDueTasksCount++;
      }
    });
  });

  const badgeDesktop = document.getElementById('tasks-reminder-badge');
  const badgeMobile = document.getElementById('mobile-tasks-reminder-badge');

  // Bell is shown if there are ANY active tasks for today/overdue (read or unread)
  if (totalDueTasksCount > 0) {
    if (btnDesktop) {
      btnDesktop.style.display = 'inline-flex';
      btnDesktop.style.alignItems = 'center';
      
      if (unreadDueTasksCount > 0) {
        badgeDesktop.textContent = unreadDueTasksCount;
        badgeDesktop.style.display = 'inline-block';
        btnDesktop.style.background = 'rgba(239,68,68,0.15)';
        btnDesktop.style.borderColor = 'rgba(239,68,68,0.3)';
        btnDesktop.style.color = '#fca5a5';
      } else {
        badgeDesktop.style.display = 'none';
        btnDesktop.style.background = 'rgba(99,102,241,0.1)';
        btnDesktop.style.borderColor = 'rgba(99,102,241,0.25)';
        btnDesktop.style.color = '#a5b4fc';
      }
    }

    if (btnMobile) {
      btnMobile.style.display = 'inline-flex';
      if (unreadDueTasksCount > 0) {
        badgeMobile.textContent = unreadDueTasksCount;
        badgeMobile.style.display = 'flex';
      } else {
        badgeMobile.style.display = 'none';
      }
    }
  } else {
    if (btnDesktop) btnDesktop.style.display = 'none';
    if (btnMobile) btnMobile.style.display = 'none';
  }
}

function openTasksReminder() {
  const currentUser = getCRMCurrentUser();
  if (!currentUser) return;

  const isArchivedLocal = (lead) => {
    const activeFields = window.ActiveFieldsCache?.[CONFIG.TABLES.LEADS] || [];
    if (activeFields.includes('Архивирован')) {
      return lead.fields['Архивирован'] === true || lead.fields['Архивирован'] === 'true';
    }
    const localArchived = JSON.parse(localStorage.getItem('crm_archived_leads') || '[]');
    return localArchived.includes(lead.id);
  };

  const activeLeads = State.leads.filter(l => !isArchivedLocal(l));
  const todayStr = getLocalDateString();
  const cleanCurrentUser = currentUser.trim().toLowerCase();
  
  const myTasks = [];
  activeLeads.forEach(l => {
    const tasks = safeJsonParse(l.fields['Задачи'] || '[]');
    const myActiveDueTasks = tasks.filter(t => {
      if (t.done || t.cancelled) return false;
      if (t.user && t.user.trim().toLowerCase() !== cleanCurrentUser) return false;
      if (!t.dueDate) return false;
      return t.dueDate <= todayStr;
    });
    myActiveDueTasks.forEach(t => {
      myTasks.push({
        task: t,
        leadId: l.id,
        leadName: getField(l.fields, CONFIG.LEAD_FIELDS.name) || 'Лид',
        stage: getField(l.fields, CONFIG.LEAD_FIELDS.stage) || 'Новая заявка',
        phone: getField(l.fields, CONFIG.LEAD_FIELDS.phone) || ''
      });
    });
  });

  // Сортируем: сначала просроченные по дате/времени
  myTasks.sort((a, b) => {
    const aDt = a.task.dueDate + (a.task.dueTime ? 'T' + a.task.dueTime : 'T00:00');
    const bDt = b.task.dueDate + (b.task.dueTime ? 'T' + b.task.dueTime : 'T00:00');
    return aDt.localeCompare(bDt);
  });

  const container = document.getElementById('tasks-reminder-content');
  if (!container) return;

  const readTaskIds = JSON.parse(localStorage.getItem('crm_read_tasks') || '[]');

  if (myTasks.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text2);">
        <div style="font-size:42px; margin-bottom:12px;">🎉</div>
        <div style="font-weight:700; color:#fff; font-size:15px; margin-bottom:4px;">Все задачи выполнены!</div>
        <div style="font-size:12px;">У вас нет невыполненных задач на данный момент.</div>
      </div>
    `;
  } else {
    const hasUnread = myTasks.some(item => !readTaskIds.includes(item.task.id));
    const markAllBtn = hasUnread 
      ? `<button onclick="markAllTasksAsRead()" style="background:none; border:none; color:#a5b4fc; font-size:12px; font-weight:700; cursor:pointer; padding:4px 8px; margin-bottom:12px; display:block; text-align:right; width:100%;">✓ Отметить все как прочитанные</button>` 
      : '';

    container.innerHTML = markAllBtn + myTasks.map(item => {
      const isOverdue = item.task.dueDate < todayStr;
      const isToday = item.task.dueDate === todayStr;
      const dueClass = isOverdue ? 'overdue' : (isToday ? 'today' : 'future');
      const dueLabel = isOverdue ? '⚠️ Просрочено: ' : (isToday ? '🔔 Сегодня: ' : 'Срок: ');
      const timeStr = item.task.dueTime ? ` в ${item.task.dueTime}` : '';
      
      const isRead = readTaskIds.includes(item.task.id);
      const cardOpacity = isRead ? 'opacity: 0.55;' : 'opacity: 1;';
      const indicatorCircle = isRead 
        ? '' 
        : `<span class="unread-dot" style="width: 8px; height: 8px; background: #3b82f6; border-radius: 50%; display: inline-block; flex-shrink:0; box-shadow:0 0 8px #3b82f6;"></span>`;
      
      return `
        <div class="task-reminder-item" onclick="clickTaskInReminder('${item.task.id}', '${item.leadId}', '${escHtml(item.stage)}')" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:12px 14px; border-radius:12px; margin-bottom:8px; cursor:pointer; transition:all 0.2s; display:flex; gap:10px; align-items:flex-start; ${cardOpacity}">
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
              <div style="font-weight:700; color:#fff; font-size:14px; display:flex; align-items:center; gap:6px;">🎯 ${escHtml(item.leadName)}</div>
              <span class="task-due ${dueClass}" style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:6px;">${dueLabel}${formatDate(item.task.dueDate)}${timeStr}</span>
            </div>
            <div style="font-size:13px; color:var(--text1); margin-bottom:8px; line-height:1.4;">${escHtml(item.task.text)}</div>
            <div style="font-size:11px; color:var(--text2); display:flex; justify-content:space-between; align-items:center;">
              <span>📁 Этап: ${escHtml(item.stage)}</span>
              ${item.phone ? `<span>📱 ${escHtml(item.phone)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex; align-items:center; height:100%; min-height:40px; justify-content:center;">
            ${indicatorCircle}
          </div>
        </div>
      `;
    }).join('');
  }

  openDrawer('drawer-tasks');
}

function goToLeadFromTask(leadId, stage) {
  closeDrawer('drawer-tasks');
  openLeadDetail(leadId, stage);
}

function clickTaskInReminder(taskId, leadId, stage) {
  let readTaskIds = JSON.parse(localStorage.getItem('crm_read_tasks') || '[]');
  if (!readTaskIds.includes(taskId)) {
    readTaskIds.push(taskId);
    localStorage.setItem('crm_read_tasks', JSON.stringify(readTaskIds));
  }
  updateTasksReminderNotification();
  goToLeadFromTask(leadId, stage);
}

function markAllTasksAsRead() {
  const currentUser = getCRMCurrentUser();
  if (!currentUser) return;

  const isArchivedLocal = (lead) => {
    const activeFields = window.ActiveFieldsCache?.[CONFIG.TABLES.LEADS] || [];
    if (activeFields.includes('Архивирован')) {
      return lead.fields['Архивирован'] === true || lead.fields['Архивирован'] === 'true';
    }
    const localArchived = JSON.parse(localStorage.getItem('crm_archived_leads') || '[]');
    return localArchived.includes(lead.id);
  };

  const activeLeads = State.leads.filter(l => !isArchivedLocal(l));
  const todayStr = getLocalDateString();
  const cleanCurrentUser = currentUser.trim().toLowerCase();

  let readTaskIds = JSON.parse(localStorage.getItem('crm_read_tasks') || '[]');
  let updated = false;

  activeLeads.forEach(l => {
    const tasks = safeJsonParse(l.fields['Задачи'] || '[]');
    tasks.forEach(t => {
      if (!t.done && (t.user && t.user.trim().toLowerCase() === cleanCurrentUser) && t.dueDate) {
        if (t.dueDate <= todayStr && !readTaskIds.includes(t.id)) {
          readTaskIds.push(t.id);
          updated = true;
        }
      }
    });
  });

  if (updated) {
    localStorage.setItem('crm_read_tasks', JSON.stringify(readTaskIds));
    updateTasksReminderNotification();
    openTasksReminder(); // Re-render the drawer list immediately
    toast('Все напоминания отмечены как прочитанные ✓');
  }
}

// ─── Background checker for push alerts & badge count
function checkDueTasksAndNotify() {
  const currentUser = getCRMCurrentUser();
  if (!currentUser || !State.leads || State.leads.length === 0) return;

  // Sync the badge in top bar
  updateTasksReminderNotification();

  if (window.Notification && Notification.permission === 'granted') {
    const isArchivedLocal = (lead) => {
      const activeFields = window.ActiveFieldsCache?.[CONFIG.TABLES.LEADS] || [];
      if (activeFields.includes('Архивирован')) {
        return lead.fields['Архивирован'] === true || lead.fields['Архивирован'] === 'true';
      }
      const localArchived = JSON.parse(localStorage.getItem('crm_archived_leads') || '[]');
      return localArchived.includes(lead.id);
    };

    const activeLeads = State.leads.filter(l => !isArchivedLocal(l));
    const now = new Date();
    const todayStr = getLocalDateString();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentDateTimeStr = `${todayStr}T${hh}:${mm}`;
    const cleanCurrentUser = currentUser.trim().toLowerCase();

    let notifiedIds = JSON.parse(localStorage.getItem('crm_notified_tasks') || '[]');
    let updated = false;

    activeLeads.forEach(l => {
      const tasks = safeJsonParse(l.fields['Задачи'] || '[]');
      tasks.forEach(t => {
        if (!t.done && (t.user && t.user.trim().toLowerCase() === cleanCurrentUser) && t.dueDate) {
          const taskDateTimeStr = t.dueDate + (t.dueTime ? 'T' + t.dueTime : 'T00:00');
          if (taskDateTimeStr <= currentDateTimeStr && !notifiedIds.includes(t.id)) {
            // Check that it's within past 12 hours to avoid spamming alerts on initial login
            const taskTime = new Date(taskDateTimeStr);
            const timeDiffHrs = (now - taskTime) / (1000 * 60 * 60);

            if (timeDiffHrs < 12) {
              const leadName = getField(l.fields, CONFIG.LEAD_FIELDS.name) || 'Лид';
              try {
                new Notification(`🎯 Пора связаться: ${leadName}`, {
                  body: `${t.text}${t.dueTime ? ' в ' + t.dueTime : ''}`,
                  icon: './favicon.ico'
                });
              } catch (e) {
                console.warn('Could not fire browser notification:', e);
              }
            }

            notifiedIds.push(t.id);
            updated = true;
          }
        }
      });
    });

    if (updated) {
      if (notifiedIds.length > 100) notifiedIds = notifiedIds.slice(-100);
      localStorage.setItem('crm_notified_tasks', JSON.stringify(notifiedIds));
    }
  }
}

function startDueTasksChecker() {
  checkDueTasksAndNotify();
  setInterval(checkDueTasksAndNotify, 30000); // Check every 30 seconds
}

window.submitLogin = submitLogin;
window.logout = logout;
window.initApp = initApp;
window.updateTasksReminderNotification = updateTasksReminderNotification;
window.openTasksReminder = openTasksReminder;
window.goToLeadFromTask = goToLeadFromTask;
window.clickTaskInReminder = clickTaskInReminder;
window.markAllTasksAsRead = markAllTasksAsRead;
window.startDueTasksChecker = startDueTasksChecker;

initApp();
initSidebar();



