// === ANALYTICS & REPORTS MODULE ===
async function loadAnalytics() {
  spinner('analytics-content');
  try {
    const [leads, deals, tariffs, services, employees] = await Promise.all([
      Airtable.getAll(CONFIG.TABLES.LEADS),
      Airtable.getAll(CONFIG.TABLES.DEALS),
      Airtable.getAll(CONFIG.TABLES.TARIFFS),
      Airtable.getAll(CONFIG.TABLES.SERVICES),
      Airtable.getAll(CONFIG.TABLES.EMPLOYEES),
    ]);
    State.leads = leads; State.deals = deals; State.tariffs = tariffs; State.services = services; State.employees = employees;
    renderAnalytics();
  } catch(e) {
    document.getElementById('analytics-content').innerHTML =
      `<div class="an-empty">⚠️ Ошибка загрузки: ${e.message}</div>`;
  }
}

// parseDateStr удалена, используется глобальная версия из config.js

// ─── Разбор даты лида
function parseLeadDate(lead) {
  return parseDateStr(lead.fields['Дата']);
}

// Конвертация даты в формат HTML input (YYYY-MM-DD)
function toInputDateFormat(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Конвертация даты в формат базы (DD.MM.YYYY)
function toDbDateFormat(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return dateStr;
}

// Проверка вхождения даты в выбранный период
function isDateInPeriod(dateStr, period) {
  const d = parseDateStr(dateStr);
  if (!d) return false;
  if (period === 'all') return true;
  
  if (period === 'custom') {
    const sDate = AnState.startDate ? parseDateStr(AnState.startDate) : null;
    const eDate = AnState.endDate ? parseDateStr(AnState.endDate) : null;
    
    if (sDate) sDate.setHours(0,0,0,0);
    if (eDate) eDate.setHours(23,59,59,999);
    d.setHours(12,0,0,0);
    
    if (sDate && eDate) return d >= sDate && d <= eDate;
    if (sDate) return d >= sDate;
    if (eDate) return d <= eDate;
    return true;
  }
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = todayStart;
  
  if (period === 'week') {
    start = new Date(todayStart);
    start.setDate(todayStart.getDate() - ((todayStart.getDay()||7) - 1));
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return d >= start;
}

// ─── Фильтрация лидов по периоду
function applyPeriodFilter(leads) {
  return leads.filter(l => {
    const d = parseLeadDate(l);
    return d && isDateInPeriod(d, AnState.period);
  });
}

const fmt = n => Number(n||0).toLocaleString('ru-RU');
const daysBetween = (d1, d2) => Math.floor(Math.abs(d2-d1)/(1000*60*60*24));

// ─── Chart.js helpers
const _charts = {};
function _destroyChart(key) {
  if (_charts[key]) { _charts[key].destroy(); delete _charts[key]; }
}
function _destroyAllCharts() {
  Object.keys(_charts).forEach(_destroyChart);
}
function _chartDefaults() {
  if (!window.Chart) return;
  Chart.defaults.color = '#9ca3af';
  Chart.defaults.font.family = "'Plus Jakarta Sans', -apple-system, sans-serif";
  Chart.defaults.font.size = 11;
}
// Градиент цветов для графиков
const CHART_COLORS = {
  indigo:  'rgba(99,102,241,',
  purple:  'rgba(168,85,247,',
  green:   'rgba(52,211,153,',
  blue:    'rgba(96,165,250,',
  orange:  'rgba(251,191,36,',
  red:     'rgba(248,113,113,',
  teal:    'rgba(45,212,191,',
  pink:    'rgba(244,114,182,',
};

// ─── Применить кастомный диапазон дат
function anApplyCustomRange() {
  let startVal = document.getElementById('an-start-date').value;
  let endVal = document.getElementById('an-end-date').value;
  
  if (!startVal && !endVal) {
    toast('Выберите хотя бы одну дату', 'error');
    return;
  }
  
  // Если выбрана только одна дата, то дублируем ее во вторую, чтобы отфильтровать ровно за один день
  if (startVal && !endVal) {
    endVal = startVal;
    document.getElementById('an-end-date').value = endVal;
  } else if (!startVal && endVal) {
    startVal = endVal;
    document.getElementById('an-start-date').value = startVal;
  }
  
  AnState.period = 'custom';
  AnState.startDate = startVal;
  AnState.endDate = endVal;
  
  renderAnalytics();
}

// ─── Главный рендер
function renderAnalytics() {
  const periods = [
    {key:'all',label:'Всё время'},{key:'today',label:'Сегодня'},
    {key:'week',label:'Неделя'},{key:'month',label:'Месяц'},
  ];
  
  const periodButtons = periods.map(p => {
    const active = AnState.period === p.key;
    return `<button class="an-quick-filter-btn ${active?'active':''}" onclick="anSetPeriod('${p.key}')">${p.label}</button>`;
  }).join('');

  const isCustom = AnState.period === 'custom';
  
  const tabs = [
    {key:'funnel',   label:'📊 Воронка'},
    {key:'managers', label:'👤 Менеджеры'},
    {key:'daily',    label:'📈 РНП продажи'},
    {key:'refunds',  label:'↩️ Возвраты'},
    {key:'economics', label:'💰 Юнит-экономика'},
    {key:'marketing', label:'📣 Маркетинг'},
  ];
  const tabHtml = tabs.map(t =>
    `<button class="an-tab ${AnState.tab===t.key?'active':''}" onclick="anSetTab('${t.key}')">${t.label}</button>`
  ).join('');

  let filtersHtml = '';
  if (AnState.tab === 'daily') {
    if (!AnState.pfStartDate || !AnState.pfEndDate) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      AnState.pfStartDate = getLocalDateString(startOfMonth);
      AnState.pfEndDate = getLocalDateString(endOfMonth);
    }
    
    const planKey = `crm_an_pf_plan_${AnState.pfStartDate}_${AnState.pfEndDate}_${AnState.manager || 'all'}`;
    const storedPlan = localStorage.getItem(planKey);
    const currentPlan = storedPlan !== null ? parseFloat(storedPlan) : 0;
    AnState.pfPlan = currentPlan;
    
    const avgCheckKey = `crm_an_pf_avgcheck_${AnState.pfStartDate}_${AnState.pfEndDate}_${AnState.manager || 'all'}`;
    const storedAvgCheck = localStorage.getItem(avgCheckKey);
    const currentAvgCheck = storedAvgCheck !== null ? parseFloat(storedAvgCheck) : 0;
    AnState.pfAvgCheck = currentAvgCheck;

    const showRateKey = `crm_an_pf_showrate_${AnState.pfStartDate}_${AnState.pfEndDate}_${AnState.manager || 'all'}`;
    const storedShowRate = localStorage.getItem(showRateKey);
    const currentShowRate = storedShowRate !== null ? parseFloat(storedShowRate) : 0;
    AnState.pfShowRate = currentShowRate;

    const salesConvKey = `crm_an_pf_salesconv_${AnState.pfStartDate}_${AnState.pfEndDate}_${AnState.manager || 'all'}`;
    const storedSalesConv = localStorage.getItem(salesConvKey);
    const currentSalesConv = storedSalesConv !== null ? parseFloat(storedSalesConv) : 0;
    AnState.pfSalesConv = currentSalesConv;

    const managerOptions = (State.employees || []).map(e => {
      const name = e.fields['Имя'] || '';
      return `<option value="${escHtml(name)}" ${AnState.manager === name ? 'selected' : ''}>${escHtml(name)}</option>`;
    }).join('');

    filtersHtml = `
      <div class="an-filters-container">
        <div class="an-filters-row" style="gap:16px; align-items:flex-end; flex-wrap:wrap;">
          <div class="an-filter-group">
            <span class="an-filter-label">Дата с</span>
            <input type="date" id="an-pf-start-date" class="an-filter-date-input" onclick="try{this.showPicker()}catch(e){}" value="${AnState.pfStartDate}" style="height:36px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700; cursor:pointer;">
          </div>
          
          <div class="an-filter-group">
            <span class="an-filter-label">Дата по</span>
            <input type="date" id="an-pf-end-date" class="an-filter-date-input" onclick="try{this.showPicker()}catch(e){}" value="${AnState.pfEndDate}" style="height:36px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700; cursor:pointer;">
          </div>

          <div class="an-filter-group">
            <span class="an-filter-label">План по выручке (₸)</span>
            <input type="number" id="an-pf-plan-input" placeholder="Введите сумму..." value="${currentPlan > 0 ? currentPlan : ''}" style="height:36px; width:165px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700;">
          </div>

          <div class="an-filter-group">
            <span class="an-filter-label">План по ср. чеку (₸)</span>
            <input type="number" id="an-pf-avgcheck-input" placeholder="Введите ср. чек..." value="${currentAvgCheck > 0 ? currentAvgCheck : ''}" style="height:36px; width:165px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700;">
          </div>

          <div class="an-filter-group">
            <span class="an-filter-label">Доходимость (%)</span>
            <input type="number" id="an-pf-showrate-input" placeholder="Напр. 70" value="${currentShowRate > 0 ? currentShowRate : ''}" style="height:36px; width:115px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700;">
          </div>

          <div class="an-filter-group">
            <span class="an-filter-label">Конв. в продажи (%)</span>
            <input type="number" id="an-pf-salesconv-input" placeholder="Напр. 40" value="${currentSalesConv > 0 ? currentSalesConv : ''}" style="height:36px; width:145px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700;">
          </div>

          <div class="an-filter-group">
            <span class="an-filter-label">Менеджер</span>
            <select id="an-filter-manager" onchange="anDailySetManager(this.value)" style="height:36px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700; cursor:pointer;">
              <option value="">Все менеджеры</option>
              ${managerOptions}
            </select>
          </div>
          
          <div style="display:flex; gap:8px;">
            <button class="an-date-btn" onclick="anApplyDailyPlan()" style="height:36px; margin:0; line-height:36px; padding:0 16px;">Сформировать</button>
            <button class="an-refresh-btn" onclick="anExportToExcel()" style="height:36px; margin:0; line-height:36px; padding:0 16px; background:rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #10b981;">📥 Excel</button>
          </div>
        </div>
      </div>
    `;
  } else if (AnState.tab === 'marketing') {
    if (!AnState.mktStartDate || !AnState.mktEndDate) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      AnState.mktStartDate = getLocalDateString(startOfMonth);
      AnState.mktEndDate = getLocalDateString(endOfMonth);
    }
    
    const storedWebhook = localStorage.getItem('crm_mkt_n8n_webhook') || 'https://mediakings-u49260.vm.elestio.app/webhook/fetch-fb-stats';
    const storedAdAccount = localStorage.getItem('crm_mkt_fb_account') || '2404260013056414';
    const storedRate = localStorage.getItem('crm_mkt_usd_rate') || '450';
    
    AnState.mktWebhookUrl = storedWebhook;
    AnState.mktAdAccountId = storedAdAccount;
    AnState.mktUsdRate = parseFloat(storedRate) || 450;
    
    filtersHtml = `
      <div class="an-filters-container">
        <div class="an-filters-row" style="gap:16px; align-items:flex-end; flex-wrap:wrap;">
          <div class="an-filter-group">
            <span class="an-filter-label">Дата с</span>
            <input type="date" id="an-mkt-start-date" class="an-filter-date-input" onclick="try{this.showPicker()}catch(e){}" value="${AnState.mktStartDate}" style="height:36px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700; cursor:pointer;">
          </div>
          
          <div class="an-filter-group">
            <span class="an-filter-label">Дата по</span>
            <input type="date" id="an-mkt-end-date" class="an-filter-date-input" onclick="try{this.showPicker()}catch(e){}" value="${AnState.mktEndDate}" style="height:36px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700; cursor:pointer;">
          </div>

          <div class="an-filter-group">
            <span class="an-filter-label">n8n Webhook URL</span>
            <input type="text" id="an-mkt-webhook-input" placeholder="https://n8n.elest.io/..." value="${storedWebhook}" style="height:36px; width:220px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700;">
          </div>

          <div class="an-filter-group">
            <span class="an-filter-label">FB Ad Account ID</span>
            <input type="text" id="an-mkt-account-input" placeholder="123456789" value="${storedAdAccount}" style="height:36px; width:150px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700;">
          </div>

          <div class="an-filter-group">
            <span class="an-filter-label">Курс USD (₸)</span>
            <input type="number" id="an-mkt-rate-input" placeholder="450" value="${storedRate}" style="height:36px; width:90px; padding:0 12px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; font-weight:700;">
          </div>
          
          <div style="display:flex; gap:8px;">
            <button class="an-date-btn" onclick="anApplyMarketingFilters()" style="height:36px; margin:0; line-height:36px; padding:0 16px;">Сформировать</button>
            <button class="an-refresh-btn" id="an-mkt-load-btn" onclick="anFetchFacebookData()" style="height:36px; margin:0; line-height:36px; padding:0 16px; background:rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #60a5fa;">🔵 Получить данные FB</button>
          </div>
        </div>
      </div>
    `;
  } else {
    filtersHtml = `
      <div class="an-filters-container">
        <div class="an-filters-row">
          <div class="an-filter-group">
            <span class="an-filter-label">Быстрый период</span>
            <div class="an-quick-filters">${periodButtons}</div>
          </div>
          <button class="an-refresh-btn" onclick="anRefresh()">🔄 Обновить данные</button>
        </div>
        
        <div class="an-filters-row" style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">
          <div class="an-filter-group" style="flex:1">
            <span class="an-filter-label">Свой период</span>
            <div class="an-custom-date-range">
              <span class="an-date-range-text">с</span>
              <input type="date" id="an-start-date" class="an-filter-date-input" onclick="try{this.showPicker()}catch(e){}" value="${AnState.startDate || ''}">
              <span class="an-date-range-text">по</span>
              <input type="date" id="an-end-date" class="an-filter-date-input" onclick="try{this.showPicker()}catch(e){}" value="${AnState.endDate || ''}">
              <button class="an-date-btn" onclick="anApplyCustomRange()">Сформировать</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  document.getElementById('analytics-content').innerHTML = `
    ${filtersHtml}
    <div class="an-tabs">${tabHtml}</div>
    <div id="an-tab-body"></div>`;

  renderAnTab();
}

function renderAnTab() {
  const body = document.getElementById('an-tab-body');
  if (!body) return;
  _destroyAllCharts();
  _chartDefaults();
  if (AnState.tab === 'funnel') {
    body.innerHTML = renderTabFunnel();
    requestAnimationFrame(initFunnelCharts);
  } else if (AnState.tab === 'managers') {
    body.innerHTML = renderTabManagers();
    requestAnimationFrame(initManagerCharts);
  } else if (AnState.tab === 'refunds') {
    body.innerHTML = renderTabRefunds();
  } else if (AnState.tab === 'economics') {
    body.innerHTML = renderTabEconomics();
    requestAnimationFrame(initEconomicsCharts);
  } else if (AnState.tab === 'daily') {
    body.innerHTML = renderTabDaily();
  } else if (AnState.tab === 'marketing') {
    body.innerHTML = renderTabMarketing();
  }
}

function anSetTab(tab)  { AnState.tab = tab; renderAnalytics(); }
function anSetPeriod(p) {
  AnState.period = p;
  AnState.startDate = null;
  AnState.endDate = null;
  renderAnalytics();
}
function anApplyDailyPlan() {
  const startVal = document.getElementById('an-pf-start-date').value;
  const endVal = document.getElementById('an-pf-end-date').value;
  const planVal = parseFloat(document.getElementById('an-pf-plan-input').value) || 0;
  const avgCheckVal = parseFloat(document.getElementById('an-pf-avgcheck-input').value) || 0;
  const showRateVal = parseFloat(document.getElementById('an-pf-showrate-input').value) || 0;
  const salesConvVal = parseFloat(document.getElementById('an-pf-salesconv-input').value) || 0;
  
  if (!startVal || !endVal) {
    toast('Выберите диапазон дат', 'error');
    return;
  }
  
  AnState.pfStartDate = startVal;
  AnState.pfEndDate = endVal;
  AnState.pfPlan = planVal;
  AnState.pfAvgCheck = avgCheckVal;
  AnState.pfShowRate = showRateVal;
  AnState.pfSalesConv = salesConvVal;
  
  const planKey = `crm_an_pf_plan_${startVal}_${endVal}_${AnState.manager || 'all'}`;
  localStorage.setItem(planKey, planVal);
  
  const avgCheckKey = `crm_an_pf_avgcheck_${startVal}_${endVal}_${AnState.manager || 'all'}`;
  localStorage.setItem(avgCheckKey, avgCheckVal);

  const showRateKey = `crm_an_pf_showrate_${startVal}_${endVal}_${AnState.manager || 'all'}`;
  localStorage.setItem(showRateKey, showRateVal);

  const salesConvKey = `crm_an_pf_salesconv_${startVal}_${endVal}_${AnState.manager || 'all'}`;
  localStorage.setItem(salesConvKey, salesConvVal);
  
  renderAnalytics();
}

function anDailySetManager(val) {
  AnState.manager = val;
  renderAnalytics();
}

async function anRefresh() { await loadAnalytics(); }

function anExportToExcel() {
  const table = document.querySelector('.an-daily-table');
  if (!table) {
    toast('Таблица для экспорта не найдена', 'error');
    return;
  }
  
  const tableHtml = table.outerHTML;
  const template = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
      <style>
        table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; }
        th { background-color: #0f172a; color: #ffffff; border: 1px solid #334155; font-weight: bold; text-align: center; padding: 6px; }
        td { border: 1px solid #e2e8f0; text-align: center; padding: 4px; }
        .date-cell { text-align: left; }
        .weekend-row { background-color: #fef2f2; }
        .an-daily-week-total { background-color: #e0e7ff; font-weight: bold; }
        .an-daily-month-total { background-color: #d1fae5; font-weight: bold; }
        .revenue-cell { color: #059669; }
        .cash-cell { color: #2563eb; }
        .plan-val { color: #64748b; }
        .fact-val { font-weight: bold; }
      </style>
    </head>
    <body>
      ${tableHtml}
    </body>
    </html>
  `;
  
  const blob = new Blob([template], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const filename = `РНП_Продажи_${AnState.pfStartDate}_${AnState.pfEndDate}.xls`;
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Вспомогательная функция проверки вхождения даты в диапазон
function isDateInRange(dateStr, startYmd, endYmd) {
  if (!dateStr) return false;
  const d = parseDateStr(dateStr);
  if (!d) return false;
  
  const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sMid = parseDateStr(startYmd);
  const eMid = parseDateStr(endYmd);
  
  if (!sMid || !eMid) return false;
  
  const s = new Date(sMid.getFullYear(), sMid.getMonth(), sMid.getDate());
  const e = new Date(eMid.getFullYear(), eMid.getMonth(), eMid.getDate());
  
  return dMid >= s && dMid <= e;
}

// ─── Рендер вкладки ежедневной статистики
function renderTabDaily() {
  const start = parseDateStr(AnState.pfStartDate);
  const end = parseDateStr(AnState.pfEndDate);
  
  if (!start || !end) {
    return `<div class="an-empty">⚠️ Пожалуйста, выберите корректный период дат.</div>`;
  }
  
  if (start > end) {
    return `<div class="an-empty">⚠️ Начальная дата не может быть больше конечной даты.</div>`;
  }
  
  const dStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0, 0);
  const dEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12, 0, 0, 0);
  const totalDays = Math.round((dEnd - dStart) / (1000 * 60 * 60 * 24)) + 1;
  
  let leads = State.leads || [];
  if (AnState.manager) {
    leads = leads.filter(l => l.fields['Менеджер'] === AnState.manager);
  }
  
  const activeLeads = leads.filter(l => {
    const activeFields = window.ActiveFieldsCache?.[CONFIG.TABLES.LEADS] || [];
    if (activeFields.includes('Архивирован')) {
      return !(l.fields['Архивирован'] === true || l.fields['Архивирован'] === 'true');
    }
    const localArchived = JSON.parse(localStorage.getItem('crm_archived_leads') || '[]');
    return !localArchived.includes(l.id);
  });
  
  // Рассчитываем конверсии и плановые показатели за весь выбранный период
  let avgCheck = 300000, salesConv = 0.40, showRate = 0.70, cashRatio = 1.0;
  let planScheduled = 0, planConducted = 0, planSales = 0, planRevenue = 0, planCash = 0;
  
  if (AnState.pfPlan > 0) {
    let totalFactScheduled = 0;
    let totalFactConducted = 0;
    let totalFactSales = 0;
    let totalFactRevenue = 0;
    let totalFactCash = 0;
    
    activeLeads.forEach(l => {
      if (isDateInRange(l.fields['Дата консультации'], AnState.pfStartDate, AnState.pfEndDate)) {
        totalFactScheduled++;
        if (l.fields['Консультация проведена'] === true) {
          totalFactConducted++;
        }
      }
    });
    
    leads.forEach(l => {
      if (getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Продано' &&
          isDateInRange(l.fields['Дата продажи'] || l.fields['Дата'], AnState.pfStartDate, AnState.pfEndDate)) {
        totalFactSales++;
        totalFactRevenue += Number(l.fields['Бюджет']) || 0;
        totalFactCash += Number(l.fields['Оплата']) || 0;
      }
    });
    
    if (AnState.pfAvgCheck > 0) {
      avgCheck = AnState.pfAvgCheck;
    } else {
      avgCheck = totalFactSales > 0 ? totalFactRevenue / totalFactSales : 300000;
    }

    if (AnState.pfSalesConv > 0) {
      salesConv = AnState.pfSalesConv / 100;
    } else {
      salesConv = totalFactConducted > 0 ? totalFactSales / totalFactConducted : 0.40;
    }

    if (AnState.pfShowRate > 0) {
      showRate = AnState.pfShowRate / 100;
    } else {
      showRate = totalFactScheduled > 0 ? totalFactConducted / totalFactScheduled : 0.70;
    }

    cashRatio = totalFactRevenue > 0 ? totalFactCash / totalFactRevenue : 1.0;
    
    planRevenue = AnState.pfPlan;
    planSales = planRevenue / avgCheck;
    planConducted = salesConv > 0 ? planSales / salesConv : planSales / 0.40;
    planScheduled = showRate > 0 ? planConducted / showRate : planConducted / 0.70;
    planCash = planRevenue * cashRatio;
  }
  
  let html = `
    <div class="an-daily-table-container">
      <table class="an-daily-table ${AnState.pfPlan > 0 ? 'pf-active' : ''}">
  `;
  
  if (AnState.pfPlan > 0) {
    html += `
        <thead>
          <tr>
            <th rowspan="2">Дата</th>
            <th colspan="2">Назначено конс.</th>
            <th colspan="2">Проведено конс.</th>
            <th colspan="2">Кол-во продаж</th>
            <th colspan="2">Выручка</th>
            <th colspan="2">В кассу</th>
          </tr>
          <tr>
            <th>План</th>
            <th>Факт</th>
            <th>План</th>
            <th>Факт</th>
            <th>План</th>
            <th>Факт</th>
            <th>План</th>
            <th>Факт</th>
            <th>План</th>
            <th>Факт</th>
          </tr>
        </thead>
    `;
  } else {
    html += `
        <thead>
          <tr>
            <th>Дата</th>
            <th>Назначено конс.</th>
            <th>Проведено конс.</th>
            <th>Кол-во продаж</th>
            <th>Выручка</th>
            <th>В кассу</th>
          </tr>
        </thead>
    `;
  }
  
  html += '<tbody>';
  
  let wPlanScheduled = 0, wFactScheduled = 0;
  let wPlanConducted = 0, wFactConducted = 0;
  let wPlanSales = 0, wFactSales = 0;
  let wPlanRevenue = 0, wFactRevenue = 0;
  let wPlanCash = 0, wFactCash = 0;
  
  let pPlanScheduled = 0, pFactScheduled = 0;
  let pPlanConducted = 0, pFactConducted = 0;
  let pPlanSales = 0, pFactSales = 0;
  let pPlanRevenue = 0, pFactRevenue = 0;
  let pPlanCash = 0, pFactCash = 0;
  
  const daysOfWeekRu = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  let current = new Date(dStart.getTime());
  let weekStart = new Date(current.getTime());
  
  while (current <= dEnd) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const dayVal = String(current.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${dayVal}`;
    
    const dayOfWeek = current.getDay(); // 0 = Вс, 1 = Пн, ...
    const dayOfWeekRu = daysOfWeekRu[dayOfWeek];
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    
    // Факты
    const dayScheduledLeads = activeLeads.filter(l => isSameDay(l.fields['Дата консультации'], dateKey));
    const dayFactScheduled = dayScheduledLeads.length;
    
    const dayFactConducted = dayScheduledLeads.filter(l => l.fields['Консультация проведена'] === true).length;
    
    const daySalesLeads = leads.filter(l => 
      getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Продано' &&
      isSameDay(l.fields['Дата продажи'] || l.fields['Дата'], dateKey)
    );
    const dayFactSales = daySalesLeads.length;
    const dayFactRevenue = daySalesLeads.reduce((s, l) => s + (Number(l.fields['Бюджет']) || 0), 0);
    const dayFactCash = daySalesLeads.reduce((s, l) => s + (Number(l.fields['Оплата']) || 0), 0);
    
    // Планы на день
    let dayPlanScheduled = 0;
    let dayPlanConducted = 0;
    let dayPlanSales = 0;
    let dayPlanRevenue = 0;
    let dayPlanCash = 0;
    
    if (AnState.pfPlan > 0) {
      dayPlanScheduled = planScheduled / totalDays;
      dayPlanConducted = planConducted / totalDays;
      dayPlanSales = planSales / totalDays;
      dayPlanRevenue = planRevenue / totalDays;
      dayPlanCash = planCash / totalDays;
    }
    
    wPlanScheduled += dayPlanScheduled; wFactScheduled += dayFactScheduled;
    wPlanConducted += dayPlanConducted; wFactConducted += dayFactConducted;
    wPlanSales += dayPlanSales; wFactSales += dayFactSales;
    wPlanRevenue += dayPlanRevenue; wFactRevenue += dayFactRevenue;
    wPlanCash += dayPlanCash; wFactCash += dayFactCash;
    
    pPlanScheduled += dayPlanScheduled; pFactScheduled += dayFactScheduled;
    pPlanConducted += dayPlanConducted; pFactConducted += dayFactConducted;
    pPlanSales += dayPlanSales; pFactSales += dayFactSales;
    pPlanRevenue += dayPlanRevenue; pFactRevenue += dayFactRevenue;
    pPlanCash += dayPlanCash; pFactCash += dayFactCash;
    
    const weekendClass = isWeekend ? 'class="weekend-row"' : '';
    const dateFmt = `${dayVal}.${m}.${y} (${dayOfWeekRu})`;
    
    if (AnState.pfPlan > 0) {
      html += `
        <tr ${weekendClass}>
          <td class="date-cell">${dateFmt}</td>
          <td class="plan-val">${dayPlanScheduled.toFixed(1)}</td>
          <td class="fact-val">${dayFactScheduled}</td>
          <td class="plan-val">${dayPlanConducted.toFixed(1)}</td>
          <td class="fact-val">${dayFactConducted}</td>
          <td class="plan-val">${dayPlanSales.toFixed(1)}</td>
          <td class="fact-val">${dayFactSales}</td>
          <td class="plan-val revenue-cell">${dayPlanRevenue > 0 ? fmt(Math.round(dayPlanRevenue)) + ' ₸' : '—'}</td>
          <td class="fact-val revenue-cell">${dayFactRevenue > 0 ? fmt(dayFactRevenue) + ' ₸' : '—'}</td>
          <td class="plan-val cash-cell">${dayPlanCash > 0 ? fmt(Math.round(dayPlanCash)) + ' ₸' : '—'}</td>
          <td class="fact-val cash-cell">${dayFactCash > 0 ? fmt(dayFactCash) + ' ₸' : '—'}</td>
        </tr>
      `;
    } else {
      html += `
        <tr ${weekendClass}>
          <td class="date-cell">${dateFmt}</td>
          <td>${dayFactScheduled}</td>
          <td>${dayFactConducted}</td>
          <td>${dayFactSales}</td>
          <td class="revenue-cell">${dayFactRevenue > 0 ? fmt(dayFactRevenue) + ' ₸' : '—'}</td>
          <td class="cash-cell">${dayFactCash > 0 ? fmt(dayFactCash) + ' ₸' : '—'}</td>
        </tr>
      `;
    }
    
    const isLastDay = (current.getTime() === dEnd.getTime());
    if (dayOfWeek === 0 || isLastDay) {
      const startDayStr = String(weekStart.getDate()).padStart(2, '0');
      const startMonthStr = String(weekStart.getMonth() + 1).padStart(2, '0');
      const endDayStr = String(current.getDate()).padStart(2, '0');
      const endMonthStr = String(current.getMonth() + 1).padStart(2, '0');
      
      const weekLabel = `Итого за неделю (${startDayStr}.${startMonthStr} - ${endDayStr}.${endMonthStr})`;
      
      if (AnState.pfPlan > 0) {
        html += `
          <tr class="an-daily-week-total">
            <td>${weekLabel}</td>
            <td class="plan-val">${wPlanScheduled.toFixed(1)}</td>
            <td class="fact-val">${wFactScheduled}</td>
            <td class="plan-val">${wPlanConducted.toFixed(1)}</td>
            <td class="fact-val">${wFactConducted}</td>
            <td class="plan-val">${wPlanSales.toFixed(1)}</td>
            <td class="fact-val">${wFactSales}</td>
            <td class="plan-val">${wPlanRevenue > 0 ? fmt(Math.round(wPlanRevenue)) + ' ₸' : '—'}</td>
            <td class="fact-val">${wFactRevenue > 0 ? fmt(wFactRevenue) + ' ₸' : '—'}</td>
            <td class="plan-val">${wPlanCash > 0 ? fmt(Math.round(wPlanCash)) + ' ₸' : '—'}</td>
            <td class="fact-val">${wFactCash > 0 ? fmt(wFactCash) + ' ₸' : '—'}</td>
          </tr>
        `;
      } else {
        html += `
          <tr class="an-daily-week-total">
            <td>${weekLabel}</td>
            <td>${wFactScheduled}</td>
            <td>${wFactConducted}</td>
            <td>${wFactSales}</td>
            <td>${wFactRevenue > 0 ? fmt(wFactRevenue) + ' ₸' : '—'}</td>
            <td>${wFactCash > 0 ? fmt(wFactCash) + ' ₸' : '—'}</td>
          </tr>
        `;
      }
      
      wPlanScheduled = 0; wFactScheduled = 0;
      wPlanConducted = 0; wFactConducted = 0;
      wPlanSales = 0; wFactSales = 0;
      wPlanRevenue = 0; wFactRevenue = 0;
      wPlanCash = 0; wFactCash = 0;
      
      if (!isLastDay) {
        const nextDay = new Date(current.getTime());
        nextDay.setDate(current.getDate() + 1);
        nextDay.setHours(12, 0, 0, 0);
        weekStart = nextDay;
      }
    }
    
    current.setDate(current.getDate() + 1);
    current.setHours(12, 0, 0, 0);
  }
  
  if (AnState.pfPlan > 0) {
    html += `
        <tr class="an-daily-month-total">
          <td>Итого за период</td>
          <td class="plan-val">${pPlanScheduled.toFixed(1)}</td>
          <td class="fact-val">${pFactScheduled}</td>
          <td class="plan-val">${pPlanConducted.toFixed(1)}</td>
          <td class="fact-val">${pFactConducted}</td>
          <td class="plan-val">${pPlanSales.toFixed(1)}</td>
          <td class="fact-val">${pFactSales}</td>
          <td class="plan-val">${pPlanRevenue > 0 ? fmt(Math.round(pPlanRevenue)) + ' ₸' : '—'}</td>
          <td class="fact-val">${pFactRevenue > 0 ? fmt(pFactRevenue) + ' ₸' : '—'}</td>
          <td class="plan-val">${pPlanCash > 0 ? fmt(Math.round(pPlanCash)) + ' ₸' : '—'}</td>
          <td class="fact-val">${pFactCash > 0 ? fmt(pFactCash) + ' ₸' : '—'}</td>
        </tr>
    `;
  } else {
    html += `
        <tr class="an-daily-month-total">
          <td>Итого за период</td>
          <td>${pFactScheduled}</td>
          <td>${pFactConducted}</td>
          <td>${pFactSales}</td>
          <td>${pFactRevenue > 0 ? fmt(pFactRevenue) + ' ₸' : '—'}</td>
          <td>${pFactCash > 0 ? fmt(pFactCash) + ' ₸' : '—'}</td>
        </tr>
    `;
  }
  
  html += `
      </tbody>
    </table>
  </div>
  `;
  
  return html;
}

// 📣 ВКЛЮЧЕНИЕ — Маркетинг & Окупаемость трафика
function renderTabMarketing() {
  const cacheKey = `crm_mkt_cache_${AnState.mktStartDate}_${AnState.mktEndDate}_${AnState.mktAdAccountId}`;
  const cachedDataStr = localStorage.getItem(cacheKey);
  const cachedData = cachedDataStr ? JSON.parse(cachedDataStr) : { spend: 0, clicks: 0, impressions: 0 };
  
  const rawSpend = cachedData.spend || 0;
  const clicks = cachedData.clicks || 0;
  const impressions = cachedData.impressions || 0;
  const spendKzt = Math.round(rawSpend * AnState.mktUsdRate);

  // Сбор статистики по лидам из базы CRM за этот период
  let leadsList = State.leads || [];
  
  // Фильтруем лиды по дате (вхождение в диапазон)
  const periodLeads = leadsList.filter(l => 
    isDateInRange(l.fields['Дата'], AnState.mktStartDate, AnState.mktEndDate)
  );

  // Фильтруем лиды, у которых источник содержит FB/Inst/Таргет
  const fbLeads = periodLeads.filter(l => {
    const src = String(getField(l.fields, CONFIG.LEAD_FIELDS.source) || '').toLowerCase();
    return src.includes('facebook') || src.includes('instagram') || src.includes('fb') || src.includes('inst') || src.includes('таргет');
  });

  const totalLeads = fbLeads.length;

  // Фильтруем продажи за этот период, пришедшие из таргета
  const fbSalesLeads = leadsList.filter(l => 
    getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Продано' &&
    isDateInRange(l.fields['Дата продажи'] || l.fields['Дата'], AnState.mktStartDate, AnState.mktEndDate) &&
    (function() {
      const src = String(getField(l.fields, CONFIG.LEAD_FIELDS.source) || '').toLowerCase();
      return src.includes('facebook') || src.includes('instagram') || src.includes('fb') || src.includes('inst') || src.includes('таргет');
    })()
  );

  const totalSales = fbSalesLeads.length;
  const revenue = fbSalesLeads.reduce((sum, l) => sum + (Number(l.fields['Бюджет']) || 0), 0);

  // Метрики
  const CTR = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00';
  const CPC = clicks > 0 ? Math.round(spendKzt / clicks) : 0;
  const CPL = totalLeads > 0 ? Math.round(spendKzt / totalLeads) : 0;
  const CR_Lead = clicks > 0 ? ((totalLeads / clicks) * 100).toFixed(1) : '0.0';
  const CR_Sale = totalLeads > 0 ? ((totalSales / totalLeads) * 100).toFixed(1) : '0.0';
  const CAC = totalSales > 0 ? Math.round(spendKzt / totalSales) : 0;
  const ROMI = spendKzt > 0 ? Math.round(((revenue - spendKzt) / spendKzt) * 100) : 0;

  const html = `
    <div class="an-marketing-container">
      <div class="an-stats-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:24px;">
        <!-- Расход -->
        <div class="an-stat-card" style="background:rgba(239, 68, 68, 0.05); border:1px solid rgba(239, 68, 68, 0.15); padding:16px 20px; border-radius:16px; box-sizing:border-box;">
          <div class="an-stat-label" style="color:#fca5a5; font-size:11px; text-transform:uppercase; font-weight:700; margin-bottom:6px; letter-spacing:0.05em;">💰 Расход рекламы</div>
          <div class="an-stat-value" style="color:#ef4444; font-size:24px; font-weight:800; line-height:1.2;">${fmt(spendKzt)} ₸</div>
          <div class="an-stat-desc" style="color:#f87171; font-size:11px; margin-top:4px;">$ ${rawSpend.toFixed(2)} (курс ${AnState.mktUsdRate})</div>
        </div>
        
        <!-- Трафик -->
        <div class="an-stat-card" style="background:rgba(59, 130, 246, 0.05); border:1px solid rgba(59, 130, 246, 0.15); padding:16px 20px; border-radius:16px; box-sizing:border-box;">
          <div class="an-stat-label" style="color:#93c5fd; font-size:11px; text-transform:uppercase; font-weight:700; margin-bottom:6px; letter-spacing:0.05em;">📈 Трафик (Клики / Показы)</div>
          <div class="an-stat-value" style="color:#3b82f6; font-size:24px; font-weight:800; line-height:1.2;">${fmt(clicks)} / ${fmt(impressions)}</div>
          <div class="an-stat-desc" style="color:#60a5fa; font-size:11px; margin-top:4px;">CTR: <strong>${CTR}%</strong> | CPC: <strong>${CPC} ₸</strong></div>
        </div>

        <!-- Лиды -->
        <div class="an-stat-card" style="background:rgba(45, 212, 191, 0.05); border:1px solid rgba(45, 212, 191, 0.15); padding:16px 20px; border-radius:16px; box-sizing:border-box;">
          <div class="an-stat-label" style="color:#99f6e4; font-size:11px; text-transform:uppercase; font-weight:700; margin-bottom:6px; letter-spacing:0.05em;">🎯 Лиды (Таргет FB/Inst)</div>
          <div class="an-stat-value" style="color:#0d9488; font-size:24px; font-weight:800; line-height:1.2;">${totalLeads}</div>
          <div class="an-stat-desc" style="color:#14b8a6; font-size:11px; margin-top:4px;">Конв. в лид: <strong>${CR_Lead}%</strong> | CPL: <strong>${fmt(CPL)} ₸</strong></div>
        </div>

        <!-- Результат -->
        <div class="an-stat-card" style="background:rgba(16, 185, 129, 0.05); border:1px solid rgba(16, 185, 129, 0.15); padding:16px 20px; border-radius:16px; box-sizing:border-box;">
          <div class="an-stat-label" style="color:#6ee7b7; font-size:11px; text-transform:uppercase; font-weight:700; margin-bottom:6px; letter-spacing:0.05em;">🏆 Продажи и Выручка</div>
          <div class="an-stat-value" style="color:#10b981; font-size:24px; font-weight:800; line-height:1.2;">${totalSales} / ${fmt(revenue)} ₸</div>
          <div class="an-stat-desc" style="color:#34d399; font-size:11px; margin-top:4px;">CAC: <strong>${fmt(CAC)} ₸</strong> | ROMI: <strong>${ROMI}%</strong></div>
        </div>
      </div>

      <!-- Детальная воронка маркетинга -->
      <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:16px; padding:20px; margin-bottom:24px;">
        <h3 style="margin-top:0; margin-bottom:20px; font-size:16px; font-weight:700; color:#fff; display:flex; align-items:center; gap:8px;">📊 Воронка окупаемости таргета</h3>
        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Показы -->
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="width:140px; font-size:13px; color:var(--text2); font-weight:600;">Показы</div>
            <div style="flex:1; min-width:200px; height:24px; background:rgba(255,255,255,0.03); border-radius:12px; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,0.05);">
              <div style="width:100%; height:100%; background:linear-gradient(90deg, #3b82f6, #1d4ed8); border-radius:12px;"></div>
              <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:12px; font-weight:800; color:#fff;">${fmt(impressions)}</span>
            </div>
            <div style="width:100px; font-size:12px; color:var(--text2); text-align:right; font-weight:700;">—</div>
          </div>
          <!-- Клики -->
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="width:140px; font-size:13px; color:var(--text2); font-weight:600;">Клики (переходы)</div>
            <div style="flex:1; min-width:200px; height:24px; background:rgba(255,255,255,0.03); border-radius:12px; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,0.05);">
              <div style="width:${parseFloat(CTR) > 0 ? Math.min(100, parseFloat(CTR) * 15) : 0}%; height:100%; background:linear-gradient(90deg, #8b5cf6, #6d28d9); border-radius:12px; min-width:4px;"></div>
              <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:12px; font-weight:800; color:#fff;">${fmt(clicks)}</span>
            </div>
            <div style="width:100px; font-size:12px; color:#a78bfa; text-align:right; font-weight:700;">CTR: ${CTR}%</div>
          </div>
          <!-- Лиды -->
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="width:140px; font-size:13px; color:var(--text2); font-weight:600;">Лиды (заявки)</div>
            <div style="flex:1; min-width:200px; height:24px; background:rgba(255,255,255,0.03); border-radius:12px; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,0.05);">
              <div style="width:${parseFloat(CR_Lead) > 0 ? Math.min(100, parseFloat(CR_Lead) * 4) : 0}%; height:100%; background:linear-gradient(90deg, #06b6d4, #0891b2); border-radius:12px; min-width:4px;"></div>
              <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:12px; font-weight:800; color:#fff;">${totalLeads}</span>
            </div>
            <div style="width:100px; font-size:12px; color:#22d3ee; text-align:right; font-weight:700;">CR Лид: ${CR_Lead}%</div>
          </div>
          <!-- Продажи -->
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <div style="width:140px; font-size:13px; color:var(--text2); font-weight:600;">Продажи (сделки)</div>
            <div style="flex:1; min-width:200px; height:24px; background:rgba(255,255,255,0.03); border-radius:12px; overflow:hidden; position:relative; border:1px solid rgba(255,255,255,0.05);">
              <div style="width:${parseFloat(CR_Sale) > 0 ? Math.min(100, parseFloat(CR_Sale) * 5) : 0}%; height:100%; background:linear-gradient(90deg, #10b981, #059669); border-radius:12px; min-width:4px;"></div>
              <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:12px; font-weight:800; color:#fff;">${totalSales}</span>
            </div>
            <div style="width:100px; font-size:12px; color:#34d399; text-align:right; font-weight:700;">CR Прод: ${CR_Sale}%</div>
          </div>
        </div>
      </div>
    </div>
  `;
  return html;
}

function anApplyMarketingFilters() {
  const startVal = document.getElementById('an-mkt-start-date').value;
  const endVal = document.getElementById('an-mkt-end-date').value;
  const webhookVal = document.getElementById('an-mkt-webhook-input').value.trim();
  const accountVal = document.getElementById('an-mkt-account-input').value.trim();
  const rateVal = parseFloat(document.getElementById('an-mkt-rate-input').value) || 450;

  if (!startVal || !endVal) {
    toast('Выберите диапазон дат', 'error');
    return;
  }

  AnState.mktStartDate = startVal;
  AnState.mktEndDate = endVal;
  AnState.mktWebhookUrl = webhookVal;
  AnState.mktAdAccountId = accountVal;
  AnState.mktUsdRate = rateVal;

  localStorage.setItem('crm_mkt_n8n_webhook', webhookVal);
  localStorage.setItem('crm_mkt_fb_account', accountVal);
  localStorage.setItem('crm_mkt_usd_rate', rateVal);

  renderAnalytics();
}

async function anFetchFacebookData() {
  const webhookUrl = document.getElementById('an-mkt-webhook-input').value.trim();
  const accountId = document.getElementById('an-mkt-account-input').value.trim();
  const startDate = document.getElementById('an-mkt-start-date').value;
  const endDate = document.getElementById('an-mkt-end-date').value;
  
  if (!webhookUrl) {
    toast('Укажите n8n Webhook URL', 'error');
    return;
  }
  if (!accountId) {
    toast('Укажите FB Ad Account ID', 'error');
    return;
  }

  const btn = document.getElementById('an-mkt-load-btn');
  const oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:12px; height:12px; border-width:2px; vertical-align:middle; display:inline-block; border: 2px solid #fff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right:6px;"></span> Загрузка...`;

  try {
    anApplyMarketingFilters();

    const url = `${webhookUrl}?start_date=${startDate}&end_date=${endDate}&ad_account_id=${accountId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Ошибка сервера n8n: ${res.status}`);
    const data = await res.json();
    
    // Ожидаемый формат ответа от n8n:
    // { spend: 120.45, clicks: 1500, impressions: 85000 }
    const spend = parseFloat(data.spend) || 0;
    const clicks = parseInt(data.clicks) || 0;
    const impressions = parseInt(data.impressions) || 0;

    const cacheKey = `crm_mkt_cache_${startDate}_${endDate}_${accountId}`;
    const resultObj = { spend, clicks, impressions };
    localStorage.setItem(cacheKey, JSON.stringify(resultObj));

    toast('Данные успешно загружены из Facebook!', 'success');
  } catch (e) {
    console.error(e);
    toast(`Не удалось загрузить данные: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldText;
    renderAnalytics();
  }
}

// ══════════════════════════════════════════════
// ВКЛ. 1 — Воронка / Трафик
// ══════════════════════════════════════════════
function renderTabFunnel() {
  const filtered = applyPeriodFilter(State.leads);
  const all      = State.leads;
  const now      = new Date();

  // ── KPI плашки (живые по периоду событий)
  const total    = filtered.length; // Новых лидов создано в период
  
  const soldLeads = all.filter(l => 
    getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Продано' &&
    isDateInPeriod(l.fields['Дата продажи'] || l.fields['Дата'], AnState.period)
  );
  const sold     = soldLeads.length;
  const revenue  = soldLeads.reduce((s,l) => s + (Number(l.fields['Бюджет'])||0), 0);
  
  const refundLeads = all.filter(l => 
    getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Возвраты' &&
    isDateInPeriod(l.fields['Дата возврата'] || l.fields['Дата'], AnState.period)
  );
  const refunds  = refundLeads.length;
  const convPct  = total ? Math.round(sold/total*100) : 0;

  const kpi = `<div class="an-summary" style="margin-bottom:20px">
    <div class="an-chip blue">Новых лидов <strong>${total}</strong></div>
    <div class="an-chip green">Продано <strong>${sold}</strong></div>
    <div class="an-chip green">Выручка <strong>${fmt(revenue)} ₸</strong></div>
    <div class="an-chip blue">Конверсия <strong>${convPct}%</strong></div>
    ${refunds ? `<div class="an-chip red">Возвраты <strong>${refunds}</strong></div>` : ''}
  </div>`;

  // ── Графики воронки
  const chartSection = `
    <div class="an-charts-row" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div class="an-chart-card">
        <div class="an-chart-title">Лиды по этапам</div>
        <div style="position:relative;height:260px"><canvas id="chart-stages"></canvas></div>
      </div>
      <div class="an-chart-card">
        <div class="an-chart-title">Источники трафика</div>
        <div style="position:relative;height:260px"><canvas id="chart-sources"></canvas></div>
      </div>
    </div>
    <div class="an-charts-row" style="display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:24px">
      <div class="an-chart-card">
        <div class="an-chart-title">Выручка по месяцам</div>
        <div style="position:relative;height:200px"><canvas id="chart-monthly"></canvas></div>
      </div>
    </div>`;

  // ── Таблица 1: Этапы воронки (текущий снимок — все лиды, не фильтрованные)
  const byStage = {};
  all.forEach(l => {
    const s = getField(l.fields,CONFIG.LEAD_FIELDS.stage)||'Новая заявка';
    if (!byStage[s]) byStage[s] = { count:0, budget:0, days:[] };
    byStage[s].count++;
    byStage[s].budget += Number(l.fields['Бюджет'])||0;
    const d = parseLeadDate(l);
    if (d) byStage[s].days.push(daysBetween(d, now));
  });

  const stageRows = FUNNEL_STAGES.map(st => {
    const data = byStage[st.key] || { count:0, budget:0, days:[] };
    const avg  = data.days.length ? Math.round(data.days.reduce((s,x)=>s+x,0)/data.days.length) : 0;
    const pct  = all.length ? Math.round(data.count/all.length*100) : 0;
    const dotColor = st.color;
    return `<tr>
      <td>
        <span style="display:inline-flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></span>
          ${escHtml(st.key)}
        </span>
      </td>
      <td style="font-weight:700;color:var(--text)">${data.count}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${dotColor};border-radius:99px;min-width:${data.count?2:0}px"></div>
          </div>
          <span style="font-size:11px;color:var(--text2);width:28px;text-align:right">${pct}%</span>
        </div>
      </td>
      <td style="color:#34d399;font-weight:600">${data.budget ? fmt(data.budget)+' ₸' : '—'}</td>
      <td style="color:var(--text2);font-size:12px">${avg ? avg+' дн.' : '—'}</td>
    </tr>`;
  }).join('');

  const funnelTable = `
    <div style="margin-bottom:8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text2)">
      Текущий снимок воронки (все лиды)
    </div>
    <div class="an-table-wrap" style="margin-bottom:24px"><table class="an-table">
      <thead><tr>
        <th class="no-sort">Этап</th>
        <th class="no-sort">Лидов</th>
        <th class="no-sort" style="min-width:140px">Доля</th>
        <th class="no-sort">Бюджет</th>
        <th class="no-sort">Ср. время</th>
      </tr></thead>
      <tbody>${stageRows}</tbody>
      <tfoot><tr>
        <td>Всего</td>
        <td style="font-weight:800">${all.length}</td>
        <td></td>
        <td class="sum-cell">${fmt(all.reduce((s,l)=>s+(Number(l.fields['Бюджет'])||0),0))} ₸</td>
        <td></td>
      </tr></tfoot>
    </table></div>`;

  // ── Таблица 2: По источникам (фильтрованные)
  const bySrc = {};
  filtered.forEach(l => {
    const s = getField(l.fields,CONFIG.LEAD_FIELDS.source)||'Без источника';
    if (!bySrc[s]) bySrc[s] = { count:0, sold:0, revenue:0 };
    bySrc[s].count++;
    if (getField(l.fields,CONFIG.LEAD_FIELDS.stage)==='Продано') {
      bySrc[s].sold++;
      bySrc[s].revenue += Number(l.fields['Бюджет'])||0;
    }
  });
  const srcRows = Object.entries(bySrc)
    .sort((a,b) => b[1].count - a[1].count)
    .map(([src, d]) => {
      const conv = d.count ? Math.round(d.sold/d.count*100) : 0;
      return `<tr>
        <td style="font-weight:600">${escHtml(src)}</td>
        <td style="font-weight:700;color:var(--text)">${d.count}</td>
        <td style="color:#34d399;font-weight:700">${d.sold}</td>
        <td style="color:#818cf8;font-weight:700">${conv}%</td>
        <td style="color:#34d399">${d.revenue ? fmt(d.revenue)+' ₸' : '—'}</td>
      </tr>`;
    }).join('');

  const srcTable = srcRows ? `
    <div style="margin-bottom:8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text2)">
      По источникам трафика (за выбранный период)
    </div>
    <div class="an-table-wrap" style="margin-bottom:24px"><table class="an-table">
      <thead><tr>
        <th class="no-sort">Источник</th>
        <th class="no-sort">Лидов</th>
        <th class="no-sort">Продаж</th>
        <th class="no-sort">Конверсия</th>
        <th class="no-sort">Выручка</th>
      </tr></thead>
      <tbody>${srcRows}</tbody>
    </table></div>` : '';

  // ── Таблица 3: По дням (если не "всё время")
  let dayTable = '';
  if (AnState.period !== 'all') {
    const byDay = {};
    filtered.forEach(l => {
      const d = parseLeadDate(l);
      if (!d) return;
      const key = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
      if (!byDay[key]) byDay[key] = { count:0, sold:0 };
      byDay[key].count++;
      if (getField(l.fields,CONFIG.LEAD_FIELDS.stage)==='Продано') byDay[key].sold++;
    });
    const dayRows = Object.entries(byDay)
      .sort((a,b) => {
        const pa = a[0].split('.'), pb = b[0].split('.');
        return new Date(+pb[2],+pb[1]-1,+pb[0]) - new Date(+pa[2],+pa[1]-1,+pa[0]);
      })
      .map(([day, d]) => `<tr>
        <td style="font-weight:600;color:var(--text2)">${day}</td>
        <td style="font-weight:700">${d.count}</td>
        <td style="color:#34d399;font-weight:700">${d.sold || '—'}</td>
      </tr>`).join('');

    if (dayRows) dayTable = `
      <div style="margin-bottom:8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text2)">
        По дням
      </div>
      <div class="an-table-wrap"><table class="an-table">
        <thead><tr>
          <th class="no-sort">День</th>
          <th class="no-sort">Лидов</th>
          <th class="no-sort">Продаж</th>
        </tr></thead>
        <tbody>${dayRows}</tbody>
      </table></div>`;
  }

  return kpi + chartSection + funnelTable + srcTable + dayTable;
}

// ══════════════════════════════════════════════
// ВКЛ. 2 — По менеджерам
// ══════════════════════════════════════════════
function renderTabManagers() {
  const allLeads = State.leads;

  // Собираем метрики по каждому менеджеру
  const mgMap = {};
  const ensureMg = mg => {
    if (!mgMap[mg]) mgMap[mg] = {
      total: 0,           // всего лидов создано в период
      consultBooked: 0,   // назначено консультаций в период
      consultDone: 0,     // проведено консультаций в период
      sold: 0,            // продаж
      revenue: 0,         // выручка
      refunds: 0,         // возвратов
    };
  };

  allLeads.forEach(l => {
    const mg    = l.fields['Менеджер'] || '—';
    const stage = getField(l.fields, CONFIG.LEAD_FIELDS.stage) || 'Новая заявка';
    const budget = Number(l.fields['Бюджет']) || 0;
    
    ensureMg(mg);

    // 1. Лидов создано в период
    if (isDateInPeriod(l.fields['Дата'], AnState.period)) {
      mgMap[mg].total++;
    }

    // 2. Назначено консультаций в период (Дата назначения или fallback)
    const assignDate = l.fields['Дата назначения'] || l.fields['Дата консультации'];
    if (assignDate && isDateInPeriod(assignDate, AnState.period)) {
      mgMap[mg].consultBooked++;
    }

    // 3. Проведено консультаций в период
    if (l.fields['Консультация проведена'] === true && l.fields['Дата консультации'] && isDateInPeriod(l.fields['Дата консультации'], AnState.period)) {
      mgMap[mg].consultDone++;
    }

    // 4. Продано в период
    if (stage === 'Продано' && isDateInPeriod(l.fields['Дата продажи'] || l.fields['Дата'], AnState.period)) {
      mgMap[mg].sold++;
      mgMap[mg].revenue += budget;
    }

    // 5. Возвраты в период
    if (stage === 'Возвраты' && isDateInPeriod(l.fields['Дата возврата'] || l.fields['Дата'], AnState.period)) {
      mgMap[mg].refunds++;
    }
  });

  if (!Object.keys(mgMap).length || (Object.keys(mgMap).length === 1 && mgMap['—'])) {
    return `<div class="an-empty">👤 Нет данных. Назначьте менеджеров в карточках лидов.</div>`;
  }

  // Итоги по всем
  const totals = Object.values(mgMap).reduce((acc, d) => {
    acc.total         += d.total;
    acc.consultBooked += d.consultBooked;
    acc.consultDone   += d.consultDone;
    acc.sold          += d.sold;
    acc.revenue       += d.revenue;
    acc.refunds       += d.refunds;
    return acc;
  }, {total:0, consultBooked:0, consultDone:0, sold:0, revenue:0, refunds:0});

  const sortedMgrs = Object.entries(mgMap).sort((a,b) => b[1].sold - a[1].sold);

  const rows = sortedMgrs.map(([mg, d]) => {
    const conv = d.total ? Math.round(d.sold/d.total*100) : 0;
    const convColor = conv >= 20 ? '#34d399' : conv >= 10 ? '#f59e0b' : '#9ca3af';
    return `<tr>
      <td>
        <span style="display:inline-flex;align-items:center;gap:8px">
          <span style="width:28px;height:28px;border-radius:50%;background:${getManagerColor(mg)};display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff;flex-shrink:0">${mg.charAt(0).toUpperCase()}</span>
          <span style="font-weight:700">${escHtml(mg)}</span>
        </span>
      </td>
      <td style="text-align:center;font-weight:700">${d.total}</td>
      <td style="text-align:center;font-weight:700;color:#818cf8">${d.consultBooked}</td>
      <td style="text-align:center;font-weight:700;color:#a78bfa">${d.consultDone}</td>
      <td style="text-align:center;font-weight:800;color:#22c55e;font-size:15px">${d.sold}</td>
      <td style="text-align:right;font-weight:700;color:#34d399">${d.revenue ? fmt(d.revenue)+' ₸' : '—'}</td>
      <td style="text-align:center;font-weight:700;color:${convColor}">${conv}%</td>
      <td style="text-align:center;font-weight:700;color:${d.refunds?'#f87171':'var(--text2)'}">${d.refunds || '—'}</td>
    </tr>`;
  }).join('');

  // Итоговая строка
  const totalConv = totals.total ? Math.round(totals.sold/totals.total*100) : 0;

  // Плашки-подсказки
  const periodLabel = {all:'за всё время', today:'сегодня', week:'за неделю', month:'за месяц'}[AnState.period];
  const kpi = `<div class="an-summary" style="margin-bottom:20px">
    <div class="an-chip blue">Новых лидов <strong>${totals.total}</strong></div>
    <div class="an-chip blue">📅 Консульт. назначено <strong>${totals.consultBooked}</strong></div>
    <div class="an-chip blue">✅ Консульт. проведено <strong>${totals.consultDone}</strong></div>
    <div class="an-chip green">Продаж <strong>${totals.sold}</strong></div>
    <div class="an-chip green">Выручка <strong>${fmt(totals.revenue)} ₸</strong></div>
    ${totals.refunds ? `<div class="an-chip red">Возвраты <strong>${totals.refunds}</strong></div>` : ''}
  </div>`;

  const hint = `<div style="font-size:11px;color:var(--text2);margin-bottom:12px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:10px;border:var(--border)">
    📌 Данные ${periodLabel}. <b>📅 Назначено</b> — дата назначения консультации в выбранном периоде. <b>✅ Проведено</b> — флаг проведения установлен, а дата консультации в выбранном периоде.
  </div>`;

  const table = `<div class="an-table-wrap"><table class="an-table">
    <thead><tr>
      <th class="no-sort">Менеджер</th>
      <th class="no-sort" style="text-align:center">Новых лидов</th>
      <th class="no-sort" style="text-align:center">📅 Назначено</th>
      <th class="no-sort" style="text-align:center">✅ Проведено</th>
      <th class="no-sort" style="text-align:center">💰 Продаж</th>
      <th class="no-sort" style="text-align:right">Выручка</th>
      <th class="no-sort" style="text-align:center">Конверсия</th>
      <th class="no-sort" style="text-align:center">↩️ Возвр.</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td style="font-weight:800">Итого</td>
      <td style="text-align:center;font-weight:800">${totals.total}</td>
      <td style="text-align:center;font-weight:800;color:#818cf8">${totals.consultBooked}</td>
      <td style="text-align:center;font-weight:800;color:#a78bfa">${totals.consultDone}</td>
      <td style="text-align:center;font-weight:800;color:#22c55e">${totals.sold}</td>
      <td class="sum-cell" style="text-align:right">${fmt(totals.revenue)} ₸</td>
      <td style="text-align:center;font-weight:800">${totalConv}%</td>
      <td style="text-align:center;font-weight:800;color:${totals.refunds?'#f87171':'var(--text2)'}">${totals.refunds||'—'}</td>
    </tr></tfoot>
  </table></div>`;

  // Сводный лог консультаций по дням
  const dailyLogs = {};
  allLeads.forEach(l => {
    const mg = l.fields['Менеджер'] || '—';
    
    // Назначено
    const assignDate = l.fields['Дата назначения'] || l.fields['Дата консультации'];
    if (assignDate && isDateInPeriod(assignDate, AnState.period)) {
      const dStr = toDbDateFormat(toInputDateFormat(assignDate));
      if (!dailyLogs[dStr]) dailyLogs[dStr] = {};
      if (!dailyLogs[dStr][mg]) dailyLogs[dStr][mg] = { booked: 0, done: 0 };
      dailyLogs[dStr][mg].booked++;
    }
    
    // Проведено
    if (l.fields['Консультация проведена'] === true && l.fields['Дата консультации'] && isDateInPeriod(l.fields['Дата консультации'], AnState.period)) {
      const dStr = toDbDateFormat(toInputDateFormat(l.fields['Дата консультации']));
      if (!dailyLogs[dStr]) dailyLogs[dStr] = {};
      if (!dailyLogs[dStr][mg]) dailyLogs[dStr][mg] = { booked: 0, done: 0 };
      dailyLogs[dStr][mg].done++;
    }
  });

  let dailyTable = '';
  const dayKeys = Object.keys(dailyLogs).sort((a, b) => {
    return parseDateStr(b) - parseDateStr(a);
  });

  if (dayKeys.length > 0) {
    const dailyRows = [];
    dayKeys.forEach(day => {
      Object.entries(dailyLogs[day]).forEach(([mg, stats]) => {
        dailyRows.push(`<tr>
          <td style="font-weight:600;color:var(--text2)">${day}</td>
          <td>
            <span style="display:inline-flex;align-items:center;gap:8px">
              <span style="width:20px;height:20px;border-radius:50%;background:${getManagerColor(mg)};display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff;flex-shrink:0">${mg.charAt(0).toUpperCase()}</span>
              <span>${escHtml(mg)}</span>
            </span>
          </td>
          <td style="text-align:center;font-weight:700;color:#818cf8">${stats.booked || '—'}</td>
          <td style="text-align:center;font-weight:700;color:#a78bfa">${stats.done || '—'}</td>
        </tr>`);
      });
    });

    dailyTable = `
      <div style="margin-top:28px;margin-bottom:8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text2)">
        📅 Детализация консультаций по дням (назначено/проведено)
      </div>
      <div class="an-table-wrap"><table class="an-table">
        <thead><tr>
          <th class="no-sort">Дата</th>
          <th class="no-sort">Менеджер</th>
          <th class="no-sort" style="text-align:center">📅 Назначено</th>
          <th class="no-sort" style="text-align:center">✅ Проведено</th>
        </tr></thead>
        <tbody>${dailyRows.join('')}</tbody>
      </table></div>`;
  }

  const mgCharts = `
    <div class="an-charts-row" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;margin-top:4px">
      <div class="an-chart-card">
        <div class="an-chart-title">Выручка по менеджерам</div>
        <div style="position:relative;height:220px"><canvas id="chart-mg-revenue"></canvas></div>
      </div>
      <div class="an-chart-card">
        <div class="an-chart-title">Лиды и продажи</div>
        <div style="position:relative;height:220px"><canvas id="chart-mg-sales"></canvas></div>
      </div>
    </div>`;
  return kpi + mgCharts + hint + table + dailyTable;
}

// ══════════════════════════════════════════════
// ВКЛ. 3 — Возвраты
// ══════════════════════════════════════════════
function renderTabRefunds() {
  const rows = State.leads.filter(l => 
    getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Возвраты' &&
    isDateInPeriod(l.fields['Дата возврата'] || l.fields['Дата'], AnState.period)
  );
  const total = rows.reduce((s,l) => s + (Number(l.fields['Бюджет'])||0), 0);

  const summary = `<div class="an-summary">
    <div class="an-chip red">Возвратов <strong>${rows.length}</strong></div>
    <div class="an-chip red">Сумма <strong>${fmt(total)} ₸</strong></div>
  </div>`;

  if (!rows.length) return summary + `<div class="an-empty">✅ Возвратов за этот период нет</div>`;

  const tbody = rows.map(l => {
    const name    = escHtml(getField(l.fields, CONFIG.LEAD_FIELDS.name) || '—');
    const phone   = escHtml(getField(l.fields, CONFIG.LEAD_FIELDS.phone) || '');
    const mg      = escHtml(l.fields['Менеджер'] || '—');
    const budget  = Number(l.fields['Бюджет']) || 0;
    const date    = escHtml(formatDate(l.fields['Дата возврата'] || getField(l.fields, CONFIG.LEAD_FIELDS.date)));
    const comment = escHtml(l.fields['Комментарий'] || '');
    return `<tr>
      <td style="font-weight:600">${name}</td>
      <td style="color:var(--text2)">${phone}</td>
      <td><span style="font-size:11px;font-weight:600;color:#818cf8">${mg}</span></td>
      <td style="color:#f87171;font-weight:700">${budget ? fmt(budget)+' ₸' : '—'}</td>
      <td style="color:var(--text2);white-space:nowrap">${date}</td>
      <td style="color:var(--text2);font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${comment}</td>
    </tr>`;
  }).join('');

  return summary + `
    <div class="an-table-wrap"><table class="an-table">
      <thead><tr>
        <th class="no-sort">Клиент</th>
        <th class="no-sort">Телефон</th>
        <th class="no-sort">Менеджер</th>
        <th class="no-sort">Сумма</th>
        <th class="no-sort">Дата</th>
        <th class="no-sort">Комментарий</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
      <tfoot><tr>
        <td colspan="3">Возвратов: ${rows.length}</td>
        <td style="color:#f87171;font-weight:800">${fmt(total)} ₸</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table></div>`;
}

// ══════════════════════════════════════════════
// ВКЛ. 4 — Юнит-экономика
// ══════════════════════════════════════════════
// Явный маппинг: ключ колонки тарифа (без "Кол-во: ") → название услуги в SERVICES
const TARIFF_SERVICE_MAP = {
  'Сценарий Reels':              'Сценарий Reels',
  'Съемка Reels':                'Съемка Reels',
  'Монтаж Reels':                'Монтаж Reels',
  'Сторителлингов сторис':       '1 день сторителлинг сторис',
  'Тредс':                       '1 день тредс',
  'Телеграм чат':                '1 пост Телеграм',
  'Вацап чат':                   '1 пост Вацап чат',
  'Чат бот':                     'Чат бот настройка',
  'Мультипостинг':               'Мультипостинг настройка',
  'Таргет ФБ':                   'Таргет ФБ настройка',
  'Карусели':                    'Карусели 1 пост',
  'Упаковка':                    'Упаковка настройка',
  'Консалтинг':                  'Консалтинг',
  'Постинг рилс и сторис':       'Постинг рилс и сторис',
  'YouTube видео (Презентация)': 'YouTube видео (Презентация)',
  'YouTube видео (Сценарий)':    'YouTube видео (Сценарий)',
  'YouTube видео (Съемка)':      'YouTube видео (Съемка)',
  'YouTube видео (Монтаж)':      'YouTube видео (Монтаж)',
  'YouTube видео (Публикация)':  'YouTube видео (Публикация)',
  'Бриф-разбор':                 'Бриф-разбор',
};

function findServiceName(tariffKey) {
  // tariffKey приходит как "Кол-во: Съемка Reels" или просто "Съемка Reels"
  const stripped = tariffKey.replace(/^Кол-во:\s*/i, '').trim();
  // Точный поиск по маппингу
  if (TARIFF_SERVICE_MAP[stripped]) return TARIFF_SERVICE_MAP[stripped];
  // Фолбек: нечёткий поиск
  const norm = stripped.toLowerCase().replace(/ё/g, 'е');
  if (norm.includes('сторителлинг') || (norm.includes('сторис') && !norm.includes('постинг'))) return '1 день сторителлинг сторис';
  if (norm.includes('постинг')) return 'Постинг рилс и сторис';
  if (norm.includes('тредс')) return '1 день тредс';
  if (norm.includes('телеграм')) return '1 пост Телеграм';
  if (norm.includes('вацап')) return '1 пост Вацап чат';
  if (norm.includes('чат бот')) return 'Чат бот настройка';
  if (norm.includes('мультипостинг')) return 'Мультипостинг настройка';
  if (norm.includes('таргет')) return 'Таргет ФБ настройка';
  if (norm.includes('карусели')) return 'Карусели 1 пост';
  if (norm.includes('упаковка')) return 'Упаковка настройка';
  if (norm.includes('консалтинг')) return 'Консалтинг';
  if (norm.includes('бриф')) return 'Бриф-разбор';
  if (norm.includes('сценарий') && !norm.includes('youtube')) return 'Сценарий Reels';
  if (norm.includes('съемка') && !norm.includes('youtube')) return 'Съемка Reels';
  if (norm.includes('монтаж') && !norm.includes('youtube')) return 'Монтаж Reels';
  if (norm.includes('презентация')) return 'YouTube видео (Презентация)';
  if (norm.includes('youtube')) {
    if (norm.includes('сценарий')) return 'YouTube видео (Сценарий)';
    if (norm.includes('съемка')) return 'YouTube видео (Съемка)';
    if (norm.includes('монтаж')) return 'YouTube видео (Монтаж)';
    if (norm.includes('публикация')) return 'YouTube видео (Публикация)';
  }
  return stripped;
}

function renderTabEconomics() {
  if (!State.services || State.services.length === 0) {
    return `<div class="an-empty">⚠️ Услуги не загружены. Попробуйте обновить данные.</div>`;
  }
  if (!State.tariffs || State.tariffs.length === 0) {
    return `<div class="an-empty">⚠️ Тарифы не загружены. Попробуйте обновить данные.</div>`;
  }

  // Создаем словарь услуг для быстрого поиска
  const serviceLookup = {};
  State.services.forEach(s => {
    const fields = s.fields || {};
    const name = fields["Название услуги"];
    if (name) {
      serviceLookup[name] = {
        sebes: Number(fields["Себестоимость"]) || 0,
        sale: Number(fields["Цена продажи"]) || 0,
        unit: fields["Ед. измерения"] || 'шт'
      };
    }
  });

  const detailedTariffs = [];

  for (const tariff of State.tariffs) {
    const name = tariff.fields["Название"] || tariff.fields["Название тарифа"];
    if (!name) continue;
    const salePrice = Number(tariff.fields["Стоимость"] || tariff.fields["Цена"]) || 0;
    let totalCost = 0;
    const breakdown = [];

    // Бежим по колонкам тарифа
    for (const [key, qtyVal] of Object.entries(tariff.fields)) {
      const qty = Number(qtyVal) || 0;
      if (key.startsWith("Кол-во:") && qty > 0) {
        const serviceName = findServiceName(key);
        const service = serviceLookup[serviceName];

        if (service) {
          let itemCost = 0;
          let note = "";

          let displayQty = qty;
          let displayUnit = service.unit;
          let displayUnitCost = service.sebes;

          if (serviceName === "Съемка Reels") {
            const estimatedHours = qty / 10;
            itemCost = estimatedHours * (serviceLookup["Съемка Reels"]?.sebes || 10000);
            // Показываем эффективную стоимость за рилс (10 000 ÷ 10 = 1 000 ₸/рилс)
            displayUnitCost = Math.round(itemCost / qty);
            note = `норматив: 10 рилс = 1 ч (${fmt(serviceLookup["Съемка Reels"]?.sebes || 10000)} ₸/ч)`;
          } else if (serviceName === "YouTube видео (Съемка)") {
            itemCost = qty * (serviceLookup["YouTube видео (Съемка)"]?.sebes || 0);
          } else {
            itemCost = qty * service.sebes;
          }

          totalCost += itemCost;
          breakdown.push({
            name: serviceName,
            qty: displayQty,
            unit: displayUnit,
            unitCost: displayUnitCost,
            totalCost: itemCost,
            note
          });
        }
      }
    }

    const profit = salePrice - totalCost;
    const margin = salePrice > 0 ? (profit / salePrice) * 100 : 0;

    detailedTariffs.push({
      name,
      salePrice,
      totalCost,
      profit,
      margin,
      breakdown
    });
  }

  // Генерация HTML
  let html = `
    <div class="an-charts-row" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div class="an-chart-card">
        <div class="an-chart-title">Маржа по тарифам (%)</div>
        <div style="position:relative;height:220px"><canvas id="chart-eco-margin"></canvas></div>
      </div>
      <div class="an-chart-card">
        <div class="an-chart-title">Цена vs Себестоимость vs Прибыль</div>
        <div style="position:relative;height:220px"><canvas id="chart-eco-stack"></canvas></div>
      </div>
    </div>
    <div style="margin-bottom: 20px; color: var(--text2); font-size: 13px; line-height: 1.5; background: rgba(99,102,241,0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(99,102,241,0.15)">
      💡 Расчет себестоимости съёмки основан на среднем нормативе <strong>10 рилсов за 1 час</strong> съёмки оператора (при себестоимости съёмки 10 000 ₸/час это составляет 1 000 ₸ за один рилс).
    </div>

    <div class="an-table-wrap">
      <table class="an-table">
        <thead>
          <tr>
            <th>Название тарифа</th>
            <th style="text-align: right;">Цена продажи</th>
            <th style="text-align: right;">Себестоимость</th>
            <th style="text-align: right;">Чистая прибыль</th>
            <th style="text-align: right;">Маржа (%)</th>
          </tr>
        </thead>
        <tbody>`;

  detailedTariffs.forEach((t, index) => {
    const marginColor = t.margin >= 70 ? '#34d399' : (t.margin >= 50 ? '#f59e0b' : '#ef4444');
    html += `
          <tr style="cursor: pointer;" onclick="document.getElementById('tar-card-${index}').scrollIntoView({behavior:'smooth'})">
            <td><strong>${escHtml(t.name)}</strong></td>
            <td style="text-align: right;">${fmt(t.salePrice)} ₸</td>
            <td style="text-align: right; color: #fb7185;">${fmt(t.totalCost)} ₸</td>
            <td style="text-align: right; font-weight: 700; color: #34d399;">${fmt(t.profit)} ₸</td>
            <td style="text-align: right; font-weight: 700; color: ${marginColor};">${t.margin.toFixed(0)}%</td>
          </tr>`;
  });

  html += `
        </tbody>
      </table>
    </div>

    <div style="margin-top: 30px; margin-bottom: 15px;">
      <h3 style="font-size: 15px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 0.05em;">📦 Состав и себестоимость каждого тарифа</h3>
    </div>

    <div style="display: flex; flex-direction: column; gap: 20px;">`;

  detailedTariffs.forEach((t, index) => {
    const marginColor = t.margin >= 70 ? '#34d399' : (t.margin >= 50 ? '#f59e0b' : '#ef4444');
    html += `
      <div id="tar-card-${index}" class="card" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius); padding: 20px; backdrop-filter: blur(10px);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 15px;">
          <div>
            <h4 style="font-size: 15px; font-weight: 800; color: var(--accent); margin: 0;">${escHtml(t.name)}</h4>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text2); font-size: 11px;">Цена: ${fmt(t.salePrice)} ₸</span>
            <span class="badge" style="background: rgba(254,226,226,0.1); color: #fb7185; font-size: 11px;">Себес: ${fmt(t.totalCost)} ₸</span>
            <span class="badge" style="background: rgba(209,250,229,0.1); color: #34d399; font-size: 11px;">Прибыль: ${fmt(t.profit)} ₸</span>
            <span class="badge" style="background: ${marginColor}22; color: ${marginColor}; border: 1px solid ${marginColor}44; font-size: 11px;">Маржа: ${t.margin.toFixed(1)}%</span>
          </div>
        </div>`;

    if (t.breakdown.length === 0) {
      html += `
        <div style="color: #fb7185; font-size: 12px; background: rgba(239,68,68,0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(239,68,68,0.15)">
          ⚠️ Состав для этого тарифа не настроен в базе. Заполните колонки "Кол-во: ..." в таблице Тарифы.
        </div>`;
    } else {
      html += `
        <div style="overflow-x: auto;">
          <table style="width:100%; border-collapse: collapse; font-size: 12px; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text2); font-size: 10px; text-transform: uppercase;">
                <th style="padding: 8px 4px;">Услуга</th>
                <th style="padding: 8px 4px; text-align: center;">Кол-во</th>
                <th style="padding: 8px 4px; text-align: right;">Себес ед.</th>
                <th style="padding: 8px 4px; text-align: right;">Общая себес.</th>
                <th style="padding: 8px 4px; text-align: left; padding-left: 15px;">Примечание</th>
              </tr>
            </thead>
            <tbody>`;

      t.breakdown.forEach(b => {
        html += `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.02); height: 35px;">
                <td style="padding: 8px 4px; color: #fff;"><strong>${escHtml(b.name)}</strong></td>
                <td style="padding: 8px 4px; text-align: center; font-weight: 600;">${b.qty} ${b.unit}</td>
                <td style="padding: 8px 4px; text-align: right; color: var(--text2);">${fmt(b.unitCost)} ₸</td>
                <td style="padding: 8px 4px; text-align: right; font-weight: 600; color: #fb7185;">${fmt(b.totalCost)} ₸</td>
                <td style="padding: 8px 4px; text-align: left; padding-left: 15px; color: var(--text2); font-style: italic;">${b.note ? escHtml(b.note) : '—'}</td>
              </tr>`;
      });

      html += `
            </tbody>
          </table>
        </div>`;
    }

    html += `
      </div>`;
  });

  html += `</div>`;
  return html;
}

function donutSegments(segments){
  const r=35,cx=50,cy=50,circ=2*Math.PI*r;
  const total=segments.reduce((s,x)=>s+x.value,0)||1; let cumAngle=-90;
  return segments.map(seg=>{
    const pct=seg.value/total,len=pct*circ,startAngle=cumAngle; cumAngle+=pct*360;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="14" stroke-dasharray="${len} ${circ-len}" transform="rotate(${startAngle} ${cx} ${cy})" opacity="0.85"/>`;
  }).join('');
}

// ════════════════════════════
// УПРАВЛЕНИЕ ВОРОНКАМИ И ЭТАПАМИ (amoCRM механика)
// ════════════════════════════


function _makeChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  _destroyChart(id);
  _charts[id] = new Chart(canvas, config);
}

const _gridColor = 'rgba(255,255,255,0.06)';
const _textColor = '#9ca3af';
const _scaleBase = {
  grid: { color: _gridColor },
  ticks: { color: _textColor },
  border: { color: _gridColor },
};

// ── Воронка: 3 графика
function initFunnelCharts() {
  if (!window.Chart) return;
  const all = State.leads.filter(l => !isLeadArchived(l) && isLeadInCurrentPipeline(l));
  const filtered = applyPeriodFilter(all);

  // 1. Горизонтальный бар: лиды по этапам
  const stageMap = {};
  FUNNEL_STAGES.forEach(s => { stageMap[s.key] = { count: 0, color: s.color }; });
  all.forEach(l => {
    const s = getField(l.fields, CONFIG.LEAD_FIELDS.stage) || 'Новая заявка';
    if (stageMap[s]) stageMap[s].count++;
  });
  const stLabels = FUNNEL_STAGES.map(s => s.key);
  const stData   = FUNNEL_STAGES.map(s => stageMap[s.key]?.count || 0);
  const stColors = FUNNEL_STAGES.map(s => s.color);

  _makeChart('chart-stages', {
    type: 'bar',
    data: {
      labels: stLabels,
      datasets: [{
        data: stData,
        backgroundColor: stColors.map(c => c + 'aa'),
        borderColor: stColors,
        borderWidth: 1,
        borderRadius: 5,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.raw} лидов` } } },
      scales: {
        x: { ..._scaleBase, beginAtZero: true },
        y: { grid: { display: false }, ticks: { color: '#e2e8f0', font: { size: 10, weight: 600 } } }
      }
    }
  });

  // 2. Donut: по источникам (топ 7)
  const srcMap = {};
  filtered.forEach(l => {
    const s = getField(l.fields, CONFIG.LEAD_FIELDS.source) || 'Без источника';
    srcMap[s] = (srcMap[s] || 0) + 1;
  });
  const srcSorted = Object.entries(srcMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const doughnutColors = ['#6366f1','#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#64748b'];

  _makeChart('chart-sources', {
    type: 'doughnut',
    data: {
      labels: srcSorted.map(x => x[0]),
      datasets: [{
        data: srcSorted.map(x => x[1]),
        backgroundColor: doughnutColors,
        borderColor: '#0f172a',
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { color: _textColor, font: { size: 10 }, boxWidth: 12, padding: 8 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } }
      }
    }
  });

  // 3. Линейный: выручка по месяцам (последние 6 мес)
  const monthMap = {};
  State.leads.filter(l => getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Продано').forEach(l => {
    const d = parseDateStr(l.fields['Дата продажи']) || parseLeadDate(l);
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthMap[key] = (monthMap[key] || 0) + (Number(l.fields['Бюджет']) || 0);
  });
  const monthKeys = Object.keys(monthMap).sort().slice(-8);
  const monthLabels = monthKeys.map(k => {
    const [y, m] = k.split('-');
    return ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'][+m - 1] + ' ' + y.slice(2);
  });

  _makeChart('chart-monthly', {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [{
        label: 'Выручка',
        data: monthKeys.map(k => monthMap[k]),
        backgroundColor: 'rgba(52,211,153,0.25)',
        borderColor: '#34d399',
        borderWidth: 2,
        borderRadius: 6,
        fill: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)} ₸` } }
      },
      scales: {
        x: { ..._scaleBase },
        y: { ..._scaleBase, beginAtZero: true, ticks: { color: _textColor, callback: v => fmt(v) + ' ₸' } }
      }
    }
  });
}

// ── Менеджеры: 2 графика
function initManagerCharts() {
  if (!window.Chart) return;
  const allLeads = State.leads;
  const mgMap = {};

  allLeads.forEach(l => {
    const mg = l.fields['Менеджер'] || '—';
    if (!mgMap[mg]) mgMap[mg] = { total: 0, sold: 0, revenue: 0 };
    if (isDateInPeriod(l.fields['Дата'], AnState.period)) mgMap[mg].total++;
    if (getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Продано' &&
        isDateInPeriod(l.fields['Дата продажи'] || l.fields['Дата'], AnState.period)) {
      mgMap[mg].sold++;
      mgMap[mg].revenue += Number(l.fields['Бюджет']) || 0;
    }
  });

  const managers = Object.entries(mgMap).filter(([k]) => k !== '—').sort((a,b) => b[1].revenue - a[1].revenue);
  if (!managers.length) return;

  const mgLabels = managers.map(([k]) => k);
  const palette  = ['#6366f1','#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#14b8a6','#ec4899'];
  const mgColorsA = mgLabels.map((_, i) => palette[i % palette.length] + 'cc');
  const mgColorsB = mgLabels.map((_, i) => palette[i % palette.length]);

  // 1. Выручка
  _makeChart('chart-mg-revenue', {
    type: 'bar',
    data: {
      labels: mgLabels,
      datasets: [{
        label: 'Выручка',
        data: managers.map(([,d]) => d.revenue),
        backgroundColor: mgColorsA,
        borderColor: mgColorsB,
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)} ₸` } }
      },
      scales: {
        x: { ..._scaleBase },
        y: { ..._scaleBase, beginAtZero: true, ticks: { color: _textColor, callback: v => fmt(v) } }
      }
    }
  });

  // 2. Лиды и продажи (grouped)
  _makeChart('chart-mg-sales', {
    type: 'bar',
    data: {
      labels: mgLabels,
      datasets: [
        {
          label: 'Новых лидов',
          data: managers.map(([,d]) => d.total),
          backgroundColor: 'rgba(99,102,241,0.5)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Продаж',
          data: managers.map(([,d]) => d.sold),
          backgroundColor: 'rgba(52,211,153,0.5)',
          borderColor: '#34d399',
          borderWidth: 1,
          borderRadius: 4,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: _textColor, font: { size: 11 }, boxWidth: 12, padding: 10 }
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}` } }
      },
      scales: {
        x: { ..._scaleBase },
        y: { ..._scaleBase, beginAtZero: true }
      }
    }
  });
}

// ── Юнит-экономика: 2 графика
function initEconomicsCharts() {
  if (!window.Chart) return;
  if (!State.tariffs?.length || !State.services?.length) return;

  // Перестраиваем расчёт (тот же что в renderTabEconomics)
  const serviceLookup = {};
  (State.services || []).forEach(s => {
    const name = s.fields?.['Название услуги'];
    if (name) serviceLookup[name] = { sebes: Number(s.fields['Себестоимость']) || 0 };
  });

  const data = [];
  for (const tariff of State.tariffs) {
    const name = tariff.fields['Название'] || tariff.fields['Название тарифа'];
    if (!name) continue;
    const price = Number(tariff.fields['Стоимость'] || tariff.fields['Цена']) || 0;
    let cost = 0;
    for (const [key, qtyVal] of Object.entries(tariff.fields)) {
      const qty = Number(qtyVal) || 0;
      if (!key.startsWith('Кол-во:') || !qty) continue;
      const svcName = findServiceName(key);
      const svc = serviceLookup[svcName];
      if (!svc) continue;
      if (svcName === 'Съемка Reels') cost += (qty / 10) * svc.sebes;
      else cost += qty * svc.sebes;
    }
    const profit = price - cost;
    const margin = price > 0 ? (profit / price) * 100 : 0;
    data.push({ name, price, cost, profit, margin });
  }
  if (!data.length) return;

  const labels = data.map(d => d.name.replace(/\+/g, '+\n'));
  const marginColors = data.map(d =>
    d.margin >= 75 ? '#34d399' : d.margin >= 65 ? '#f59e0b' : '#f87171'
  );
  const marginBg = data.map(d =>
    d.margin >= 75 ? 'rgba(52,211,153,0.25)' : d.margin >= 65 ? 'rgba(245,158,11,0.25)' : 'rgba(248,113,113,0.25)'
  );

  // 1. Горизонтальный бар: маржа %
  _makeChart('chart-eco-margin', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Маржа %',
        data: data.map(d => +d.margin.toFixed(1)),
        backgroundColor: marginBg,
        borderColor: marginColors,
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` Маржа: ${ctx.raw}%` } }
      },
      scales: {
        x: { ..._scaleBase, beginAtZero: true, max: 100, ticks: { callback: v => v + '%', color: _textColor } },
        y: { grid: { display: false }, ticks: { color: '#e2e8f0', font: { size: 10 } } }
      }
    }
  });

  // 2. Сгруппированный бар: цена / себес / прибыль
  _makeChart('chart-eco-stack', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Себестоимость',
          data: data.map(d => d.cost),
          backgroundColor: 'rgba(248,113,113,0.6)',
          borderColor: '#f87171',
          borderWidth: 1,
          borderRadius: 4,
          stack: 'a',
        },
        {
          label: 'Прибыль',
          data: data.map(d => d.profit),
          backgroundColor: 'rgba(52,211,153,0.6)',
          borderColor: '#34d399',
          borderWidth: 1,
          borderRadius: 4,
          stack: 'a',
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true, position: 'top',
          labels: { color: _textColor, font: { size: 11 }, boxWidth: 12, padding: 10 }
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)} ₸` } }
      },
      scales: {
        x: { ..._scaleBase, stacked: true },
        y: { ..._scaleBase, stacked: true, beginAtZero: true, ticks: { callback: v => fmt(v), color: _textColor } }
      }
    }
  });
}

// ════════════════════════════
// НЕ ЦЕЛЕВОЙ — ПРИЧИНА
// ════════════════════════════

const NON_TARGET_REASONS = [
  'Нет денег',
  'Нет бизнеса',
  'Новичок',
  'Не понимает ценности',
  'Не адекват',
  'Конкурент',
  'Другое',
];

// Шаблоны сообщений для WhatsApp
// {ИМЯ} → имя клиента, {ВРЕМЯ} → время консультации из лида
const MSG_TEMPLATES = [
  {
    name: '\uD83D\uDCAC Подтверждение Сухраб',
    text: '{ИМЯ}, здравствуйте! Это Сухраб, продюсер рилс\uD83D\uDCF8, команда Дарины, приятно познакомиться\uD83E\uDD1D Вы оставляли заявку у нас на разбор.\nМогу звонить сегодня в {ВРЕМЯ}?\uD83D\uDE0A',
  },
  {
    name: '\uD83D\uDC65 Подтверждение Дарина',
    text: '{ИМЯ}, здравствуйте! Это Дарина, продюсер рилс, приятно познакомиться\uD83E\uDD1D Вы оставляли заявку на разбор.\nМогу звонить сегодня в {ВРЕМЯ}?\uD83D\uDE0A',
  },
];

// Хранит массив ID лидов, ожидающих перевода в «Не целевой»
let _nonTargetPendingIds = [];

