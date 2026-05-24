// === ERP CORE INITIALIZATION & UTILITIES ===
// ─── State
const State = {
  leads: [], clients: [], deals: [], employees: [], tariffs: [], operations: [],
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

// ─── Router
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  State.currentPage = page;
  // Обновляем заголовок мобильной шапки
  const titleEl = document.getElementById('mobile-topbar-title');
  if (titleEl) titleEl.textContent = _MOBILE_PAGE_TITLES[page] || page;
  // Скрываем кнопку "Назад" при переходе между страницами
  updateMobileBar();
  // Автообновление только на странице лидов
  if (page === 'leads') startAutoRefresh();
  else stopAutoRefresh();
  loadPage(page);
}
async function loadPage(page) {
  if (page === 'leads')      await loadLeads();
  if (page === 'clients')    await loadClients();
  if (page === 'deals')      await loadDeals();
  if (page === 'operations') await loadOperations();
  if (page === 'finance')    await loadFinance();
  if (page === 'analytics')  await loadAnalytics();
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
  operations: '📋 Операции', finance: '💰 Финансы', analytics: '📊 Отчёты'
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
  if(id==='drawer-deal') { populateClientSelect(); populateTariffSelect('d-tariff'); populateEmployeeSelect('d-employee'); }
  if(id==='drawer-operation'){populateDealSelect('op-deal');populateEmployeeSelect('op-employee');}
  updateMobileBar();
}
function closeDrawer(id) {
  document.getElementById(id).classList.remove('open');
  updateMobileBar();
}
document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));

function fabAction(){
  const p = State.currentPage;
  if(p==='leads')     { openDrawer('drawer-lead'); return; }
  if(p==='clients')   { openDrawer('drawer-client'); return; }
  if(p==='deals')     { openDrawer('drawer-deal'); return; }
  if(p==='operations'){ openDrawer('drawer-operation'); return; }
  if(p==='finance')   { toggleFabFinanceMenu(); return; }
}

window._fabFinanceOpen = false;
function toggleFabFinanceMenu() {
  const menu = document.getElementById('fab-finance-menu');
  if (!menu) return;
  window._fabFinanceOpen = !window._fabFinanceOpen;
  menu.style.display = window._fabFinanceOpen ? 'flex' : 'none';
}
function fabFinanceIncome() {
  window._fabFinanceOpen = false;
  const fm = document.getElementById('fab-finance-menu');
  if (fm) fm.style.display = 'none';
  if (typeof prepareIncomeDrawer === 'function') prepareIncomeDrawer();
  openDrawer('drawer-income');
}
function fabFinanceExpense() {
  window._fabFinanceOpen = false;
  const fm = document.getElementById('fab-finance-menu');
  if (fm) fm.style.display = 'none';
  if (typeof prepareExpenseDrawer === 'function') prepareExpenseDrawer();
  openDrawer('drawer-expense');
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
navigate('leads');


