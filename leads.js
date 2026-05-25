// === LEADS, CLIENTS, DEALS, OPERATIONS MODULE ===
// Разбор даты и времени консультации лида
function parseLeadConsultationDateTime(lead) {
  if (!lead || !lead.fields) return null;
  const dateStr = lead.fields['Дата консультации'];
  const timeStr = lead.fields['Время консультации'];
  if (!dateStr) return null;
  
  let parsedDate = null;
  let m = String(dateStr).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) {
    parsedDate = new Date(+m[3], +m[2]-1, +m[1]);
  } else {
    m = String(dateStr).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      parsedDate = new Date(+m[1], +m[2]-1, +m[3]);
    } else {
      const d = new Date(dateStr);
      parsedDate = isNaN(d) ? null : d;
    }
  }
  if (!parsedDate) return null;

  if (timeStr) {
    const tm = String(timeStr).match(/(\d{1,2}):(\d{2})/);
    if (tm) {
      parsedDate.setHours(parseInt(tm[1], 10), parseInt(tm[2], 10), 0, 0);
    } else {
      parsedDate.setHours(0, 0, 0, 0);
    }
  } else {
    parsedDate.setHours(0, 0, 0, 0);
  }
  return parsedDate;
}

async function loadLeads() {
  if (State.leads.length > 0) {
    renderPipelineSelect();
    renderLeadsStats();
    renderKanban(State.leads);
  } else {
    spinner('leads-kanban');
    document.getElementById('leads-stats').innerHTML = '';
  }
  try {
    const [leads, clients, deals, pipelines, stages, employees] = await Promise.all([
      Airtable.getAll(CONFIG.TABLES.LEADS),
      Airtable.getAll(CONFIG.TABLES.CLIENTS),
      Airtable.getAll(CONFIG.TABLES.DEALS),
      Airtable.getAll(CONFIG.TABLES.PIPELINES),
      Airtable.getAll(CONFIG.TABLES.STAGES),
      Airtable.getAll(CONFIG.TABLES.EMPLOYEES)
    ]);
    State.leads = leads;
    State.clients = clients;
    State.deals = deals;
    State.pipelines = pipelines;
    State.stages = stages;
    State.employees = employees;

    State.stages.sort((a, b) => (Number(a.fields['Порядок']) || 0) - (Number(b.fields['Порядок']) || 0));

    if (State.pipelines.length > 0) {
      if (!State.currentPipelineId || !State.pipelines.some(p => String(p.id) === String(State.currentPipelineId))) {
        State.currentPipelineId = String(State.pipelines[0].id);
        localStorage.setItem('currentPipelineId', State.currentPipelineId);
      }
    }

    populateLeadsFilterOptions();
    
    // Синхронизируем фильтры в DOM
    const searchInput = document.getElementById('flt-search');
    const mgrSelect = document.getElementById('flt-manager');
    const dateTypeSelect = document.getElementById('flt-date-type');
    const dateInput = document.getElementById('flt-date');
    const clearBtn = document.getElementById('flt-clear-btn');
    
    if (searchInput) searchInput.value = State.filterSearch || '';
    if (mgrSelect) mgrSelect.value = State.filterManager || '';
    if (dateTypeSelect) dateTypeSelect.value = State.filterDateType || '';
    if (dateInput) {
      dateInput.value = State.filterDate || '';
      dateInput.style.display = State.filterDateType ? 'inline-block' : 'none';
    }
    if (clearBtn) {
      clearBtn.style.display = (State.filterManager || State.filterSearch || (State.filterDateType && State.filterDate)) ? 'inline-flex' : 'none';
    }

    renderPipelineSelect();
    renderLeadsStats();
    renderKanban(leads);
  } catch(e) {
    if (!State.leads.length)
      document.getElementById('leads-kanban').innerHTML = `<div class="empty"><p>Ошибка: ${e.message}</p></div>`;
    else toast('Ошибка обновления', 'error');
  }
}

async function refreshCRMData() {
  const btn = document.getElementById('btn-refresh-data');
  let icon = null;
  if (btn) {
    btn.disabled = true;
    icon = btn.querySelector('.refresh-icon');
    if (icon) {
      icon.style.display = 'inline-block';
      icon.style.animation = 'spin 1s linear infinite';
    }
  }
  toast('Обновление данных с сервера...');
  try {
    await loadLeads();
    toast('Данные успешно обновлены ✓');
  } catch (err) {
    toast(`Ошибка обновления: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      if (icon) icon.style.animation = '';
    }
  }
}

function renderLeadsStats() {
  const leads = State.leads;
  const now   = new Date();

  function pluralizeDeals(count) {
    let n = Math.abs(count);
    n %= 100;
    if (n >= 5 && n <= 20) return `${count} сделок`;
    n %= 10;
    if (n === 1) return `${count} сделка`;
    if (n >= 2 && n <= 4) return `${count} сделки`;
    return `${count} сделок`;
  }

  // 1. Фильтруем лиды по текущей воронке
  let currentPipelineLeads = leads.filter(l => isLeadInCurrentPipeline(l));
  
  // Применяем фильтр по менеджеру
  if (State.filterManager) {
    currentPipelineLeads = currentPipelineLeads.filter(l => l.fields['Менеджер'] === State.filterManager);
  }
  
  // Применяем фильтр по датам
  if (State.filterDateType && State.filterDate) {
    const dbDateStr = toDbDateFormat(State.filterDate);
    currentPipelineLeads = currentPipelineLeads.filter(l => {
      if (State.filterDateType === 'assign') {
        return l.fields['Дата назначения'] === dbDateStr;
      } else if (State.filterDateType === 'consult') {
        return l.fields['Дата консультации'] === dbDateStr;
      }
      return true;
    });
  }

  // Применяем фильтр по поисковому запросу (имя, телефон, ниша, источник, комментарий)
  if (State.filterSearch) {
    const q = State.filterSearch.toLowerCase().trim();
    const qPhone = q.replace(/\D/g, '');
    currentPipelineLeads = currentPipelineLeads.filter(l => {
      const name = (getField(l.fields, CONFIG.LEAD_FIELDS.name) || '').toLowerCase();
      const phone = (getField(l.fields, CONFIG.LEAD_FIELDS.phone) || '').replace(/\D/g, '');
      const niche = (l.fields['Ниша'] || l.fields['Ниша клиента'] || '').toLowerCase();
      const source = (getField(l.fields, CONFIG.LEAD_FIELDS.source) || '').toLowerCase();
      const comment = (l.fields['Комментарий'] || '').toLowerCase();
      return name.includes(q) || 
             (qPhone && phone.includes(qPhone)) || 
             niche.includes(q) || 
             source.includes(q) || 
             comment.includes(q);
    });
  }

  // 2. Для активных счетчиков берем только неархивированные лиды
  const activePipelineLeads = currentPipelineLeads.filter(l => !isLeadArchived(l));

  // Периоды
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart  = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - ((todayStart.getDay()||7) - 1));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Основные цифры
  const newLeads = activePipelineLeads.filter(l => { 
    const s = getField(l.fields, CONFIG.LEAD_FIELDS.stage); 
    return !s || s === 'Новая заявка'; 
  }).length;
  
  const thinking = activePipelineLeads.filter(l => { 
    const s = getField(l.fields, CONFIG.LEAD_FIELDS.stage); 
    return s === 'КП на рассмотрении' || s === 'Договор на рассмотрении'; 
  }).length;

  // Консультации сегодня: по дате консультации (совпадающей с сегодняшней датой)
  const consultAll = activePipelineLeads.filter(l => {
    const d = parseDateStr(l.fields['Дата консультации']);
    if (!d) return false;
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
  });
  
  const consultAppointed = consultAll.filter(l => !l.fields['Консультация проведена']).length;
  const consultDone      = consultAll.filter(l => l.fields['Консультация проведена'] === true).length;

  // Продажи (по дате продажи, с фолбеком на дату создания для старых данных)
  const soldLeads = currentPipelineLeads.filter(l => getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Продано');
  
  function inPeriod(start) { 
    return soldLeads.filter(l => { 
      const d = parseDateStr(l.fields['Дата продажи']) || parseLeadDate(l); 
      return d && d >= start; 
    }); 
  }
  
  const sumOf = arr => arr.reduce((s,l) => s + (Number(l.fields['Бюджет'])||0), 0);
  const sumOfPaid = arr => arr.reduce((s,l) => s + (Number(l.fields['Оплата'])||0), 0);
  const sToday = inPeriod(todayStart);
  const sWeek  = inPeriod(weekStart);
  const sMonth = inPeriod(monthStart);

  const fmt = n => n.toLocaleString('ru-RU');

  document.getElementById('leads-stats').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-card-title">🎯 Всего лидов</div>
        <div class="stat-card-num stat-card-num-default">${activePipelineLeads.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">📅 Назначено сегодня</div>
        <div class="stat-card-num stat-card-num-blue">${consultAppointed}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">✅ Проведено сегодня</div>
        <div class="stat-card-num stat-card-num-green">${consultDone}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">💭 В ожидании</div>
        <div class="stat-card-num stat-card-num-orange">${thinking}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">💰 Выручка сегодня</div>
        <div class="stat-card-num stat-card-num-green" title="По договору">${fmt(sumOf(sToday))} ₸</div>
        <div class="stat-card-sub" style="font-weight: 700; color: #a5b4fc; margin-top: 2px;">📥 В кассу: ${fmt(sumOfPaid(sToday))} ₸</div>
        <div class="stat-card-sub" style="margin-top: 4px;">${pluralizeDeals(sToday.length)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">📈 Выручка за неделю</div>
        <div class="stat-card-num stat-card-num-green" title="По договору">${fmt(sumOf(sWeek))} ₸</div>
        <div class="stat-card-sub" style="font-weight: 700; color: #a5b4fc; margin-top: 2px;">📥 В кассу: ${fmt(sumOfPaid(sWeek))} ₸</div>
        <div class="stat-card-sub" style="margin-top: 4px;">${pluralizeDeals(sWeek.length)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-title">📊 Выручка за месяц</div>
        <div class="stat-card-num stat-card-num-green" title="По договору">${fmt(sumOf(sMonth))} ₸</div>
        <div class="stat-card-sub" style="font-weight: 700; color: #a5b4fc; margin-top: 2px;">📥 В кассу: ${fmt(sumOfPaid(sMonth))} ₸</div>
        <div class="stat-card-sub" style="margin-top: 4px;">${pluralizeDeals(sMonth.length)}</div>
      </div>
    </div>`;
}

// ─── Архивация и групповые операции
function toggleShowArchived(checked) {
  State.showArchived = checked;
  renderKanban(State.leads);
}

function isLeadArchived(lead) {
  const activeFields = ActiveFieldsCache[CONFIG.TABLES.LEADS] || [];
  if (activeFields.includes('Архивирован')) {
    return lead.fields['Архивирован'] === true || lead.fields['Архивирован'] === 'true';
  }
  const localArchived = JSON.parse(localStorage.getItem('crm_archived_leads') || '[]');
  return localArchived.includes(lead.id);
}

function isLeadInCurrentPipeline(lead) {
  if (!lead) return false;
  const leadStageId = lead.fields['Воронка ID'] ? String(lead.fields['Воронка ID']) : '';
  const leadStageName = getField(lead.fields, CONFIG.LEAD_FIELDS.stage) || 'Новая заявка';
  
  const hasStageIds = FUNNEL_STAGES.some(s => s.id);
  if (hasStageIds && leadStageId) {
    return FUNNEL_STAGES.some(s => String(s.id) === leadStageId);
  }
  return FUNNEL_STAGES.some(s => s.key === leadStageName);
}

// Global click listener to close context menus when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown-menu') && !e.target.closest('.col-menu-btn')) {
    const cardMenu = document.getElementById('card-context-menu');
    const colMenu = document.getElementById('column-context-menu');
    if (cardMenu) { cardMenu.style.display = 'none'; cardMenu.classList.remove('align-left', 'align-bottom'); }
    if (colMenu)  { colMenu.style.display  = 'none'; colMenu.classList.remove('align-left', 'align-bottom'); }
  }
  // Закрыть меню шаблонов, если клик вне него
  if (!e.target.closest('.template-dropdown-wrap')) {
    document.querySelectorAll('.template-menu').forEach(m => { m.style.display = 'none'; });
  }
  // Закрыть FAB финансов если клик вне него
  if (!e.target.closest('.fab') && !e.target.closest('#fab-finance-menu')) {
    const fm = document.getElementById('fab-finance-menu');
    if (fm && fm.style.display !== 'none') {
      fm.style.display = 'none';
      if (typeof toggleFabFinanceMenu === 'function') window._fabFinanceOpen = false;
    }
  }
});

// Global hover listener to dynamically position submenus
document.addEventListener('mouseover', (e) => {
  const li = e.target.closest('.dropdown-menu li');
  if (!li) return;
  const submenu = li.querySelector('.submenu');
  if (!submenu) return;

  // Let it display first so we can measure it
  submenu.style.visibility = 'hidden';
  submenu.style.display = 'block';

  // Reset styles
  submenu.style.top = '';
  submenu.style.bottom = '';
  submenu.style.left = '';
  submenu.style.right = '';

  const rect = submenu.getBoundingClientRect();
  const liRect = li.getBoundingClientRect();

  // Position vertically
  if (rect.bottom > window.innerHeight) {
    const desiredViewportTop = Math.max(10, window.innerHeight - rect.height - 10);
    submenu.style.top = `${desiredViewportTop - liRect.top}px`;
    submenu.style.bottom = 'auto';
  } else {
    submenu.style.top = '';
    submenu.style.bottom = '';
  }

  // Position horizontally
  if (rect.right > window.innerWidth || li.closest('.dropdown-menu').classList.contains('align-left')) {
    submenu.style.left = 'auto';
    submenu.style.right = '98%';
  } else {
    submenu.style.left = '98%';
    submenu.style.right = 'auto';
  }

  submenu.style.display = '';
  submenu.style.visibility = '';
});

function closeAllDropdownMenus() {
  const cardMenu = document.getElementById('card-context-menu');
  const colMenu = document.getElementById('column-context-menu');
  if (cardMenu) {
    cardMenu.style.display = 'none';
    cardMenu.classList.remove('align-left', 'align-bottom');
  }
  if (colMenu) {
    colMenu.style.display = 'none';
    colMenu.classList.remove('align-left', 'align-bottom');
  }
}

function toggleCardSelection(id) {
  if (SelectionState.selectedIds.has(id)) {
    SelectionState.selectedIds.delete(id);
  } else {
    SelectionState.selectedIds.add(id);
  }
  
  const cardEl = document.querySelector(`.kanban-card[data-lead-id="${id}"]`);
  if (cardEl) {
    cardEl.classList.toggle('selected', SelectionState.selectedIds.has(id));
  }
  
  updateSelectionBar();
}

function updateSelectionBar() {
  const bar = document.getElementById('selection-bar');
  const countSpan = document.getElementById('selection-count');
  if (!bar || !countSpan) return;
  
  const count = SelectionState.selectedIds.size;
  if (SelectionState.active && count > 0) {
    countSpan.textContent = `Выбрано: ${count} лидов`;
    bar.classList.add('active');
  } else if (SelectionState.active && count === 0) {
    countSpan.textContent = `Выберите карточки...`;
    bar.classList.add('active');
  } else {
    bar.classList.remove('active');
  }
}

function cancelSelection() {
  SelectionState.active = false;
  SelectionState.column = null;
  SelectionState.selectedIds.clear();
  
  document.querySelectorAll('.kanban-col-body').forEach(el => {
    el.classList.remove('selection-mode-active');
  });
  document.querySelectorAll('.kanban-card').forEach(el => {
    el.classList.remove('selected');
  });
  
  updateSelectionBar();
}

function startSelectionMode(stage, initialId) {
  closeAllDropdownMenus();
  SelectionState.active = true;
  SelectionState.column = stage;
  SelectionState.selectedIds.clear();
  
  if (initialId) {
    SelectionState.selectedIds.add(initialId);
  }
  
  renderKanban(State.leads);
}

function selectAllInColumn(stage) {
  closeAllDropdownMenus();
  SelectionState.active = true;
  SelectionState.column = stage;
  SelectionState.selectedIds.clear();
  
  const columnLeads = State.leads.filter(l => {
    const s = getField(l.fields, CONFIG.LEAD_FIELDS.stage) || 'Новая заявка';
    const archived = isLeadArchived(l);
    return s === stage && (State.showArchived || !archived);
  });
  
  columnLeads.forEach(l => SelectionState.selectedIds.add(l.id));
  
  renderKanban(State.leads);
}

function openCardContextMenu(e, id, stage) {
  closeAllDropdownMenus();
  
  const cardMenu = document.getElementById('card-context-menu');
  if (!cardMenu) return;
  
  const lead = State.leads.find(l => l.id === id);
  if (!lead) return;
  const archived = isLeadArchived(lead);
  
  cardMenu.style.left = `${e.clientX}px`;
  cardMenu.style.top = `${e.clientY}px`;
  cardMenu.style.display = 'block';
  
  if (e.clientX > window.innerWidth - 380) {
    cardMenu.classList.add('align-left');
  } else {
    cardMenu.classList.remove('align-left');
  }
  if (e.clientY > window.innerHeight - 450) {
    cardMenu.classList.add('align-bottom');
  } else {
    cardMenu.classList.remove('align-bottom');
  }
  
  let html = '<ul>';
  if (SelectionState.active && SelectionState.column === stage && SelectionState.selectedIds.has(id)) {
    const count = SelectionState.selectedIds.size;
    html += `<li onclick="showMoveSelectedMenu(event)"><span>➡️ Переместить выбранные (${count})</span><span class="arrow">▶</span>
      <ul class="submenu">
        ${FUNNEL_STAGES.filter(s => s.key !== stage).map(s => 
          `<li onclick="moveSelectedLeads('${s.key}')">${s.key}</li>`
        ).join('')}
      </ul>
    </li>`;
    html += `<li class="danger" onclick="archiveSelectedLeads(true)"><span>📁 Архивировать выбранные (${count})</span></li>`;
    html += `<li onclick="selectAllInColumn('${stage}')"><span>☑️ Выбрать все в колонке</span></li>`;
    html += `<li onclick="cancelSelection()"><span>❌ Отменить выбор</span></li>`;
  } else {
    if (archived) {
      html += `<li onclick="toggleLeadArchive('${id}', false)"><span>♻️ Восстановить из архива</span></li>`;
    } else {
      html += `<li onclick="startSelectionMode('${stage}', '${id}')"><span>☑️ Выбрать (мультивыбор)</span></li>`;
      html += `<li><span>➡️ Переместить в...</span><span class="arrow">▶</span>
        <ul class="submenu">
          ${FUNNEL_STAGES.filter(s => s.key !== stage && !s.blocked).map(s =>
            `<li onclick="moveSingleLead('${id}', '${s.key}')">${s.key}</li>`
          ).join('')}
        </ul>
      </li>`;
      const consultDone = lead.fields['Консультация проведена'];
      html += `<li onclick="toggleConsultDone('${id}')"><span>${consultDone ? '☑️ Снять отметку конс.' : '✅ Консультация проведена'}</span></li>`;
      html += `<li class="danger" onclick="toggleLeadArchive('${id}', true)"><span>📁 Архивировать</span></li>`;
    }
  }
  html += '</ul>';
  cardMenu.innerHTML = html;
  
  const rect = cardMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    cardMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    cardMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
}

function openColumnMenu(event, stageKey) {
  event.preventDefault();
  event.stopPropagation();
  closeAllDropdownMenus();
  
  const colMenu = document.getElementById('column-context-menu');
  if (!colMenu) return;
  
  colMenu.style.left = `${event.clientX}px`;
  colMenu.style.top = `${event.clientY}px`;
  colMenu.style.display = 'block';
  
  if (event.clientX > window.innerWidth - 380) {
    colMenu.classList.add('align-left');
  } else {
    colMenu.classList.remove('align-left');
  }
  if (event.clientY > window.innerHeight - 450) {
    colMenu.classList.add('align-bottom');
  } else {
    colMenu.classList.remove('align-bottom');
  }
  
  const currentSort = State.columnSorting[stageKey] || 'default';
  
  let html = '<ul>';
  html += `<li onclick="startSelectionMode('${stageKey}')"><span>☑️ Выбрать карточки</span></li>`;
  html += `<li onclick="selectAllInColumn('${stageKey}')"><span>☑️ Выбрать все карточки</span></li>`;
  html += `<li><span>➡️ Переместить все в...</span><span class="arrow">▶</span>
    <ul class="submenu">
      ${FUNNEL_STAGES.filter(s => s.key !== stageKey && !s.blocked).map(s => 
        `<li onclick="moveAllInColumn('${stageKey}', '${s.key}')">${s.key}</li>`
      ).join('')}
    </ul>
  </li>`;
  html += `<li><span>↕️ Сортировка</span><span class="arrow">▶</span>
    <ul class="submenu">
      <li onclick="setColumnSort('${stageKey}', 'name-asc')">${currentSort === 'name-asc' ? '✓ ' : ''}🔤 По имени (А-Я)</li>
      <li onclick="setColumnSort('${stageKey}', 'name-desc')">${currentSort === 'name-desc' ? '✓ ' : ''}🔤 По имени (Я-А)</li>
      <li onclick="setColumnSort('${stageKey}', 'consult-asc')">${currentSort === 'consult-asc' ? '✓ ' : ''}📅 По дате конс. (возр.)</li>
      <li onclick="setColumnSort('${stageKey}', 'consult-desc')">${currentSort === 'consult-desc' ? '✓ ' : ''}📅 По дате конс. (убыв.)</li>
      <li onclick="setColumnSort('${stageKey}', 'created-asc')">${currentSort === 'created-asc' ? '✓ ' : ''}➕ По дате добавл. (возр.)</li>
      <li onclick="setColumnSort('${stageKey}', 'created-desc')">${currentSort === 'created-desc' ? '✓ ' : ''}➕ По дате добавл. (убыв.)</li>
      <li style="border-top:1px solid rgba(255,255,255,0.06); margin-top:4px;" onclick="setColumnSort('${stageKey}', 'default')">${currentSort === 'default' ? '✓ ' : ''}❌ Сбросить сортировку</li>
    </ul>
  </li>`;
  // Переименовать — только для этапов из Baserow (с id)
  const stageObj = FUNNEL_STAGES.find(s => s.key === stageKey);
  if (stageObj?.id) {
    html += `<li onclick="renameColumn('${escHtml(stageKey)}', ${stageObj.id})"><span>✏️ Переименовать</span></li>`;
  }
  html += `<li class="danger" onclick="archiveAllInColumn('${stageKey}')"><span>📁 Архивировать все карточки</span></li>`;
  html += '</ul>';
  
  colMenu.innerHTML = html;
  
  const rect = colMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    colMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    colMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
}

async function moveSingleLead(id, targetStage) {
  closeAllDropdownMenus();
  await moveLeadsToStage([id], targetStage);
}

async function moveSelectedLeads(targetStage) {
  closeAllDropdownMenus();
  const ids = Array.from(SelectionState.selectedIds);
  cancelSelection();
  if (targetStage === 'Не целевой') {
    openNonTargetModal(ids);
    return;
  }
  await moveLeadsToStage(ids, targetStage);
}

async function toggleLeadArchive(id, isArchive) {
  closeAllDropdownMenus();
  await archiveLeads([id], isArchive);
}

async function archiveSelectedLeads(isArchive) {
  closeAllDropdownMenus();
  const ids = Array.from(SelectionState.selectedIds);
  cancelSelection();
  await archiveLeads(ids, isArchive);
}

function showMoveSelectedMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('card-context-menu');
  if (!menu) return;
  
  const rect = event.currentTarget.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.top - 10}px`;
  menu.style.display = 'block';
  
  let html = '<ul><li style="font-weight:800; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:6px; cursor:default;">Переместить в:</li>';
  const currentStage = SelectionState.column;
  const stages = FUNNEL_STAGES.filter(s => s.key !== currentStage && !s.blocked);
  
  stages.forEach(s => {
    html += `<li onclick="moveSelectedLeads('${s.key}')">${s.key}</li>`;
  });
  
  html += '</ul>';
  menu.innerHTML = html;
  
  const menuRect = menu.getBoundingClientRect();
  let topPos = rect.top - menuRect.height - 10;
  if (topPos < 10) {
    topPos = Math.max(10, rect.bottom + 10);
  }
  if (topPos + menuRect.height > window.innerHeight) {
    topPos = Math.max(10, window.innerHeight - menuRect.height - 10);
  }
  menu.style.top = `${topPos}px`;
}

async function archiveSelected() {
  if (SelectionState.selectedIds.size === 0) return;
  if (confirm(`Вы действительно хотите архивировать выбранные карточки (${SelectionState.selectedIds.size})?`)) {
    await archiveSelectedLeads(true);
  }
}

async function moveAllInColumn(stageKey, targetStage) {
  closeAllDropdownMenus();
  const columnLeads = State.leads.filter(l => 
    (getField(l.fields, CONFIG.LEAD_FIELDS.stage) || 'Новая заявка') === stageKey &&
    !isLeadArchived(l)
  );
  if (columnLeads.length === 0) {
    toast('В колонке нет активных карточек');
    return;
  }
  if (confirm(`Вы действительно хотите переместить ВСЕ карточки (${columnLeads.length}) из колонки "${stageKey}" в "${targetStage}"?`)) {
    const ids = columnLeads.map(l => l.id);
    if (targetStage === 'Не целевой') {
      openNonTargetModal(ids);
      return;
    }
    await moveLeadsToStage(ids, targetStage);
  }
}

async function archiveAllInColumn(stageKey) {
  closeAllDropdownMenus();
  const columnLeads = State.leads.filter(l => 
    (getField(l.fields, CONFIG.LEAD_FIELDS.stage) || 'Новая заявка') === stageKey &&
    !isLeadArchived(l)
  );
  if (columnLeads.length === 0) {
    toast('В колонке нет активных карточек');
    return;
  }
  if (confirm(`Вы действительно хотите архивировать ВСЕ карточки (${columnLeads.length}) из колонки "${stageKey}"?`)) {
    const ids = columnLeads.map(l => l.id);
    await archiveLeads(ids, true);
  }
}

async function moveLeadsToStage(ids, targetStage) {
  if (ids.length === 0) return;
  toast(`Перемещение карточек (${ids.length})...`);
  
  const stageField = getStageFieldName(State.leads[0]?.fields || {});
  const stageObj = FUNNEL_STAGES.find(s => s.key === targetStage);
  const stageId = stageObj ? stageObj.id : null;
  
  const todayStr = new Date().toLocaleDateString('ru-RU');
  
  const stagesOrdered = FUNNEL_STAGES.map(s => s.key);
  const targetIdx = stagesOrdered.indexOf(targetStage);
  const consultIdx = stagesOrdered.indexOf('Консультация назначена');
  
  const apiUpdates = { [stageField]: stageId || [] };
  const localUpdates = { 
    [stageField]: targetStage,
    [stageField + ' ID']: stageId ? String(stageId) : ''
  };
  
  if (targetStage === 'Продано') {
    apiUpdates['Дата продажи'] = todayStr;
    localUpdates['Дата продажи'] = todayStr;
  } else if (targetStage === 'Возвраты') {
    apiUpdates['Дата возврата'] = todayStr;
    localUpdates['Дата возврата'] = todayStr;
  } else if (targetIdx >= consultIdx) {
    apiUpdates['Дата назначения'] = todayStr;
    localUpdates['Дата назначения'] = todayStr;
  }
  
  try {
    ids.forEach(id => {
      const lead = State.leads.find(l => l.id === id);
      if (lead) {
        Object.assign(lead.fields, localUpdates);
      }
    });
    renderKanban(State.leads);
    
    await Airtable.batchUpdate(CONFIG.TABLES.LEADS, ids.map(id => ({ id, fields: apiUpdates })));
    
    toast('Карточки перенесены ✓');
    renderLeadsStats();
    renderKanban(State.leads);
  } catch (e) {
    toast(`Ошибка: ${e.message}`, 'error');
    console.error(e);
  }
}

async function archiveLeads(ids, isArchive) {
  if (ids.length === 0) return;
  toast(isArchive ? `Архивация карточек (${ids.length})...` : `Восстановление карточек (${ids.length})...`);
  
  const updates = { 'Архивирован': isArchive };
  
  try {
    ids.forEach(id => {
      const lead = State.leads.find(l => l.id === id);
      if (lead) {
        lead.fields['Архивирован'] = isArchive;
      }
    });
    
    const activeFields = ActiveFieldsCache[CONFIG.TABLES.LEADS] || [];
    if (activeFields.includes('Архивирован')) {
      await Airtable.batchUpdate(CONFIG.TABLES.LEADS, ids.map(id => ({ id, fields: updates })));
    } else {
      let localArchived = JSON.parse(localStorage.getItem('crm_archived_leads') || '[]');
      ids.forEach(id => {
        if (isArchive) {
          if (!localArchived.includes(id)) localArchived.push(id);
        } else {
          localArchived = localArchived.filter(x => x !== id);
        }
      });
      localStorage.setItem('crm_archived_leads', JSON.stringify(localArchived));
    }
    
    toast(isArchive ? 'Карточки архивированы ✓' : 'Карточки восстановлены ✓');
    renderLeadsStats();
    renderKanban(State.leads);
  } catch (e) {
    toast(`Ошибка: ${e.message}`, 'error');
    console.error(e);
  }
}

function renderKanban(leads) {
  if (!FUNNEL_STAGES || FUNNEL_STAGES.length === 0) {
    document.getElementById('leads-kanban').innerHTML = `<div class="empty"><p>Нет этапов воронки. Перейдите в "Настройка" для добавления этапов.</p></div>`;
    return;
  }
  const groups = {};
  FUNNEL_STAGES.forEach(s => { groups[s.key] = []; });

  leads.forEach(lead => {
    if (!isLeadInCurrentPipeline(lead)) return;
    
    // 👤 Фильтр по менеджеру
    if (State.filterManager) {
      const mgr = lead.fields['Менеджер'] || '';
      if (mgr !== State.filterManager) return;
    }
    
    // 📅 Фильтр по датам (назначения / проведения)
    if (State.filterDateType && State.filterDate) {
      const dbDateStr = toDbDateFormat(State.filterDate); // Преобразуем YYYY-MM-DD в DD.MM.YYYY
      if (State.filterDateType === 'assign') {
        const assignDate = lead.fields['Дата назначения'] || '';
        if (assignDate !== dbDateStr) return;
      } else if (State.filterDateType === 'consult') {
        const consultDate = lead.fields['Дата консультации'] || '';
        if (consultDate !== dbDateStr) return;
      }
    }

    // 🔍 Фильтр по поисковому запросу (имя, телефон, ниша, источник, комментарий)
    if (State.filterSearch) {
      const q = State.filterSearch.toLowerCase().trim();
      const qPhone = q.replace(/\D/g, '');
      const name = (getField(lead.fields, CONFIG.LEAD_FIELDS.name) || '').toLowerCase();
      const phone = (getField(lead.fields, CONFIG.LEAD_FIELDS.phone) || '').replace(/\D/g, '');
      const niche = (lead.fields['Ниша'] || lead.fields['Ниша клиента'] || '').toLowerCase();
      const source = (getField(lead.fields, CONFIG.LEAD_FIELDS.source) || '').toLowerCase();
      const comment = (lead.fields['Комментарий'] || '').toLowerCase();
      
      const matchesName = name.includes(q);
      const matchesPhone = qPhone ? phone.includes(qPhone) : false;
      const matchesNiche = niche.includes(q);
      const matchesSource = source.includes(q);
      const matchesComment = comment.includes(q);
      
      if (!matchesName && !matchesPhone && !matchesNiche && !matchesSource && !matchesComment) return;
    }

    const stage = getField(lead.fields, CONFIG.LEAD_FIELDS.stage) || 'Новая заявка';
    const archived = isLeadArchived(lead);
    
    if (!State.showArchived && archived) return;
    
    if (groups[stage] !== undefined) {
      groups[stage].push(lead);
    }
  });

  const mainCols   = FUNNEL_STAGES.filter(s => s.group === 'main');
  const rejectCols = FUNNEL_STAGES.filter(s => s.group === 'reject');
  const soldCols   = FUNNEL_STAGES.filter(s => s.group === 'sold' || s.group === 'refund');

  const renderCol = stage => {
    const items    = groups[stage.key] || [];
    const isReject = stage.group === 'reject';
    const isBlocked = !!stage.blocked;
    const isRefund = stage.group === 'refund';

    const sortType = State.columnSorting[stage.key] || 'default';
    let sortedItems = [...items];
    if (sortType === 'name-asc') {
      sortedItems.sort((a, b) => {
        const nameA = String(getField(a.fields, CONFIG.LEAD_FIELDS.name) || '').toLowerCase();
        const nameB = String(getField(b.fields, CONFIG.LEAD_FIELDS.name) || '').toLowerCase();
        return nameA.localeCompare(nameB, 'ru');
      });
    } else if (sortType === 'name-desc') {
      sortedItems.sort((a, b) => {
        const nameA = String(getField(a.fields, CONFIG.LEAD_FIELDS.name) || '').toLowerCase();
        const nameB = String(getField(b.fields, CONFIG.LEAD_FIELDS.name) || '').toLowerCase();
        return nameB.localeCompare(nameA, 'ru');
      });
    } else if (sortType === 'consult-asc') {
      sortedItems.sort((a, b) => {
        const dateA = parseLeadConsultationDateTime(a);
        const dateB = parseLeadConsultationDateTime(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
      });
    } else if (sortType === 'consult-desc') {
      sortedItems.sort((a, b) => {
        const dateA = parseLeadConsultationDateTime(a);
        const dateB = parseLeadConsultationDateTime(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA;
      });
    } else if (sortType === 'created-asc') {
      sortedItems.sort((a, b) => {
        const dateA = parseLeadDate(a) || new Date(0);
        const dateB = parseLeadDate(b) || new Date(0);
        return dateA - dateB;
      });
    } else if (sortType === 'created-desc') {
      sortedItems.sort((a, b) => {
        const dateA = parseLeadDate(a) || new Date(0);
        const dateB = parseLeadDate(b) || new Date(0);
        return dateB - dateA;
      });
    }

    const budgetSum = sortedItems.reduce((s, l) => s + (Number(l.fields['Бюджет']) || 0), 0);
    const budgetStr = budgetSum.toLocaleString('ru-RU') + ' ₸';

    const colClass = [
      'kanban-col',
      isReject  ? 'kanban-col-reject'  : '',
      isBlocked ? 'kanban-col-blocked' : '',
      isRefund  ? 'kanban-col-refund'  : '',
    ].filter(Boolean).join(' ');

    const colBodyClass = `kanban-col-body ${SelectionState.active && SelectionState.column === stage.key ? 'selection-mode-active' : ''}`;

    let sortBadge = '';
    if (sortType === 'name-asc') sortBadge = ' <span class="sort-badge" style="font-size:11px; font-weight:normal; opacity:0.8; margin-left:4px; vertical-align:middle;" title="Сортировка: По имени (А-Я)">⬇️А</span>';
    else if (sortType === 'name-desc') sortBadge = ' <span class="sort-badge" style="font-size:11px; font-weight:normal; opacity:0.8; margin-left:4px; vertical-align:middle;" title="Сортировка: По имени (Я-А)">⬆️А</span>';
    else if (sortType === 'consult-asc') sortBadge = ' <span class="sort-badge" style="font-size:11px; font-weight:normal; opacity:0.8; margin-left:4px; vertical-align:middle;" title="Сортировка: По дате консультации (возр.)">⬇️📅</span>';
    else if (sortType === 'consult-desc') sortBadge = ' <span class="sort-badge" style="font-size:11px; font-weight:normal; opacity:0.8; margin-left:4px; vertical-align:middle;" title="Сортировка: По дате консультации (убыв.)">⬆️📅</span>';
    else if (sortType === 'created-asc') sortBadge = ' <span class="sort-badge" style="font-size:11px; font-weight:normal; opacity:0.8; margin-left:4px; vertical-align:middle;" title="Сортировка: По дате добавления (возр.)">⬇️➕</span>';
    else if (sortType === 'created-desc') sortBadge = ' <span class="sort-badge" style="font-size:11px; font-weight:normal; opacity:0.8; margin-left:4px; vertical-align:middle;" title="Сортировка: По дате добавления (убыв.)">⬆️➕</span>';

    return `<div class="${colClass}" data-stage="${escHtml(stage.key)}" data-blocked="${isBlocked?'1':'0'}">
      <div class="kanban-col-header" style="border-left:3px solid ${stage.color}">
        <div class="kanban-col-header-top">
          <span style="font-weight:700;">${stage.key}${isBlocked?' 🔒':''}${sortBadge}</span>
          <div style="display:flex; align-items:center;">
            <span class="kanban-count">${sortedItems.length}</span>
            <button class="col-menu-btn" onclick="openColumnMenu(event, '${escHtml(stage.key)}')">⋮</button>
          </div>
        </div>
        <div class="kanban-budget">${budgetStr}</div>
      </div>
      <div class="${colBodyClass}">
        ${sortedItems.length === 0 ? '<div class="kanban-empty">—</div>' :
          sortedItems.map(lead => {
            const name    = escHtml(getField(lead.fields, CONFIG.LEAD_FIELDS.name) || '—');
            const phone   = getField(lead.fields, CONFIG.LEAD_FIELDS.phone);
            const date    = formatDate(getField(lead.fields, CONFIG.LEAD_FIELDS.date));
            const src     = getField(lead.fields, CONFIG.LEAD_FIELDS.source);
            const budget  = lead.fields['Бюджет'];
            const igRaw   = lead.fields['Instagram'] || '';
            const igHandle = igRaw ? ('@' + (igRaw.match(/instagram\.com\/([^/?#\s]+)/)?.[1] || igRaw.replace(/^https?:\/\//,''))) : '';
            const manager = lead.fields['Менеджер'];
            const cd      = lead.fields['Дата консультации'];
            const mgBadge = manager
              ? `<div class="manager-badge" style="background:${getManagerColor(String(manager))}" title="${escHtml(String(manager))}">${escHtml(String(manager).charAt(0).toUpperCase())}</div>`
              : '';
            
            const archived = isLeadArchived(lead);
            const isSelected = SelectionState.selectedIds.has(lead.id);
            const nonTargetReason = lead.fields['Причина: Не целевой'];
            const cardClass = [
              'kanban-card',
              archived ? 'archived' : '',
              isSelected ? 'selected' : ''
            ].filter(Boolean).join(' ');

            return `<div class="${cardClass}" draggable="${!isBlocked && !SelectionState.active}" data-lead-id="${lead.id}" data-stage="${escHtml(stage.key)}">
              <div class="kanban-card-checkbox"></div>
              <div class="kanban-card-top">
                <div class="kanban-card-name">${name}</div>
                ${mgBadge}
              </div>
              ${phone  ? `<div class="kanban-card-sub">📱 ${escHtml(phone)}</div>` : ''}
              ${igHandle ? `<div class="kanban-card-sub" style="color:#c026d3; cursor:pointer;" onclick="event.stopPropagation(); copyInstagram('${escHtml(igRaw)}')">📸 ${escHtml(igHandle)}</div>` : ''}
              ${cd     ? `<div class="kanban-card-sub" style="color:#3b82f6">📅 ${escHtml(cd)} ${escHtml(lead.fields['Время консультации']||'')}</div>` :
                date    ? `<div class="kanban-card-sub">📋 ${date}</div>` : ''}
              ${budget  ? `<div class="kanban-card-sub" style="color:#34d399">💰 ${Number(budget).toLocaleString('ru-RU')} ₸</div>` : ''}
              ${nonTargetReason ? `<div class="kanban-card-sub" style="color:#94a3b8;font-size:11px">🚫 ${escHtml(nonTargetReason)}</div>` : ''}
              ${src    ? `<div class="kanban-card-sub" style="opacity:.6">${escHtml(src)}</div>` : ''}
            </div>`;
          }).join('')}
      </div>
    </div>`;
  };

  const rejectDivider = rejectCols.length ? `<div class="kanban-divider"><span>Отказы</span></div>` : '';
  const soldDivider   = soldCols.length   ? `<div class="kanban-divider"><span>Итог</span></div>`   : '';
  document.getElementById('leads-kanban').innerHTML =
    mainCols.map(renderCol).join('') +
    rejectDivider + rejectCols.map(renderCol).join('') +
    soldDivider   + soldCols.map(renderCol).join('');

  initDragDrop();
  initCardClicks();
  updateSelectionBar();
}

function initCardClicks() {
  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (_justDropped) return;
      const id = card.getAttribute('data-lead-id');
      const stage = card.getAttribute('data-stage');
      
      if (SelectionState.active && SelectionState.column === stage) {
        e.stopPropagation();
        toggleCardSelection(id);
        return;
      }
      
      openLeadDetail(id, stage);
    });
    
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = card.getAttribute('data-lead-id');
      const stage = card.getAttribute('data-stage');
      openCardContextMenu(e, id, stage);
    });
  });
}

// ─── Shared Drag & Drop Placeholder Helpers
let dragPlaceholderEl = null;

function getDragPlaceholder() {
  if (!dragPlaceholderEl) {
    dragPlaceholderEl = document.createElement('div');
    dragPlaceholderEl.id = 'drag-ph';
    dragPlaceholderEl.style.cssText = [
      'height:4px', 'border-radius:99px',
      'background:var(--accent)',
      'box-shadow:0 0 10px rgba(99,102,241,0.7)',
      'margin:6px 2px', 'pointer-events:none',
      'flex-shrink:0', 'transition:opacity 0.1s',
    ].join(';');
  }
  return dragPlaceholderEl;
}

function removeDragPlaceholder() {
  const ph = getDragPlaceholder();
  if (ph.parentNode) ph.remove();
}

function placeDragPlaceholder(colBody, clientY) {
  const ph = getDragPlaceholder();
  const cards = [...colBody.querySelectorAll('.kanban-card')].filter(c => !c.classList.contains('dragging'));
  if (!cards.length) {
    colBody.appendChild(ph);
    return;
  }
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    if (clientY < r.top + r.height / 2) {
      colBody.insertBefore(ph, c);
      return;
    }
  }
  colBody.appendChild(ph);
}

// ─── Shared Drag & Drop Reordering Helpers
function reorderLocalLeads(leadId, beforeId) {
  const leadIdx = State.leads.findIndex(l => String(l.id) === String(leadId));
  if (leadIdx === -1) return;
  const [lead] = State.leads.splice(leadIdx, 1);
  
  if (beforeId) {
    const beforeIdx = State.leads.findIndex(l => String(l.id) === String(beforeId));
    if (beforeIdx !== -1) {
      State.leads.splice(beforeIdx, 0, lead);
      return;
    }
  }
  State.leads.push(lead);
}

async function moveBaserowRow(tableId, rowId, beforeId) {
  try {
    const query = beforeId ? `?before_id=${parseInt(beforeId, 10)}` : '';
    await Baserow.req('PATCH', `/database/rows/table/${tableId}/${rowId}/move/${query}`);
  } catch (err) {
    console.error('Failed to move row in Baserow:', err);
  }
}

// ─── Drag & Drop (Desktop) — с плейсхолдером между карточками
function initDragDrop() {
  // ── Карточки
  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      DragState.leadId    = card.dataset.leadId;
      DragState.fromStage = card.dataset.stage;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.leadId);
      requestAnimationFrame(() => card.classList.add('dragging'));
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
      removeDragPlaceholder();
    });
  });

  // ── Колонки
  document.querySelectorAll('.kanban-col').forEach(col => {
    const colBody = col.querySelector('.kanban-col-body');
    const isBlocked = () => col.dataset.blocked === '1';

    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = isBlocked() ? 'none' : 'move';
      document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
      
      // Highlight with drag-over ONLY if it is a DIFFERENT stage/column
      if (col.dataset.stage !== DragState.fromStage) {
        col.classList.add('drag-over');
      }
      
      if (!isBlocked()) placeDragPlaceholder(colBody, e.clientY);
      else removeDragPlaceholder();
    });

    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) {
        col.classList.remove('drag-over');
        removeDragPlaceholder();
      }
    });

    col.addEventListener('drop', e => {
      e.preventDefault();
      document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
      
      const ph = getDragPlaceholder();
      const beforeCard = ph.nextElementSibling;
      const beforeId = beforeCard && beforeCard.classList.contains('kanban-card')
        ? parseInt(beforeCard.dataset.leadId, 10)
        : null;
        
      removeDragPlaceholder();
      const newStage     = col.dataset.stage;
      const toBlocked    = col.dataset.blocked === '1';
      const fromStageObj = FUNNEL_STAGES.find(s => s.key === DragState.fromStage);
      const fromBlocked  = fromStageObj?.blocked;
      if (toBlocked || fromBlocked) {
        DragState.leadId = null;
        toast('Используйте кнопки действий в карточке лида', 'error');
        return;
      }
      
      if (DragState.leadId && newStage) {
        _justDropped = true;
        setTimeout(() => { _justDropped = false; }, 300);
        
        if (newStage !== DragState.fromStage) {
          handleStageDrop(DragState.leadId, newStage, DragState.fromStage, beforeId);
        } else {
          const sortType = State.columnSorting[newStage] || 'default';
          if (sortType !== 'default') {
            toast('Сбросьте сортировку колонки для ручного перемещения', 'warning');
            DragState.leadId = null;
            return;
          }
          reorderLocalLeads(DragState.leadId, beforeId);
          renderKanban(State.leads);
          moveBaserowRow(CONFIG.TABLES.LEADS, DragState.leadId, beforeId);
        }
      }
      DragState.leadId = null;
    });
  });

  initTouchDrag();
}

// ─── Touch Drag (Mobile)
function initTouchDrag() {
  let autoScrollInterval = null;
  let lastTouchX = 0;
  let lastTouchY = 0;

  function startAutoScroll() {
    if (autoScrollInterval) return; // Already running
    autoScrollInterval = setInterval(() => {
      let scrolled = false;
      const wrap = document.querySelector('.kanban-wrap');
      
      // Horizontal scroll (.kanban-wrap)
      if (wrap) {
        if (lastTouchX < 80) {
          const speed = Math.max(4, Math.min(20, Math.round((80 - lastTouchX) / 3)));
          wrap.scrollLeft -= speed;
          scrolled = true;
        } else if (lastTouchX > window.innerWidth - 80) {
          const speed = Math.max(4, Math.min(20, Math.round((lastTouchX - (window.innerWidth - 80)) / 3)));
          wrap.scrollLeft += speed;
          scrolled = true;
        }
      }
      
      // Vertical scroll (page window)
      if (lastTouchY < 140) {
        const speed = Math.max(5, Math.min(25, Math.round((140 - lastTouchY) / 4)));
        window.scrollBy(0, -speed);
        scrolled = true;
      } else if (lastTouchY > window.innerHeight - 140) {
        const speed = Math.max(5, Math.min(25, Math.round((lastTouchY - (window.innerHeight - 140)) / 4)));
        window.scrollBy(0, speed);
        scrolled = true;
      }
      
      if (!scrolled) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
      }
    }, 50);
  }

  function stopAutoScroll() {
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
  }

  document.querySelectorAll('.kanban-card').forEach(card => {
    let timer = null, ghost = null;
    card.addEventListener('touchstart', e => {
      const firstTouch = e.touches[0];
      if (firstTouch) {
        lastTouchX = firstTouch.clientX;
        lastTouchY = firstTouch.clientY;
      }
      timer = setTimeout(() => {
        DragState.leadId    = card.dataset.leadId;
        DragState.fromStage = card.dataset.stage;
        const rect = card.getBoundingClientRect();
        ghost = card.cloneNode(true);
        ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:9999;pointer-events:none;opacity:0.85;transform:scale(1.04) rotate(1deg);box-shadow:0 10px 30px rgba(0,0,0,0.6);border-radius:8px;`;
        document.body.appendChild(ghost);
        card.style.opacity='0.3';
        card.classList.add('dragging');
        navigator.vibrate?.(60);
      }, 400);
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      if (!ghost) { clearTimeout(timer); return; }
      e.preventDefault();
      const touch = e.touches[0], rect = card.getBoundingClientRect();
      ghost.style.left = (touch.clientX - rect.width/2) + 'px';
      ghost.style.top  = (touch.clientY - 40) + 'px';
      
      // Update coordinates and start auto-scrolling if near edges
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      startAutoScroll();

      ghost.style.display = 'none';
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      ghost.style.display = '';
      
      const col = el?.closest('.kanban-col');
      document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
      
      if (col) {
        const isBlocked = col.dataset.blocked === '1';
        const colBody = col.querySelector('.kanban-col-body');
        
        // Highlight with drag-over ONLY if it is a DIFFERENT stage/column
        if (col.dataset.stage !== DragState.fromStage) {
          col.classList.add('drag-over');
        }
        
        if (!isBlocked) {
          placeDragPlaceholder(colBody, touch.clientY);
        } else {
          removeDragPlaceholder();
        }
      } else {
        removeDragPlaceholder();
      }
    }, { passive: false });

    const endDrag = e => {
      clearTimeout(timer);
      stopAutoScroll();
      document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
      
      const ph = getDragPlaceholder();
      const beforeCard = ph.nextElementSibling;
      const beforeId = beforeCard && beforeCard.classList.contains('kanban-card')
        ? parseInt(beforeCard.dataset.leadId, 10)
        : null;
        
      removeDragPlaceholder();
      
      if (!ghost) return;
      const touch = (e.changedTouches||e.touches)[0];
      ghost.remove(); ghost = null; card.style.opacity = '';
      card.classList.remove('dragging');
      
      const clientX = lastTouchX || (touch ? touch.clientX : 0);
      const clientY = lastTouchY || (touch ? touch.clientY : 0);
      
      // Reset coordinates for next drag
      lastTouchX = 0;
      lastTouchY = 0;
      
      const el  = document.elementFromPoint(clientX, clientY);
      const targetCol = el?.closest('.kanban-col');
      const newStage  = targetCol?.dataset.stage;
      const toBlocked = targetCol?.dataset.blocked === '1';
      const fromStageObj = FUNNEL_STAGES.find(s => s.key === DragState.fromStage);
      if (toBlocked || fromStageObj?.blocked) {
        DragState.leadId = null;
        toast('Используйте кнопки действий в карточке лида', 'error');
        return;
      }
      
      if (DragState.leadId && newStage) {
        _justDropped = true;
        setTimeout(() => { _justDropped = false; }, 300);
        
        if (newStage !== DragState.fromStage) {
          handleStageDrop(DragState.leadId, newStage, DragState.fromStage, beforeId);
        } else {
          const sortType = State.columnSorting[newStage] || 'default';
          if (sortType !== 'default') {
            toast('Сбросьте сортировку колонки для ручного перемещения', 'warning');
            DragState.leadId = null;
            return;
          }
          reorderLocalLeads(DragState.leadId, beforeId);
          renderKanban(State.leads);
          moveBaserowRow(CONFIG.TABLES.LEADS, DragState.leadId, beforeId);
        }
      }
      DragState.leadId = null;
    };
    card.addEventListener('touchend', endDrag);
    card.addEventListener('touchcancel', endDrag);
  });
}

// ─── Stage drop (без всплывашки — перенос мгновенный)
async function handleStageDrop(leadId, newStage, fromStage, beforeId) {
  if (newStage === 'Не целевой') {
    openNonTargetModal([leadId]);
    return;
  }
  await updateLeadStageOptimistic(leadId, newStage, fromStage, beforeId);
}

// ─── Оптимистичное обновление этапа
async function updateLeadStageOptimistic(id, newStage, oldStage, beforeId) {
  const lead = State.leads.find(l => l.id === id);
  const stageField = lead ? getStageFieldName(lead.fields) : 'Воронка';
  const stageObj = FUNNEL_STAGES.find(s => s.key === newStage);
  const stageId = stageObj ? stageObj.id : null;
  const oldStageObj = FUNNEL_STAGES.find(s => s.key === oldStage);
  const oldStageId = oldStageObj ? oldStageObj.id : null;
  
  const apiUpdates = { [stageField]: stageId || [] };
  const localUpdates = {
    [stageField]: newStage,
    [stageField + ' ID']: stageId ? String(stageId) : ''
  };

  // ─── Логируем смену этапа в историю
  if (lead && oldStage !== newStage) {
    const history = safeJsonParse(lead.fields['История'] || '[]');
    const currentUser = localStorage.getItem('crm_current_user') || 'Система';
    history.unshift({
      date: new Date().toLocaleString('ru-RU'),
      user: currentUser,
      type: 'stage_change',
      details: `Этап: «${oldStage || '—'}» → «${newStage}»`
    });
    const historyStr = JSON.stringify(history);
    apiUpdates['История'] = historyStr;
    localUpdates['История'] = historyStr;
  }

  if (lead) {
    Object.assign(lead.fields, localUpdates);
    
    const stagesOrdered = FUNNEL_STAGES.map(s => s.key);
    const targetIdx = stagesOrdered.indexOf(newStage);
    const consultIdx = stagesOrdered.indexOf('Консультация назначена');
    
    // Auto-set "Дата назначения" if moving to "Консультация назначена" (or later) and manager is assigned
    if (targetIdx >= consultIdx && lead.fields['Менеджер'] && !lead.fields['Дата назначения']) {
      const todayStr = new Date().toLocaleDateString('ru-RU');
      lead.fields['Дата назначения'] = todayStr;
      apiUpdates['Дата назначения'] = todayStr;
      localUpdates['Дата назначения'] = todayStr;
    }
    
    // Auto-set "Дата продажи" if moving to "Продано"
    if (newStage === 'Продано' && !lead.fields['Дата продажи']) {
      const todayStr = new Date().toLocaleDateString('ru-RU');
      lead.fields['Дата продажи'] = todayStr;
      apiUpdates['Дата продажи'] = todayStr;
      localUpdates['Дата продажи'] = todayStr;
    }
    
    // Auto-set "Дата возврата" if moving to "Возвраты"
    if (newStage === 'Возвраты' && !lead.fields['Дата возврата']) {
      const todayStr = new Date().toLocaleDateString('ru-RU');
      lead.fields['Дата возврата'] = todayStr;
      apiUpdates['Дата возврата'] = todayStr;
      localUpdates['Дата возврата'] = todayStr;
    }

    if (beforeId !== undefined) {
      reorderLocalLeads(id, beforeId);
    }
  }
  
  renderKanban(State.leads);
  try {
    await Airtable.update(CONFIG.TABLES.LEADS, id, apiUpdates);
    if (beforeId !== undefined) {
      await moveBaserowRow(CONFIG.TABLES.LEADS, id, beforeId);
    }
    toast('Этап обновлён ✓');
  } catch(e) {
    if (lead) { 
      lead.fields[stageField] = oldStage || ''; 
      lead.fields[stageField + ' ID'] = oldStageId ? String(oldStageId) : '';
    }
    renderKanban(State.leads);
    toast('Ошибка: ' + e.message, 'error');
  }
}

async function updateLeadStage(id, newStage) {
  const lead = State.leads.find(l => l.id === id);
  const stageField = lead ? getStageFieldName(lead.fields) : 'Воронка';
  const oldStage = lead?.fields[stageField] || '';
  if (newStage === 'Не целевой') {
    openNonTargetModal([id]);
    return;
  }
  
  const drawer = document.getElementById('drawer-detail');
  if (drawer && drawer.classList.contains('open')) {
    try {
      await saveLeadEdit(id);
    } catch(e) {
      console.warn('Failed to save lead edit before stage change:', e.message);
    }
  }
  
  closeDrawer('drawer-detail');
  updateLeadStageOptimistic(id, newStage, oldStage);
}

// ─── Helper for safe parsing
function safeJsonParse(str, fallback = []) {
  if (!str) return fallback;
  try {
    if (typeof str === 'object') return str;
    return JSON.parse(str);
  } catch (e) {
    console.error("JSON parse error:", e, str);
    return fallback;
  }
}

// ─── Render Lead Middle Column
function renderLeadMiddleColumn(lead) {
  const container = document.getElementById('lead-middle-col-content');
  if (!container) return;

  const f = lead.fields;
  const tasks = safeJsonParse(f['Задачи'] || '[]');
  const comments = safeJsonParse(f['Комментарии_Лог'] || '[]');
  const history = safeJsonParse(f['История'] || '[]');
  const id = lead.id;

  // Active user selection
  const currentUser = localStorage.getItem('crm_current_user') || '';
  const empOptions = State.employees.map(e => {
    const name = e.fields['Имя'] || '';
    return `<option value="${escHtml(name)}" ${currentUser === name ? 'selected' : ''}>${escHtml(name)}</option>`;
  }).join('');

  const activeTasks = tasks.filter(t => !t.done);
  const completedTasks = tasks.filter(t => t.done);

  // Sort active tasks by dueDate (ascending)
  activeTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  // Sort completed tasks by completedAt (descending)
  completedTasks.sort((a, b) => {
    // Parser for "dd.mm.yyyy hh:mm"
    const parseDateTime = (str) => {
      if (!str) return 0;
      const parts = str.split(' ');
      if (parts.length < 2) return 0;
      const dParts = parts[0].split('.');
      const tParts = parts[1].split(':');
      if (dParts.length < 3 || tParts.length < 2) return 0;
      return new Date(dParts[2], dParts[1] - 1, dParts[0], tParts[0], tParts[1]).getTime();
    };
    return parseDateTime(b.completedAt) - parseDateTime(a.completedAt);
  });

  const todayStr = new Date().toISOString().substring(0, 10);

  const activeTasksHtml = activeTasks.length === 0 
    ? '<div style="color:var(--text2); font-size:13px; font-style:italic; padding:6px 0;">Нет активных задач</div>'
    : activeTasks.map(t => {
        const isOverdue = t.dueDate < todayStr;
        const isToday = t.dueDate === todayStr;
        const dueClass = isOverdue ? 'overdue' : (isToday ? 'today' : 'future');
        const dueLabel = isOverdue ? 'Просрочено: ' : (isToday ? 'Сегодня: ' : 'Срок: ');
        return `
          <div class="task-item">
            <input type="checkbox" class="task-checkbox" onclick="toggleTaskDone('${id}', '${t.id}')">
            <div class="task-content">
              <div class="task-text">${escHtml(t.text)}</div>
              <div class="task-meta">
                <span>👤 ${escHtml(t.user || '—')}</span>
                <span class="task-due ${dueClass}">${dueLabel}${formatDate(t.dueDate)}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

  const completedTasksHtml = completedTasks.length === 0
    ? '<div style="color:var(--text2); font-size:12px; font-style:italic; padding:6px 0;">Нет выполненных задач</div>'
    : completedTasks.map(t => `
        <div class="task-item completed">
          <input type="checkbox" class="task-checkbox" checked onclick="toggleTaskDone('${id}', '${t.id}')">
          <div class="task-content">
            <div class="task-text">${escHtml(t.text)}</div>
            <div class="task-meta">
              <span>👤 ${escHtml(t.user || '—')}</span>
              <span>Выполнено: ${escHtml(t.completedAt)}</span>
            </div>
          </div>
        </div>
      `).join('');

  const commentsHtml = comments.length === 0
    ? '<div style="color:var(--text2); font-size:13px; font-style:italic; padding:8px 0;">Нет комментариев</div>'
    : comments.map(c => `
        <div class="comment-bubble">
          <div class="comment-header">
            <span class="comment-user">👤 ${escHtml(c.user || '—')}</span>
            <span class="comment-date">${escHtml(c.date)}</span>
          </div>
          <div class="comment-body">${escHtml(c.text)}</div>
        </div>
      `).join('');

  const historyHtml = history.length === 0
    ? '<div style="color:var(--text2); font-size:12px; font-style:italic; padding:6px 0;">Нет истории</div>'
    : history.map(h => {
        let icon = '📝';
        if (h.type === 'stage_change') icon = '🔄';
        else if (h.type === 'task_create') icon = '➕';
        else if (h.type === 'task_done') icon = '✅';
        else if (h.type === 'comment_add') icon = '💬';
        else if (h.type === 'edit_fields') icon = '⚙️';
        
        return `
          <div class="history-item">
            <div class="history-meta">
              <span>${icon} ${escHtml(h.user || '—')}</span>
              <span>${escHtml(h.date)}</span>
            </div>
            <div class="history-details">${escHtml(h.details)}</div>
          </div>
        `;
      }).join('');

  container.innerHTML = `
    <!-- User Selector -->
    <div class="user-selector-container">
      <span style="font-weight:700">Кто делает:</span>
      <select id="lead-current-user" class="form-select compact-input" style="flex:1; padding:4px 8px !important; height:28px !important; font-size:12px !important; margin:0;" onchange="localStorage.setItem('crm_current_user', this.value)">
        <option value="">— Выберите себя —</option>
        ${empOptions}
      </select>
    </div>

    <!-- Active Tasks -->
    <div class="middle-col-section">
      <div class="section-subtitle">📋 Задачи</div>
      <div class="active-tasks-list">${activeTasksHtml}</div>
      
      <!-- Add Task Form -->
      <div class="inline-form" style="margin-top:12px; padding:10px; background:rgba(255,255,255,0.02); border-radius:8px; border:1px solid rgba(255,255,255,0.04)">
        <div style="font-size:12px; font-weight:700; color:var(--text2); margin-bottom:6px;">Новая задача:</div>
        <input type="text" id="ei-new-task-text" class="form-input compact-input" placeholder="Что нужно сделать..." style="width:100%; margin-bottom:6px; min-height: unset !important;">
        <div class="inline-form-row">
          <input type="date" id="ei-new-task-date" class="form-input compact-input" onclick="try{this.showPicker()}catch(e){}" style="flex:1;">
          <button class="btn btn-save-compact" onclick="addLeadTask('${id}')" style="padding:6px 12px !important; font-size:12px !important; height:34px !important;">Добавить</button>
        </div>
      </div>

      <!-- Completed Tasks Collapsible -->
      <details style="margin-top:10px; cursor:pointer;">
        <summary style="font-size:12px; color:var(--text2); font-weight:600; outline:none; padding:4px 0;">Выполненные задачи (${completedTasks.length})</summary>
        <div style="margin-top:8px; max-height:150px; overflow-y:auto; padding-right:4px;">${completedTasksHtml}</div>
      </details>
    </div>

    <!-- Comments -->
    <div class="middle-col-section">
      <div class="section-subtitle">💬 Комментарии</div>
      
      <!-- Add Comment Form -->
      <div class="inline-form" style="margin-bottom:12px;">
        <textarea id="ei-new-comment" class="form-input compact-input" placeholder="Напишите комментарий..." style="height:60px !important; min-height:60px !important; width:100%; resize:vertical;"></textarea>
        <div style="display:flex; justify-content:flex-end; margin-top: 6px;">
          <button class="btn btn-save-compact" onclick="addLeadComment('${id}')" style="padding:6px 12px !important; font-size:12px !important;">Отправить</button>
        </div>
      </div>

      <div class="comments-list">${commentsHtml}</div>
    </div>

    <!-- History -->
    <div class="middle-col-section">
      <div class="section-subtitle">📜 История изменений</div>
      <div class="history-list">${historyHtml}</div>
    </div>
  `;
}

// ─── Actions for Lead Tasks/Comments
async function addLeadComment(id) {
  const textEl = document.getElementById('ei-new-comment');
  const text = textEl?.value.trim();
  if (!text) return;

  const lead = State.leads.find(l => l.id === id);
  if (!lead) return;

  const currentUser = localStorage.getItem('crm_current_user') || 'Система';
  const dateStr = new Date().toLocaleString('ru-RU');

  const comments = safeJsonParse(lead.fields['Комментарии_Лог'] || '[]');
  comments.unshift({
    date: dateStr,
    user: currentUser,
    text: text
  });

  const history = safeJsonParse(lead.fields['История'] || '[]');
  history.unshift({
    date: dateStr,
    user: currentUser,
    type: 'comment_add',
    details: `Добавлен комментарий: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`
  });

  const updates = {
    'Комментарии_Лог': JSON.stringify(comments),
    'История': JSON.stringify(history)
  };

  textEl.value = '';

  try {
    await Airtable.update(CONFIG.TABLES.LEADS, id, updates);
    Object.assign(lead.fields, updates);
    renderLeadMiddleColumn(lead);
    toast('Комментарий добавлен ✓');
  } catch (e) {
    toast('Ошибка добавления комментария: ' + e.message, 'error');
  }
}

async function addLeadTask(id) {
  const textEl = document.getElementById('ei-new-task-text');
  const dateEl = document.getElementById('ei-new-task-date');
  const text = textEl?.value.trim();
  const dueDate = dateEl?.value;

  if (!text) { toast('Введите текст задачи', 'error'); return; }
  if (!dueDate) { toast('Выберите срок выполнения', 'error'); return; }

  const lead = State.leads.find(l => l.id === id);
  if (!lead) return;

  const currentUser = localStorage.getItem('crm_current_user') || 'Система';
  const dateStr = new Date().toLocaleString('ru-RU');

  const tasks = safeJsonParse(lead.fields['Задачи'] || '[]');
  const newTask = {
    id: 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    text: text,
    dueDate: dueDate,
    done: false,
    createdAt: dateStr,
    completedAt: '',
    user: currentUser
  };
  tasks.push(newTask);

  const history = safeJsonParse(lead.fields['История'] || '[]');
  history.unshift({
    date: dateStr,
    user: currentUser,
    type: 'task_create',
    details: `Создана задача: "${text}" (срок: ${formatDate(dueDate)})`
  });

  const updates = {
    'Задачи': JSON.stringify(tasks),
    'История': JSON.stringify(history)
  };

  textEl.value = '';
  dateEl.value = '';

  try {
    await Airtable.update(CONFIG.TABLES.LEADS, id, updates);
    Object.assign(lead.fields, updates);
    renderLeadMiddleColumn(lead);
    toast('Задача добавлена ✓');
  } catch (e) {
    toast('Ошибка добавления задачи: ' + e.message, 'error');
  }
}

async function toggleTaskDone(leadId, taskId) {
  const lead = State.leads.find(l => l.id === leadId);
  if (!lead) return;

  const currentUser = localStorage.getItem('crm_current_user') || 'Система';
  const dateStr = new Date().toLocaleString('ru-RU');

  const tasks = safeJsonParse(lead.fields['Задачи'] || '[]');
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  task.done = !task.done;
  task.completedAt = task.done ? dateStr : '';

  const history = safeJsonParse(lead.fields['История'] || '[]');
  history.unshift({
    date: dateStr,
    user: currentUser,
    type: 'task_done',
    details: task.done ? `Выполнена задача: "${task.text}"` : `Задача возвращена в работу: "${task.text}"`
  });

  const updates = {
    'Задачи': JSON.stringify(tasks),
    'История': JSON.stringify(history)
  };

  try {
    await Airtable.update(CONFIG.TABLES.LEADS, leadId, updates);
    Object.assign(lead.fields, updates);
    renderLeadMiddleColumn(lead);
    toast(task.done ? 'Задача выполнена ✓' : 'Задача возвращена в работу');
  } catch (e) {
    toast('Ошибка обновления задачи: ' + e.message, 'error');
  }
}

// Expose these functions to window context
window.addLeadComment = addLeadComment;
window.addLeadTask = addLeadTask;
window.toggleTaskDone = toggleTaskDone;

// ─── Синхронизация с Google Календарем
async function syncGoogleCalendarEvent(lead) {
  if (!lead) return;
  const id = lead.id;
  const f = lead.fields;
  const dateVal = f['Дата консультации'] || '';
  const timeVal = f['Время консультации'] || '';
  const eventId = f['Google_Event_ID'] || '';
  
  const leadName = getField(f, CONFIG.LEAD_FIELDS.name) || 'Лид';
  const sourceName = getField(f, CONFIG.LEAD_FIELDS.source) || '';
  const managerName = f['Менеджер'] || '';
  const phone = getField(f, CONFIG.LEAD_FIELDS.phone) || '';
  const comment = f['Комментарий'] || '';
  
  const title = `Консультация: ${leadName}`;
  const desc = `Менеджер: ${managerName}\nИсточник: ${sourceName}\nТелефон: ${phone}\nКомментарий: ${comment}`;
  
  const hasDateAndTime = dateVal.trim() !== '' && timeVal.trim() !== '';
  
  if (hasDateAndTime) {
    const action = eventId ? 'updateEvent' : 'createEvent';
    toast('Синхронизация с Google Календарем...');
    try {
      let url = `${CONFIG.APPS_SCRIPT_URL}?key=${CONFIG.API_KEY}&action=${action}&title=${encodeURIComponent(title)}&date=${encodeURIComponent(dateVal)}&time=${encodeURIComponent(timeVal)}&desc=${encodeURIComponent(desc)}`;
      if (eventId) {
        url += `&eventId=${encodeURIComponent(eventId)}`;
      }
      
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      if (data.success && data.eventId && data.eventId !== eventId) {
        await Airtable.update(CONFIG.TABLES.LEADS, id, { 'Google_Event_ID': data.eventId });
        lead.fields['Google_Event_ID'] = data.eventId;
      }
      toast('Синхронизация с Google Календарем успешна ✓');
    } catch(e) {
      console.error('Calendar sync error:', e);
      toast('Не удалось синхронизировать Календарь: ' + e.message, 'error');
    }
  } else if (eventId) {
    toast('Удаление события из Google Календаря...');
    try {
      const url = `${CONFIG.APPS_SCRIPT_URL}?key=${CONFIG.API_KEY}&action=deleteEvent&eventId=${encodeURIComponent(eventId)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      await Airtable.update(CONFIG.TABLES.LEADS, id, { 'Google_Event_ID': null });
      lead.fields['Google_Event_ID'] = '';
      toast('Событие удалено из Google Календаря ✓');
    } catch(e) {
      console.error('Calendar delete error:', e);
      toast('Не удалось удалить из Google Календаря: ' + e.message, 'error');
    }
  }
}
window.syncGoogleCalendarEvent = syncGoogleCalendarEvent;

// ─── Lead detail drawer
async function openLeadDetail(id, stage) {
  if (State.employees.length === 0) {
    State.employees = await Airtable.getAll(CONFIG.TABLES.EMPLOYEES);
  }
  const lead = State.leads.find(l => l.id === id); if (!lead) return;
  const f    = lead.fields;
  const name    = escHtml(getField(f, CONFIG.LEAD_FIELDS.name) || 'Лид');
  const rawPhone = getField(f, CONFIG.LEAD_FIELDS.phone);
  const phone    = rawPhone.replace(/\D/g,'');
  const waPhone  = phone.startsWith('8') ? '7' + phone.slice(1) : phone;
  const isBlocked = FUNNEL_STAGES.find(s => s.key === stage)?.blocked;
  const isSold    = stage === 'Продано';

  // Employee options for manager select
  const empOptions = State.employees.map(e =>
    `<option value="${e.id}" ${f['Менеджер']=== e.fields['Имя']?'selected':''}>${escHtml(e.fields['Имя']||'')}</option>`
  ).join('');

  const stageButtons = isBlocked ? '' : `
    <div class="section-title">Изменить этап</div>
    <div class="stage-buttons" style="gap:6px">
      ${FUNNEL_STAGES.filter(s => !s.blocked).map(s =>
        `<button onclick="updateLeadStage('${id}','${s.key}')" class="stage-btn stage-btn-compact ${s.key===stage?'active':''}" style="--sc:${s.color}">${s.key}</button>`
      ).join('')}
    </div>`;

  document.getElementById('detail-content').innerHTML = `
    <div class="drawer-handle"></div>
    
    <!-- HEADER BAR: Title, status and Save Button in reach -->
    <div class="drawer-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:12px; margin-bottom:12px; flex-wrap: wrap; gap:10px; padding-right: 40px;">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <h3 class="drawer-title" style="margin:0; font-size:18px; font-weight:800; color:#fff;">🎯 ${name}</h3>
        <div>${statusBadge(stage)}</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-save-compact" onclick="saveLeadEdit('${id}')">💾 Сохранить</button>
      </div>
    </div>

    ${(f['Дата консультации'] || stage === 'Консультация назначена' || stage === 'КП на рассмотрении' || stage === 'Договор на рассмотрении' || f['Консультация проведена']) ? `
      <div class="card" style="margin-bottom:12px; border-color:#3b82f6; padding:10px 14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        ${f['Дата консультации'] ? `<div style="color:#3b82f6; font-weight:600; font-size:13px;">📅 ${escHtml(f['Дата консультации'])} ${escHtml(f['Время консультации']||'')}</div>` : '<div style="color:#3b82f6; font-weight:600; font-size:13px;">📅 Консультация запланирована</div>'}
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; font-weight:600">
          <input type="checkbox" id="ei-consult-done" ${f['Консультация проведена']?'checked':''}
            style="width:16px; height:16px; accent-color:#6366f1; cursor:pointer">
          <span style="color:${f['Консультация проведена']?'#34d399':'var(--text2)'}">
            ${f['Консультация проведена'] ? '✅ Проведена' : 'Проведена?'}
          </span>
        </label>
      </div>` : ''}

    <div class="drawer-three-cols">
      <!-- LEFT COLUMN: Fields strictly stacked vertically -->
      <div class="drawer-left-col">
        <div class="grid-fields-single">
          <div class="form-group">
            <label class="form-label">Имя</label>
            <input class="form-input compact-input" id="ei-name" value="${escHtml(getField(f,CONFIG.LEAD_FIELDS.name))}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Телефон</label>
            <input class="form-input compact-input" id="ei-phone" type="tel" value="${escHtml(getField(f,CONFIG.LEAD_FIELDS.phone))}"/>
          </div>
          <div class="form-group">
            <label class="form-label">📸 Instagram</label>
            <div style="display:flex; gap:6px; align-items:center;">
              <input class="form-input compact-input" id="ei-instagram" type="text" placeholder="Никнейм или ссылка" value="${escHtml(f['Instagram']||'')}" style="flex:1; min-width:0;"/>
              ${f['Instagram'] ? `
              <button class="btn btn-secondary btn-compact" onclick="copyInstagram('${escHtml(f['Instagram'])}')" title="Копировать" style="flex:0 0 32px; width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center;">📋</button>` : ''}
              ${f['Instagram'] && (f['Instagram'].startsWith('http://') || f['Instagram'].startsWith('https://')) ? `
              <a href="${escHtml(f['Instagram'])}" target="_blank" rel="noopener" class="btn btn-secondary btn-compact" title="Открыть в Instagram" style="flex:0 0 32px; width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center; text-decoration:none;">↗️</a>` : ''}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Источник</label>
            <input class="form-input compact-input" id="ei-source" value="${escHtml(getField(f,CONFIG.LEAD_FIELDS.source))}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Бюджет (₸)</label>
            <input class="form-input compact-input" id="ei-budget" type="number" placeholder="0" value="${escHtml(String(f['Бюджет']||''))}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Оплачено (₸)</label>
            <input class="form-input compact-input" id="ei-paid" type="number" placeholder="0" value="${escHtml(String(f['Оплата']||''))}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Менеджер</label>
            <select class="form-select compact-input" id="ei-manager">
              <option value="">— не назначен —</option>
              ${empOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">📅 Дата консультации</label>
            <input class="form-input compact-input" id="ei-consult-date" type="date" onclick="try{this.showPicker()}catch(e){}" value="${toInputDateFormat(f['Дата консультации'])}"/>
          </div>
          <div class="form-group">
            <label class="form-label">🕒 Время консультации</label>
            <input class="form-input compact-input" id="ei-consult-time" type="time" onclick="try{this.showPicker()}catch(e){}" value="${escHtml(f['Время консультации']||'')}"/>
          </div>
          <div class="form-group">
            <label class="form-label">📝 Дата назначения</label>
            <input class="form-input compact-input" id="ei-assign-date" type="date" onclick="try{this.showPicker()}catch(e){}" value="${toInputDateFormat(f['Дата назначения'])}"/>
          </div>
          <div class="form-group form-group-full">
            <label class="form-label">🔗 Ссылка на запись встречи</label>
            <div style="display:flex; gap:6px; align-items:center">
              <input class="form-input compact-input" id="ei-record-link" type="url" placeholder="https://..." value="${escHtml(f['Ссылка на запись']||'')}" style="flex:1; min-width:0;" oninput="updateAuditButtonState()"/>
              <button id="ei-audit-btn" class="btn btn-secondary btn-compact" onclick="openAuditLink()" style="white-space:nowrap; display:inline-flex; align-items:center; justify-content:center; height:32px; width:auto !important;" ${f['Ссылка на запись'] ? '' : 'disabled'}>🤖 Аудит</button>
            </div>
          </div>
          ${f['Причина: Не целевой'] || stage === 'Не целевой' ? `
          <div class="form-group form-group-full">
            <label class="form-label">🚫 Причина (не целевой)</label>
            <select class="form-select compact-input" id="ei-nontarget-reason">
              <option value="">— не указана —</option>
              ${NON_TARGET_REASONS.map(r=>`<option value="${escHtml(r)}"${f['Причина: Не целевой']===r?' selected':''}>${escHtml(r)}</option>`).join('')}
            </select>
          </div>` : ''}
          <div class="form-group form-group-full" style="margin-bottom:0">
            <label class="form-label">Комментарий</label>
            <textarea class="form-input form-textarea compact-input" id="ei-comment">${escHtml(f['Комментарий']||'')}</textarea>
          </div>
        </div>
      </div>

      <!-- MIDDLE COLUMN: Comments, Tasks, History -->
      <div class="drawer-middle-col" id="lead-middle-col-content">
        <!-- Rendered dynamically -->
      </div>

      <!-- RIGHT COLUMN: Actions & Tools -->
      <div class="drawer-right-col">
        <!-- Communication -->
        <div class="section-title" style="margin-top:0">Связь</div>
        <div class="comm-block" style="display:flex; flex-direction:column; gap:6px;">
          ${phone ? `<a href="https://wa.me/${waPhone}" target="_blank" rel="noopener" class="btn btn-whatsapp btn-compact" style="text-align:center; display:flex; align-items:center; justify-content:center; font-weight:700; text-decoration:none;">📱 WhatsApp</a>` : `<span style="color:var(--text2); font-size:13px; padding:8px 0;">Нет номера</span>`}
          ${MSG_TEMPLATES.map((t, i) => `<button class="btn btn-template btn-compact" onclick="sendTemplate(${i}, '${waPhone}', '${id}')" style="width:100%; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:12px;">${escHtml(t.name)}</button>`).join('')}
        </div>

        <!-- Main Actions -->
        ${!isBlocked || isSold ? `
        <div class="section-title">Основные действия</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${!isBlocked ? `<button class="btn btn-sale btn-compact" onclick="openSaleModal('${id}')" style="font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:6px;">💰 Оформить продажу</button>` : ''}
          ${isSold     ? `<button class="btn btn-danger btn-compact" onclick="openRefundModal('${id}')" style="font-weight:700; display:inline-flex; align-items:center; justify-content:center; gap:6px;">↩️ Сделать возврат</button>` : ''}
        </div>` : ''}

        <!-- Tools -->
        <div class="section-title">Инструменты</div>
        <div class="tools-panel" style="display:flex; gap:6px; margin:0;">
          <a href="https://t.me/mk_contract_bot" target="_blank" rel="noopener" class="btn btn-tool btn-compact" style="flex:1; text-align:center; display:inline-flex; align-items:center; justify-content:center; text-decoration:none;">📝 Договор</a>
          <a href="https://trustme.kz" target="_blank" rel="noopener" class="btn btn-tool btn-compact" style="flex:1; text-align:center; display:inline-flex; align-items:center; justify-content:center; text-decoration:none;">✍️ TrustMe</a>
          ${!isBlocked ? `<button class="btn btn-tool btn-tool-danger btn-compact" onclick="deleteLead('${id}')" title="Удалить заявку" style="flex:0 0 40px; display:inline-flex; align-items:center; justify-content:center; padding:0 !important; height:34px;">🗑</button>` : ''}
        </div>

        <!-- Stages Grid -->
        ${stageButtons}
      </div>
    </div>
  `;

  openDrawer('drawer-detail');
  renderLeadMiddleColumn(lead);
}

// ─── Сохранить редактирование лида
async function saveLeadEdit(id) {
  const lead = State.leads.find(l => l.id === id); if (!lead) return;
  const stageField = getStageFieldName(lead.fields);
  const empId  = document.getElementById('ei-manager')?.value;
  const emp    = empId ? State.employees.find(e => e.id === empId) : null;
  
  const consultDate = document.getElementById('ei-consult-date')?.value;
  const consultTime = document.getElementById('ei-consult-time')?.value.trim() || '';
  const assignDate = document.getElementById('ei-assign-date')?.value;

  const fields = {
    'Имя':     document.getElementById('ei-name')?.value.trim()   || '',
    'Телефон': document.getElementById('ei-phone')?.value.trim()  || '',
    'Источник':document.getElementById('ei-source')?.value.trim() || '',
    'Комментарий': document.getElementById('ei-comment')?.value.trim() || '',
    'Дата консультации': toDbDateFormat(consultDate),
    'Время консультации': consultTime,
  };
  
  let dbAssignDate = toDbDateFormat(assignDate);
  const currentStage = lead.fields[stageField] || 'Новая заявка';
  const stagesOrdered = FUNNEL_STAGES.map(s => s.key);
  const stageIdx = stagesOrdered.indexOf(currentStage);
  const consultIdx = stagesOrdered.indexOf('Консультация назначена');
  
  const hasManager = emp || lead.fields['Менеджер'];
  if (!dbAssignDate && stageIdx >= consultIdx && hasManager) {
    dbAssignDate = new Date().toLocaleDateString('ru-RU');
  }
  
  fields['Дата назначения'] = dbAssignDate;
  
  const budget = Number(document.getElementById('ei-budget')?.value);
  const paid = Number(document.getElementById('ei-paid')?.value);
  const consultDone = document.getElementById('ei-consult-done')?.checked ?? null;
  const nonTargetEl = document.getElementById('ei-nontarget-reason');
  const recordLink = document.getElementById('ei-record-link')?.value.trim() || null;
  const instagram  = document.getElementById('ei-instagram')?.value.trim() || null;
  if (budget) fields['Бюджет'] = budget; else fields['Бюджет'] = null;
  if (paid) fields['Оплата'] = paid; else fields['Оплата'] = null;
  fields['Менеджер'] = empId ? empId : [];
  if (consultDone !== null) fields['Консультация проведена'] = consultDone;
  if (nonTargetEl) fields['Причина: Не целевой'] = nonTargetEl.value || null;
  fields['Ссылка на запись'] = recordLink;
  fields['Instagram'] = instagram;

  // ─── Логируем изменения полей в историю
  const changedFieldsList = [];
  const fieldsToCheck = [
    { key: 'Имя',                    label: 'Имя' },
    { key: 'Телефон',                label: 'Телефон' },
    { key: 'Источник',               label: 'Источник' },
    { key: 'Бюджет',                 label: 'Бюджет' },
    { key: 'Оплата',                 label: 'Оплачено' },
    { key: 'Дата консультации',      label: 'Дата консультации' },
    { key: 'Время консультации',     label: 'Время консультации' },
    { key: 'Дата назначения',        label: 'Дата назначения' },
    { key: 'Ссылка на запись',       label: 'Ссылка на запись' },
    { key: 'Instagram',              label: 'Instagram' },
    { key: 'Причина: Не целевой',   label: 'Причина нецелевого' },
    { key: 'Консультация проведена', label: 'Консультация проведена' },
  ];
  for (const fld of fieldsToCheck) {
    const oldVal = String(lead.fields[fld.key] ?? '');
    const newVal = String(fields[fld.key] ?? '');
    if (oldVal !== newVal) changedFieldsList.push(`${fld.label}: «${oldVal || '—'}» → «${newVal || '—'}»`);
  }
  // Менеджер отдельно — сравниваем по имени
  const oldMgr = lead.fields['Менеджер'] || '';
  const newMgr = emp ? (emp.fields['Имя'] || '') : '';
  if (oldMgr !== newMgr) changedFieldsList.push(`Менеджер: «${oldMgr || '—'}» → «${newMgr || '—'}»`);

  if (changedFieldsList.length > 0) {
    const history = safeJsonParse(lead.fields['История'] || '[]');
    const currentUser = localStorage.getItem('crm_current_user') || 'Система';
    history.unshift({
      date: new Date().toLocaleString('ru-RU'),
      user: currentUser,
      type: 'edit_fields',
      details: 'Изменены поля: ' + changedFieldsList.join('; ')
    });
    fields['История'] = JSON.stringify(history);
  }

  try {
    await Airtable.update(CONFIG.TABLES.LEADS, id, fields);
    Object.assign(lead.fields, fields);
    if (emp) lead.fields['Менеджер'] = emp.fields['Имя'] || '';
    else lead.fields['Менеджер'] = '';
    if (budget) lead.fields['Бюджет'] = budget;
    else lead.fields['Бюджет'] = '';
    if (paid) lead.fields['Оплата'] = paid;
    else lead.fields['Оплата'] = '';
    if (consultDone !== null) lead.fields['Консультация проведена'] = consultDone;
    if (nonTargetEl) lead.fields['Причина: Не целевой'] = nonTargetEl.value || '';
    if (recordLink !== null) lead.fields['Ссылка на запись'] = recordLink;
    if (fields['История']) lead.fields['История'] = fields['История'];
    if (instagram !== null) lead.fields['Instagram'] = instagram || '';

    renderKanban(State.leads);
    renderLeadsStats();
    renderLeadMiddleColumn(lead);
    toast('Изменения сохранены ✓');
    syncGoogleCalendarEvent(lead).catch(console.error);
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

// ─── Удалить лид
async function deleteLead(id) {
  if (!confirm('Удалить заявку? Это действие нельзя отменить.')) return;
  const lead = State.leads.find(l => l.id === id);
  const eventId = lead?.fields['Google_Event_ID'];
  if (eventId) {
    fetch(`${CONFIG.APPS_SCRIPT_URL}?key=${CONFIG.API_KEY}&action=deleteEvent&eventId=${encodeURIComponent(eventId)}`).catch(console.error);
  }
  try {
    await Airtable.remove(CONFIG.TABLES.LEADS, id);
    State.leads = State.leads.filter(l => l.id !== id);
    closeDrawer('drawer-detail');
    renderKanban(State.leads);
    renderLeadsStats();
    toast('Заявка удалена');
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

// ─── Тоггл "Консультация проведена" (правая кнопка / checkbox)
async function toggleConsultDone(id) {
  const lead = State.leads.find(l => l.id === id);
  if (!lead) return;
  const newVal = !lead.fields['Консультация проведена'];
  lead.fields['Консультация проведена'] = newVal; // оптимистично
  renderKanban(State.leads);
  try {
    await Airtable.update(CONFIG.TABLES.LEADS, id, { 'Консультация проведена': newVal });
    toast(newVal ? '✅ Консультация проведена' : '☑️ Отметка снята');
  } catch(e) {
    lead.fields['Консультация проведена'] = !newVal; // откат
    renderKanban(State.leads);
    toast('Ошибка: ' + e.message, 'error');
  }
}

// ─── Шаблоны сообщений (WhatsApp)
function copyInstagram(val) {
  const text = val || document.getElementById('ei-instagram')?.value.trim();
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => toast('Instagram скопирован 📋')).catch(() => {
    // Fallback for older browsers
    const el = document.createElement('textarea');
    el.value = text; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    toast('Instagram скопирован 📋');
  });
}

function sendTemplate(templateIdx, phone, leadId) {
  const t = MSG_TEMPLATES[templateIdx];
  if (!t) return;
  if (!phone) { toast('Нет номера телефона', 'error'); return; }

  const lead = leadId ? State.leads.find(l => l.id === leadId) : null;
  const f = lead ? lead.fields : {};

  let text = t.text;
  // Подставляем имя клиента
  if (text.includes('{ИМЯ}')) {
    const name = (f['Имя'] || '').split(' ')[0] || 'Клиент';
    text = text.replace(/{ИМЯ}/g, name);
  }
  // Подставляем время консультации
  if (text.includes('{ВРЕМЯ}')) {
    const time = f['Время консультации'] || '—';
    text = text.replace(/{ВРЕМЯ}/g, time);
  }
  // Подставляем ссылку на запись встречи (календарь)
  if (text.includes('{ССЫЛКА}')) {
    const link = f['Ссылка на запись'] || '';
    if (link) {
      text = text.replace(/{ССЫЛКА}/g, link);
    } else {
      text = text.replace(/\n{ССЫЛКА}\n/g, '\n').replace(/{ССЫЛКА}/g, '(ссылка не указана)');
      toast('Ссылка на запись не указана в лиде', 'error');
      return;
    }
  }

  // Нормализуем номер: 8XXXXXXXXXX → 7XXXXXXXXXX
  const cleanPhone = phone.replace(/\D/g, '');
  const waPhone = cleanPhone.startsWith('8') ? '7' + cleanPhone.slice(1) : cleanPhone;

  const url = `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

// ─── Открыть модал продажи
async function openSaleModal(leadId) {
  const lead = State.leads.find(l => l.id === leadId); if (!lead) return;
  const f = lead.fields;

  document.getElementById('sale-lead-id').value = leadId;

  // ── Предзаполнение данных клиента из лида
  document.getElementById('sale-client-name').value      = getField(f, CONFIG.LEAD_FIELDS.name) || '';
  document.getElementById('sale-client-phone').value     = getField(f, CONFIG.LEAD_FIELDS.phone) || '';
  document.getElementById('sale-client-niche').value     = getField(f, CONFIG.LEAD_FIELDS.source) || '';
  document.getElementById('sale-client-instagram').value = '';

  // ── Финансовые поля
  document.getElementById('sale-amount').value = f['Бюджет'] || '';
  document.getElementById('sale-paid').value   = f['Оплата'] || f['Бюджет'] || '';
  document.getElementById('sale-fin-note').value = '';

  // ── Свернуть конструктор тарифов
  const builder = document.getElementById('tariff-builder-section');
  if (builder) builder.style.display = 'none';

  await populateTariffSelect('sale-tariff');
  await populateEmployeeSelect('sale-employee');

  // ── Автовыбор менеджера лида
  const managerName = f['Менеджер'];
  if (managerName) {
    const empEl = document.getElementById('sale-employee');
    const managerEmp = State.employees.find(e => e.fields['Имя'] === managerName);
    if (managerEmp && empEl) empEl.value = managerEmp.id;
  }

  if (window.populateFinanceAccountsSelect) {
    await window.populateFinanceAccountsSelect('sale-account');
  }

  // ── Заполняем категории дохода из финансов
  const catSel = document.getElementById('sale-fin-category');
  if (catSel) {
    if (State.financeCategories.length === 0) {
      try { State.financeCategories = await Airtable.getAll(CONFIG.TABLES.FINANCE_CATEGORIES); } catch(e) {}
    }
    const incCats = State.financeCategories.filter(c => c.fields['Отображать в доходах']);
    catSel.innerHTML = `<option value="">— авто по тарифу —</option>` +
      incCats.map(c => `<option value="${c.id}">${escHtml(c.fields['Наименование'] || '')}</option>`).join('');
  }

  openDrawer('drawer-sale');
}

// ─── Подтвердить продажу
async function confirmSale() {
  const btn    = document.getElementById('confirm-sale-btn');
  const leadId = document.getElementById('sale-lead-id').value;

  // ── Данные клиента из формы
  const clientName      = document.getElementById('sale-client-name')?.value.trim() || '';
  const clientPhone     = document.getElementById('sale-client-phone')?.value.trim() || '';
  const clientNiche     = document.getElementById('sale-client-niche')?.value.trim() || '';
  const clientInstagram = document.getElementById('sale-client-instagram')?.value.trim() || '';

  // ── Финансовые данные
  const amount     = Number(document.getElementById('sale-amount').value) || 0;
  const paidAmount = Number(document.getElementById('sale-paid').value) || 0;
  const tariffId   = document.getElementById('sale-tariff').value;
  const employeeId = document.getElementById('sale-employee').value;
  const accountId  = document.getElementById('sale-account')?.value || '';
  const finCatId   = document.getElementById('sale-fin-category')?.value || '';
  const finNote    = document.getElementById('sale-fin-note')?.value.trim() || '';

  if (!clientName) { toast('Введите имя клиента', 'error'); return; }
  if (!amount)     { toast('Введите сумму продажи', 'error'); return; }
  if (paidAmount > 0 && !accountId) { toast('Выберите счет для получения денег в кассу', 'error'); return; }

  const lead = State.leads.find(l => l.id === leadId); if (!lead) return;
  const f = lead.fields;
  const stageField = getStageFieldName(f);
  const emp    = State.employees.find(e => e.id === employeeId);
  const tariff = State.tariffs.find(t => t.id === tariffId);

  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
    // 1. Создаём / обновляем клиента
    const clientFields = {
      'Имя': clientName,
      'Телефон': clientPhone,
      'Ниша': clientNiche,
      'Статус': 'Активный',
      'Дата создания': new Date().toLocaleDateString('ru-RU'),
    };
    if (clientInstagram) clientFields['Email'] = clientInstagram; // поле Email используем под Instagram

    const clientRes = await Airtable.create(CONFIG.TABLES.CLIENTS, clientFields);
    const newClient = clientRes.records?.[0];

    // 2. Создаём сделку
    const dealName = `${clientName}${tariff ? ' — ' + (tariff.fields['Название'] || '') : ''}`;
    const dealFields = {
      'Название проекта': dealName,
      'Статус работы': 'В работе',
      'Сценариев': 0, 'Снято': 0, 'Смонтировано': 0, 'Сторис': 0,
      'Дата создания': new Date().toLocaleDateString('ru-RU'),
      'Стоимость заказа': amount,
      'Оплачено': paidAmount || 0,
      'Статус оплаты': paidAmount >= amount ? 'Оплачено' : (paidAmount > 0 ? 'Частично' : 'Не оплачено'),
    };
    if (newClient)  { dealFields['Клиент ID'] = newClient.id; dealFields['Клиент'] = clientName; }
    if (tariffId)   dealFields['Тариф ID']    = tariffId;
    if (employeeId) { dealFields['Сотрудник ID'] = employeeId; dealFields['Сотрудник'] = emp?.fields['Имя'] || ''; }

    const dealRes = await Airtable.create(CONFIG.TABLES.DEALS, dealFields);
    const newDeal = dealRes.records?.[0];

    // 3. Финансовая проводка (если указана сумма в кассу и счет)
    let newIncomeRecord = null;
    if (paidAmount > 0 && accountId) {
      try {
        // Определяем категорию: из формы, либо авто по тарифу, либо «Прочие»
        let resolvedCatId = finCatId || null;
        if (!resolvedCatId) {
          if (State.financeCategories.length === 0) {
            State.financeCategories = await Airtable.getAll(CONFIG.TABLES.FINANCE_CATEGORIES);
          }
          resolvedCatId = typeof matchTariffToCategory === 'function'
            ? matchTariffToCategory(tariff?.fields['Название'])
            : (State.financeCategories.find(c => (c.fields['Наименование'] || '').toLowerCase().includes('прочие'))?.id || null);
        }

        const todayISO = new Date().toISOString().substring(0, 10);
        const autoNote = finNote || `Продажа: ${dealName}`;
        const incomeFields = {
          'ID транзакции': 'INC_' + Date.now(),
          'Дата транзакции': todayISO,
          'Источник ID': [accountId],
          'Категория ID': resolvedCatId ? [resolvedCatId] : [],
          'Сумма': paidAmount,
          'Цена тарифа': amount,
          'Примечание': autoNote,
          'Кто добавил': emp?.fields['Имя'] || 'CRM',
          'Дата добавления': new Date().toLocaleString('ru-RU'),
          'Валюта': '₸',
          'Клиент ID': newClient ? [newClient.id] : [],
          'Менеджер ID': employeeId ? [employeeId] : [],
          'Заказ ID': newDeal ? [newDeal.id] : [],
        };

        const incRes = await Airtable.create(CONFIG.TABLES.FINANCE_INCOMES, incomeFields);
        newIncomeRecord = incRes.records?.[0];

        // Обновляем баланс счёта
        if (typeof adjustAccountBalance === 'function') {
          await adjustAccountBalance(accountId, paidAmount);
        }

        // Сразу отражаем в State.financeIncomes — Finance-страница обновится без перезагрузки
        if (newIncomeRecord) {
          // Нормализуем поля для State
          const normIncome = {
            id: newIncomeRecord.id,
            fields: {
              ...incomeFields,
              'Источник': State.financeAccounts.find(a => a.id === accountId)?.fields['Наименование'] || '',
              'Источник ID': accountId,
              'Категория': State.financeCategories.find(c => c.id === resolvedCatId)?.fields['Наименование'] || '',
              'Категория ID': resolvedCatId || '',
              'Клиент': clientName,
              'Менеджер': emp?.fields['Имя'] || '',
            }
          };
          State.financeIncomes.unshift(normIncome);
          // Обновляем отображение финансов если страница открыта
          if (State.currentPage === 'finance' && typeof renderFinanceDashboard === 'function') {
            renderFinanceDashboard();
          }
        }
      } catch (eFin) {
        console.error('Ошибка авто-проводки дохода:', eFin);
        toast('⚠️ Продажа сохранена, но финансовая запись не создана', 'error');
      }
    }

    // 4. Переводим лида в «Продано»
    const todayStr = new Date().toLocaleDateString('ru-RU');
    const soldStageObj = FUNNEL_STAGES.find(s => s.key === 'Продано');
    const soldStageId  = soldStageObj ? soldStageObj.id : null;
    await Airtable.update(CONFIG.TABLES.LEADS, leadId, {
      [stageField]: soldStageId || [],
      'Бюджет': amount,
      'Оплата': paidAmount,
      'Дата продажи': todayStr,
    });
    lead.fields[stageField] = 'Продано';
    lead.fields[stageField + ' ID'] = soldStageId ? String(soldStageId) : '';
    lead.fields['Бюджет']      = amount;
    lead.fields['Оплата']      = paidAmount;
    lead.fields['Дата продажи'] = todayStr;

    if (newClient) State.clients.unshift(newClient);
    if (newDeal)   State.deals.unshift(newDeal);

    closeDrawer('drawer-sale');
    closeDrawer('drawer-detail');
    renderKanban(State.leads);
    renderLeadsStats();

    const finMsg = paidAmount > 0 && accountId ? ` • +${paidAmount.toLocaleString('ru-RU')} ₸ в кассу` : '';
    toast(`✅ Продажа оформлена! Клиент и проект созданы${finMsg}`);
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
  finally { btn.innerHTML = '💰 Подтвердить продажу'; btn.disabled = false; }
}

const TARIFF_QTY_FIELDS = [
  { key: 'Кол-во: Сценарий Reels', label: 'Сценарии Reels' },
  { key: 'Кол-во: Съемка Reels', label: 'Съемка Reels (ч)' },
  { key: 'Кол-во: Монтаж Reels', label: 'Монтаж Reels' },
  { key: 'Кол-во: Сторителлингов сторис', label: 'Сторис' },
  { key: 'Кол-во: Тредс', label: 'Тредс' },
  { key: 'Кол-во: Телеграм чат', label: 'Телеграм пост' },
  { key: 'Кол-во: Вацап чат', label: 'Вацап пост' },
  { key: 'Кол-во: Чат бот', label: 'Чат бот' },
  { key: 'Кол-во: Мультипостинг', label: 'Мультипостинг' },
  { key: 'Кол-во: Таргет ФБ', label: 'Таргет ФБ' },
  { key: 'Кол-во: Карусели', label: 'Карусели' },
  { key: 'Кол-во: Упаковка', label: 'Упаковка' },
  { key: 'Кол-во: Консалтинг', label: 'Консалтинг' },
  { key: 'Кол-во: YouTube видео (Презентация)', label: 'YT Презентация' },
  { key: 'Кол-во: YouTube видео (Сценарий)', label: 'YT Сценарий' },
  { key: 'Кол-во: YouTube видео (Съемка)', label: 'YT Съемка (ч)' },
  { key: 'Кол-во: YouTube видео (Монтаж)', label: 'YT Монтаж' },
  { key: 'Кол-во: YouTube видео (Публикация)', label: 'YT Публикация' },
  { key: 'Кол-во: Бриф-разбор', label: 'Бриф-разбор' },
  { key: 'Кол-во: Постинг рилс и сторис', label: 'Постинг рилс/сторис' }
];

function onSaleTariffChange() {
  const select = document.getElementById('sale-tariff');
  if (!select) return;
  const tariffId = select.value;
  if (!tariffId) return;

  const tariff = State.tariffs.find(t => t.id === tariffId);
  if (tariff) {
    const cost = Number(tariff.fields['Стоимость']) || 0;
    document.getElementById('sale-amount').value = cost;
    document.getElementById('sale-paid').value = cost;
  }
}

function toggleTariffBuilder() {
  const section = document.getElementById('tariff-builder-section');
  if (!section) return;
  const isHidden = section.style.display === 'none';
  section.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    initTariffBuilder();
  }
}

async function initTariffBuilder() {
  const container = document.getElementById('custom-tariff-fields-list');
  if (!container) return;

  if (!State.services || State.services.length === 0) {
    try {
      container.innerHTML = `<div style="grid-column: span 2; text-align: center; color: var(--text2); padding: 10px 0;"><span class="spinner"></span> Загрузка услуг...</div>`;
      State.services = await Airtable.getAll(CONFIG.TABLES.SERVICES);
    } catch (e) {
      container.innerHTML = `<div style="grid-column: span 2; text-align: center; color: var(--danger); padding: 10px 0;">⚠️ Ошибка: ${escHtml(e.message)}</div>`;
      return;
    }
  }

  const leadId = document.getElementById('sale-lead-id').value;
  const lead = State.leads.find(l => l.id === leadId);
  const leadName = lead ? (getField(lead.fields, CONFIG.LEAD_FIELDS.name) || '') : '';
  const nameInput = document.getElementById('custom-tariff-name');
  if (nameInput && !nameInput.value) {
    nameInput.value = `Кастомный тариф — ${leadName}`;
  }

  container.innerHTML = TARIFF_QTY_FIELDS.map(f => {
    return `
      <div class="form-group" style="margin: 0; display: flex; flex-direction: column; gap: 4px;">
        <label class="form-label" style="font-size: 11px; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(f.label)}">${escHtml(f.label)}</label>
        <input type="number" class="form-input compact-input custom-tariff-qty" data-field="${escHtml(f.key)}" placeholder="0" style="padding: 6px 10px !important; font-size: 12px !important; height: 28px !important;" oninput="recalcCustomTariffCost()"/>
      </div>
    `;
  }).join('');
}

function recalcCustomTariffCost() {
  let totalCost = 0;
  
  const serviceLookup = {};
  if (State.services) {
    State.services.forEach(s => {
      serviceLookup[s.fields["Название услуги"]] = {
        sale: Number(s.fields["Цена продажи"]) || 0,
        sebes: Number(s.fields["Себестоимость"]) || 0
      };
    });
  }

  const qtyInputs = document.querySelectorAll('.custom-tariff-qty');
  qtyInputs.forEach(input => {
    const qty = Number(input.value) || 0;
    if (qty <= 0) return;

    const fieldKey = input.dataset.field;
    const serviceName = findServiceName(fieldKey);
    const service = serviceLookup[serviceName];

    if (service) {
      const pricePerUnit = service.sale || service.sebes || 0;
      let itemCost = 0;

      if (serviceName === "Съемка Reels") {
        const estimatedHours = qty / 10;
        itemCost = estimatedHours * (serviceLookup["Съемка Reels"]?.sebes || 10000);
      } else {
        itemCost = qty * pricePerUnit;
      }
      
      totalCost += itemCost;
    }
  });

  const costInput = document.getElementById('custom-tariff-cost');
  if (costInput) {
    costInput.value = Math.round(totalCost);
  }
}

async function saveCustomTariff() {
  const btn = document.getElementById('create-custom-tariff-btn');
  const nameInput = document.getElementById('custom-tariff-name');
  const costInput = document.getElementById('custom-tariff-cost');
  
  if (!nameInput || !nameInput.value.trim()) {
    toast('Введите название тарифа', 'error');
    return;
  }
  
  const name = nameInput.value.trim();
  const cost = Number(costInput ? costInput.value : 0) || 0;
  
  btn.innerHTML = `<span class="spinner"></span>`;
  btn.disabled = true;

  try {
    const fields = {
      'Название': name,
      'Стоимость': cost
    };

    const qtyInputs = document.querySelectorAll('.custom-tariff-qty');
    qtyInputs.forEach(input => {
      const qty = Number(input.value) || 0;
      if (qty > 0) {
        fields[input.dataset.field] = qty;
      }
    });

    const res = await Airtable.create(CONFIG.TABLES.TARIFFS, fields);
    const newTariff = res.records?.[0];

    if (newTariff) {
      State.tariffs.push(newTariff);
      
      await populateTariffSelect('sale-tariff');
      const select = document.getElementById('sale-tariff');
      if (select) {
        select.value = newTariff.id;
      }
      
      document.getElementById('sale-amount').value = cost;
      document.getElementById('sale-paid').value = cost;

      toast('Кастомный тариф успешно создан и выбран ✓');
      toggleTariffBuilder();
      
      nameInput.value = '';
      if (costInput) costInput.value = '';
    } else {
      throw new Error('Не удалось получить созданный тариф от сервера');
    }
  } catch (e) {
    toast(`Ошибка создания тарифа: ${e.message}`, 'error');
    console.error(e);
  } finally {
    btn.innerHTML = `💾 Создать тариф`;
    btn.disabled = false;
  }
}

function findServiceName(key) {
  const normKey = key.toLowerCase().replace(/ё/g, 'е').trim();
  
  if (normKey.includes("сценарий")) return "Сценарий Reels";
  if (normKey.includes("съемка reels") || normKey.includes("съемка")) return "Съемка Reels";
  if (normKey.includes("монтаж reels") || normKey.includes("монтаж")) return "Монтаж Reels";
  if (normKey.includes("сторис")) return "1 день сторителлинг сторис";
  if (normKey.includes("тредс")) return "1 день тредс";
  if (normKey.includes("телеграм")) return "1 пост Телеграм";
  if (normKey.includes("вацап")) return "1 пост Вацап чат";
  if (normKey.includes("чат бот")) return "Чат бот настройка";
  if (normKey.includes("упаковка")) return "Упаковка настройка";
  if (normKey.includes("мультипостинг")) return "Мультипостинг настройка";
  if (normKey.includes("таргет")) return "Таргет ФБ настройка";
  if (normKey.includes("карусели")) return "Карусели 1 пост";
  if (normKey.includes("консалтинг")) return "Консалтинг";
  if (normKey.includes("бриф")) return "Бриф-разбор";
  
  if (normKey.includes("презентация")) return "YouTube видео (Презентация)";
  if (normKey.includes("сценарий youtube")) return "YouTube видео (Сценарий)";
  if (normKey.includes("съемка youtube")) return "YouTube видео (Съемка)";
  if (normKey.includes("монтаж youtube")) return "YouTube видео (Монтаж)";
  if (normKey.includes("публикация youtube")) return "YouTube видео (Публикация)";

  return key;
}

// ─── Открыть модал возврата
function openRefundModal(leadId) {
  const lead = State.leads.find(l => l.id === leadId); if (!lead) return;
  const f = lead.fields;
  document.getElementById('refund-lead-id').value = leadId;
  document.getElementById('refund-lead-info').innerHTML = `
    <div style="font-weight:600;font-size:15px">${escHtml(getField(f,CONFIG.LEAD_FIELDS.name)||'—')}</div>
    <div style="font-size:13px;color:var(--text2);margin-top:4px">💰 ${Number(f['Бюджет']||0).toLocaleString('ru-RU')} ₸</div>`;
  openDrawer('drawer-refund');
}

// ─── Подтвердить возврат
async function confirmRefund() {
  const btn    = document.getElementById('confirm-refund-btn');
  const leadId = document.getElementById('refund-lead-id').value;
  const lead   = State.leads.find(l => l.id === leadId); if (!lead) return;
  const stageField = getStageFieldName(lead.fields);
  const leadName   = getField(lead.fields, CONFIG.LEAD_FIELDS.name);

  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
    // Отмечаем связанную сделку как «Отменена (Возврат)»
    const relatedDeal = State.deals.find(d => d.fields['Клиент'] === leadName);
    if (relatedDeal) {
      await Airtable.update(CONFIG.TABLES.DEALS, relatedDeal.id, { 'Статус работы': 'Отменён' });
      relatedDeal.fields['Статус работы'] = 'Отменён';
    }
    const todayStr = new Date().toLocaleDateString('ru-RU');
    const refundStageObj = FUNNEL_STAGES.find(s => s.key === 'Возвраты');
    const refundStageId = refundStageObj ? refundStageObj.id : null;
    await Airtable.update(CONFIG.TABLES.LEADS, leadId, {
      [stageField]: refundStageId || [],
      'Дата возврата': todayStr
    });
    lead.fields[stageField] = 'Возвраты';
    lead.fields[stageField + ' ID'] = refundStageId ? String(refundStageId) : '';
    lead.fields['Дата возврата'] = todayStr;

    closeDrawer('drawer-refund');
    closeDrawer('drawer-detail');
    renderKanban(State.leads);
    toast('Возврат оформлен');
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
  finally { btn.innerHTML = 'Подтвердить возврат'; btn.disabled = false; }
}

async function saveLead() {
  const btn = document.getElementById('save-lead-btn');
  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
    const name = document.getElementById('l-name').value.trim();
    if (!name) { toast('Введите имя', 'error'); return; }

    const stageSelect = document.getElementById('l-stage');
    const stageId   = parseInt(stageSelect.value, 10);
    const stageName = stageSelect.options[stageSelect.selectedIndex]?.text || '';

    const empId      = document.getElementById('l-manager')?.value || '';
    const emp        = empId ? State.employees.find(e => e.id === empId) : null;
    const consultDate = document.getElementById('l-consult-date')?.value || '';
    const consultTime = document.getElementById('l-consult-time')?.value || '';

    const apiFields = {
      'Имя':       name,
      'Телефон':   document.getElementById('l-phone').value.trim(),
      'Instagram': document.getElementById('l-instagram')?.value.trim() || '',
      'Источник':  document.getElementById('l-source').value.trim(),
      'Комментарий': document.getElementById('l-comment').value.trim(),
      'Воронка':   stageId,
      'Дата':      new Date().toLocaleDateString('ru-RU'),
    };

    const budget = Number(document.getElementById('l-budget')?.value);
    if (budget) apiFields['Бюджет'] = budget;
    if (empId)  apiFields['Менеджер'] = empId;
    if (consultDate) {
      apiFields['Дата консультации'] = consultDate;
      if (consultTime) apiFields['Время консультации'] = consultTime;
      // Автоставим дату назначения если этап >= Консультация назначена
      const stagesOrdered = FUNNEL_STAGES.map(s => s.key);
      const stageIdx = stagesOrdered.indexOf(stageName);
      const consultIdx = stagesOrdered.indexOf('Консультация назначена');
      if (stageIdx >= consultIdx) {
        apiFields['Дата назначения'] = new Date().toLocaleDateString('ru-RU');
      }
    }

    const res = await Airtable.create(CONFIG.TABLES.LEADS, apiFields);

    // Нормализуем для local State
    const normFields = {
      ...apiFields,
      'Воронка': stageName,
      'Воронка ID': String(stageId),
      'Менеджер': emp?.fields['Имя'] || '',
    };
    const newRec = res.records?.[0] || { id: 'tmp_' + Date.now(), fields: normFields };
    State.leads.unshift(newRec);

    closeDrawer('drawer-lead');
    toast('🎯 Лид добавлен ✓');

    // Сбрасываем форму
    ['l-name','l-phone','l-instagram','l-source','l-budget','l-comment','l-consult-date','l-consult-time']
      .forEach(i => { const el = document.getElementById(i); if(el) el.value = ''; });
    const mgSel = document.getElementById('l-manager');
    if (mgSel) mgSel.value = '';

    renderLeadsStats();
    renderKanban(State.leads);
  } catch(e) { toast(e.message, 'error'); }
  finally { btn.innerHTML = '💾 Сохранить лид'; btn.disabled = false; }
}

// ════════════════════════════
// КЛИЕНТЫ
// ════════════════════════════
async function loadClients(query='') {
  if (State.clients.length > 0) renderClients(query);
  else spinner('clients-list');
  try {
    State.clients = await Airtable.getAll(CONFIG.TABLES.CLIENTS);
    renderClients(query);
  } catch(e) {
    if (!State.clients.length) document.getElementById('clients-list').innerHTML=`<div class="empty"><p>Ошибка: ${e.message}</p></div>`;
    else toast('Ошибка обновления','error');
  }
}
function renderClients(query='') {
  const list = State.clients.filter(c=>!query||(c.fields['Имя']||'').toLowerCase().includes(query.toLowerCase()));
  document.getElementById('clients-list').innerHTML = list.length
    ? list.map(c=>`<div class="card" onclick="openClientDetail('${c.id}')">
        <div class="card-row"><div><div class="card-title">${escHtml(c.fields['Имя']||'—')}</div>
        <div class="card-sub">${escHtml(c.fields['Ниша']||'')}${c.fields['Телефон']?' · '+c.fields['Телефон']:''}</div></div>
        ${statusBadge(c.fields['Статус'])}</div></div>`).join('')
    : `<div class="empty"><div class="icon">👥</div><p>Клиентов пока нет</p></div>`;
}
async function saveClient() {
  const btn=document.getElementById('save-client-btn'); btn.innerHTML=`<span class="spinner"></span>`; btn.disabled=true;
  try {
    const fields={'Имя':document.getElementById('c-name').value.trim(),'Ниша':document.getElementById('c-niche').value.trim(),'Телефон':document.getElementById('c-phone').value.trim(),'Email':document.getElementById('c-email').value.trim(),'Статус':document.getElementById('c-status').value,'Дата создания':new Date().toLocaleDateString('ru-RU')};
    if(!fields['Имя']){toast('Введите имя клиента','error');return;}
    const res=await Airtable.create(CONFIG.TABLES.CLIENTS,fields);
    const newRec=res.records?.[0]||{id:'tmp_'+Date.now(),fields};
    State.clients.unshift(newRec);
    closeDrawer('drawer-client'); toast('Клиент добавлен ✓'); renderClients();
  } catch(e){toast(e.message,'error');} finally{btn.innerHTML='Сохранить';btn.disabled=false;}
}
function openClientDetail(id) {
  const c=State.clients.find(x=>x.id===id); if(!c)return;
  const f=c.fields; const phone=(f['Телефон']||'').replace(/\D/g,'');
  document.getElementById('detail-content').innerHTML=`
    <div class="drawer-handle"></div>
    <div class="drawer-title">👤 ${escHtml(f['Имя']||'Клиент')}</div>
    <div class="card">
      <div class="form-group"><div class="form-label">Ниша</div><div>${escHtml(f['Ниша']||'—')}</div></div>
      <div class="form-group"><div class="form-label">Телефон</div><div>${escHtml(f['Телефон']||'—')}</div></div>
      <div class="form-group"><div class="form-label">Email</div><div>${escHtml(f['Email']||'—')}</div></div>
      <div class="form-group"><div class="form-label">Статус</div>${statusBadge(f['Статус'])}</div>
    </div>
    ${phone?`<a href="https://wa.me/${phone}" target="_blank" rel="noopener" class="btn btn-primary" style="display:block;text-align:center;text-decoration:none;margin-top:12px">📱 WhatsApp</a>`:''}`;
  openDrawer('drawer-detail');
}

// ════════════════════════════
// СДЕЛКИ
// ════════════════════════════
async function loadDeals(query='') {
  if (State.deals.length > 0) renderDeals(query);
  else spinner('deals-list');
  try {
    const [deals,clients,tariffs]=await Promise.all([
      Airtable.getAll(CONFIG.TABLES.DEALS),
      Airtable.getAll(CONFIG.TABLES.CLIENTS),
      Airtable.getAll(CONFIG.TABLES.TARIFFS)
    ]);
    State.deals=deals; State.clients=clients; State.tariffs=tariffs; renderDeals(query);
  } catch(e) {
    if (!State.deals.length) document.getElementById('deals-list').innerHTML=`<div class="empty"><p>Ошибка загрузки проектов: ${e.message}</p></div>`;
    else toast('Ошибка обновления','error');
  }
}
function renderDeals(query='') {
  const q = (query || '').toLowerCase();
  const list = State.deals.filter(d => {
    if (!q) return true;
    const name   = (d.fields['Название проекта'] || d.fields['Название сделки'] || '').toLowerCase();
    const client = (d.fields['Клиент'] || '').toLowerCase();
    return name.includes(q) || client.includes(q);
  });
  document.getElementById('deals-list').innerHTML = list.length
    ? list.map(d => {
        const name       = d.fields['Название проекта'] || d.fields['Название сделки'] || 'Без названия';
        const client     = d.fields['Клиент'] || '—';
        const tariff     = d.fields['Тариф'] || '';
        const workStatus = d.fields['Статус работы'] || d.fields['Статус сделки'] || '';
        const payStatus  = d.fields['Статус оплаты'] || '';
        const amount     = Number(d.fields['Стоимость заказа'] || 0);
        const paid       = Number(d.fields['Оплачено'] || 0);
        const debt       = amount - paid;
        const amountStr  = amount ? amount.toLocaleString('ru-RU') + ' ₸' : '';
        const debtStr    = (amount && debt > 0) ? `<span style="color:#f59e0b; font-size:11px;">долг: ${debt.toLocaleString('ru-RU')} ₸</span>` : '';
        return `<div class="card" onclick="openDealDetail('${d.id}')">
          <div class="card-row">
            <div style="flex:1; min-width:0;">
              <div class="card-title">${escHtml(name)}</div>
              <div class="card-sub">${escHtml(client)}${tariff ? ' · ' + escHtml(tariff) : ''}${amountStr ? ' · 💰 ' + amountStr : ''}</div>
              ${debtStr ? `<div style="margin-top:2px;">${debtStr}</div>` : ''}
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0; margin-left:8px;">
              ${workStatus ? statusBadge(workStatus) : ''}
              ${payStatus  ? statusBadge(payStatus)  : ''}
            </div>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty"><div class="icon">📁</div><p>Проектов пока нет</p></div>`;
}
async function saveDeal() {
  const btn = document.getElementById('save-deal-btn');
  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
    const clientId   = document.getElementById('d-client')?.value    || '';
    const tariffId   = document.getElementById('d-tariff')?.value    || '';
    const employeeId = document.getElementById('d-employee')?.value  || '';
    const client     = clientId   ? State.clients.find(c => c.id === clientId)    : null;
    const tariff     = tariffId   ? State.tariffs.find(t => t.id === tariffId)    : null;
    const emp        = employeeId ? State.employees.find(e => e.id === employeeId) : null;

    const name = document.getElementById('d-name')?.value.trim() || '';
    if (!name) { toast('Введите название проекта', 'error'); return; }

    const fields = {
      'Название проекта': name,
      'Статус работы':    document.getElementById('d-status')?.value || 'В работе',
      'Дата создания':    new Date().toLocaleDateString('ru-RU'),
    };

    const amount = Number(document.getElementById('d-amount')?.value) || 0;
    if (amount) fields['Стоимость заказа'] = amount;

    const dateStart = document.getElementById('d-date-start')?.value;
    if (dateStart) fields['Дата начала'] = dateStart;

    const comment = document.getElementById('d-comment')?.value.trim() || '';
    if (comment) fields['Комментарий'] = comment;

    if (client)   { fields['Клиент ID']    = clientId;   fields['Клиент']    = client.fields['Имя']      || ''; }
    if (tariff)   { fields['Тариф ID']     = tariffId;   fields['Тариф']     = tariff.fields['Название'] || ''; }
    if (emp)      { fields['Сотрудник ID'] = employeeId; fields['Сотрудник'] = emp.fields['Имя']         || ''; }

    const res = await Airtable.create(CONFIG.TABLES.DEALS, fields);
    const newRec = res.records?.[0] || { id: 'tmp_' + Date.now(), fields };
    State.deals.unshift(newRec);
    closeDrawer('drawer-deal');
    toast('Проект добавлен ✓');
    renderDeals();
    ['d-name','d-amount','d-date-start','d-comment'].forEach(elId => {
      const el = document.getElementById(elId); if (el) el.value = '';
    });
  } catch(e) { toast(e.message, 'error'); }
  finally { btn.innerHTML = '💾 Сохранить проект'; btn.disabled = false; }
}
async function openDealDetail(id) {
  const d = State.deals.find(x => x.id === id);
  if (!d) return;
  const f = d.fields;

  if (State.employees.length === 0) State.employees = await Airtable.getAll(CONFIG.TABLES.EMPLOYEES);
  if (State.tariffs.length   === 0) State.tariffs   = await Airtable.getAll(CONFIG.TABLES.TARIFFS);
  if (State.clients.length   === 0) State.clients   = await Airtable.getAll(CONFIG.TABLES.CLIENTS);

  const name       = f['Название проекта'] || f['Название сделки'] || 'Проект';
  const workStatus = f['Статус работы']    || f['Статус сделки']   || 'В работе';
  const payStatus  = f['Статус оплаты']    || '';
  const amount     = Number(f['Стоимость заказа'] || 0);
  const paid       = Number(f['Оплачено'] || 0);
  const debt       = amount - paid;

  const empOptions  = `<option value="">— не назначен —</option>` +
    State.employees.map(e => `<option value="${e.id}" ${f['Сотрудник'] === e.fields['Имя'] ? 'selected' : ''}>${escHtml(e.fields['Имя']||'')}</option>`).join('');
  const projOptions = `<option value="">— не назначен —</option>` +
    State.employees.map(e => `<option value="${e.id}" ${f['Проджект']  === e.fields['Имя'] ? 'selected' : ''}>${escHtml(e.fields['Имя']||'')}</option>`).join('');
  const tariffOptions = `<option value="">— не выбран —</option>` +
    State.tariffs.map(t => `<option value="${t.id}" ${f['Тариф']     === t.fields['Название'] ? 'selected' : ''}>${escHtml(t.fields['Название']||'')}</option>`).join('');
  const clientOptions = `<option value="">— не выбран —</option>` +
    State.clients.map(c => `<option value="${c.id}" ${f['Клиент']    === c.fields['Имя'] ? 'selected' : ''}>${escHtml(c.fields['Имя']||'')}</option>`).join('');

  document.getElementById('detail-content').innerHTML = `
    <div class="drawer-handle"></div>
    <div class="drawer-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:12px; margin-bottom:12px; flex-wrap:wrap; gap:10px; padding-right:40px;">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <h3 class="drawer-title" style="margin:0; font-size:18px; font-weight:800; color:#fff;">📁 ${escHtml(name)}</h3>
        <div>${workStatus ? statusBadge(workStatus) : ''}${payStatus ? ' ' + statusBadge(payStatus) : ''}</div>
      </div>
      <button class="btn btn-save-compact" onclick="saveDealEdit('${id}')">💾 Сохранить</button>
    </div>

    <div class="drawer-main-layout">
      <div class="drawer-left-col">
        <div class="grid-fields">
          <div class="form-group form-group-full">
            <label class="form-label">Название проекта</label>
            <input class="form-input compact-input" id="dp-name" value="${escHtml(name)}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Клиент</label>
            <select class="form-select compact-input" id="dp-client">${clientOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Тариф</label>
            <select class="form-select compact-input" id="dp-tariff">${tariffOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Ответственный</label>
            <select class="form-select compact-input" id="dp-employee">${empOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Проджект</label>
            <select class="form-select compact-input" id="dp-project">${projOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Статус работы</label>
            <select class="form-select compact-input" id="dp-work-status">
              <option value="В работе"  ${workStatus === 'В работе'  ? 'selected' : ''}>В работе</option>
              <option value="На паузе"  ${workStatus === 'На паузе'  ? 'selected' : ''}>На паузе</option>
              <option value="Готово"    ${workStatus === 'Готово'    ? 'selected' : ''}>Готово</option>
              <option value="Отменён"   ${workStatus === 'Отменён'   ? 'selected' : ''}>Отменён</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">📅 Дата начала</label>
            <input class="form-input compact-input" id="dp-date-start" type="date" onclick="try{this.showPicker()}catch(e){}" value="${toInputDateFormat(f['Дата начала'])}"/>
          </div>
          <div class="form-group">
            <label class="form-label">📅 Срок (план)</label>
            <input class="form-input compact-input" id="dp-date-plan" type="date" onclick="try{this.showPicker()}catch(e){}" value="${toInputDateFormat(f['Сроки заказа План'])}"/>
          </div>
          <div class="form-group">
            <label class="form-label">📅 Срок (факт)</label>
            <input class="form-input compact-input" id="dp-date-fact" type="date" onclick="try{this.showPicker()}catch(e){}" value="${toInputDateFormat(f['Сроки заказа Факт'])}"/>
          </div>
          <div class="form-group">
            <label class="form-label">📅 Завершение</label>
            <input class="form-input compact-input" id="dp-date-end" type="date" onclick="try{this.showPicker()}catch(e){}" value="${toInputDateFormat(f['Дата завершения'])}"/>
          </div>
          <div class="form-group form-group-full">
            <label class="form-label">🔗 Бриф</label>
            <input class="form-input compact-input" id="dp-brief" type="url" placeholder="https://..." value="${escHtml(f['Ссылка на Бриф']||'')}"/>
          </div>
          <div class="form-group form-group-full">
            <label class="form-label">📝 Сценарии (ссылка)</label>
            <input class="form-input compact-input" id="dp-scripts-link" type="url" placeholder="https://..." value="${escHtml(f['Ссылка на сценарии']||'')}"/>
          </div>
          <div class="form-group form-group-full">
            <label class="form-label">📸 Instagram</label>
            <input class="form-input compact-input" id="dp-instagram" type="text" placeholder="Никнейм или ссылка" value="${escHtml(f['Ссылка на Инстаграм']||'')}"/>
          </div>
          <div class="form-group form-group-full" style="margin-bottom:0">
            <label class="form-label">Комментарий</label>
            <textarea class="form-input form-textarea compact-input" id="dp-comment">${escHtml(f['Комментарий']||'')}</textarea>
          </div>
        </div>
      </div>

      <div class="drawer-right-col">
        <div class="section-title" style="margin-top:0">💰 Финансы</div>
        <div class="card" style="margin-bottom:12px; padding:12px 14px;">
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Стоимость (₸)</label>
            <input class="form-input compact-input" id="dp-amount" type="number" placeholder="0" value="${amount || ''}"/>
          </div>
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Оплачено (₸)</label>
            <input class="form-input compact-input" id="dp-paid" type="number" placeholder="0" value="${paid || ''}"/>
          </div>
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Статус оплаты</label>
            <select class="form-select compact-input" id="dp-pay-status">
              <option value="Не оплачено" ${!payStatus || payStatus === 'Не оплачено' ? 'selected' : ''}>Не оплачено</option>
              <option value="Частично"    ${payStatus === 'Частично'  ? 'selected' : ''}>Частично</option>
              <option value="Оплачено"    ${payStatus === 'Оплачено'  ? 'selected' : ''}>Оплачено</option>
            </select>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:12px; color:var(--text2);">Остаток долга:</span>
            <span style="font-weight:800; font-size:14px; color:${debt > 0 ? '#f59e0b' : '#22c55e'}">${debt.toLocaleString('ru-RU')} ₸</span>
          </div>
        </div>

        <div class="section-title">📊 Производство</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">Сценариев</label>
            <input class="form-input compact-input" id="dp-scripts" type="number" placeholder="0" value="${f['Сценариев'] || ''}"/>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Снято</label>
            <input class="form-input compact-input" id="dp-shots" type="number" placeholder="0" value="${f['Снято'] || ''}"/>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Смонтировано</label>
            <input class="form-input compact-input" id="dp-edited" type="number" placeholder="0" value="${f['Смонтировано'] || ''}"/>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Сторис</label>
            <input class="form-input compact-input" id="dp-stories" type="number" placeholder="0" value="${f['Сторис'] || ''}"/>
          </div>
        </div>
      </div>
    </div>
  `;

  openDrawer('drawer-detail');
}

async function saveDealEdit(id) {
  const d = State.deals.find(x => x.id === id);
  if (!d) return;

  const clientId = document.getElementById('dp-client')?.value   || '';
  const tariffId = document.getElementById('dp-tariff')?.value   || '';
  const empId    = document.getElementById('dp-employee')?.value  || '';
  const projId   = document.getElementById('dp-project')?.value  || '';
  const client   = clientId ? State.clients.find(c => c.id === clientId)   : null;
  const tariff   = tariffId ? State.tariffs.find(t => t.id === tariffId)   : null;
  const emp      = empId    ? State.employees.find(e => e.id === empId)    : null;
  const proj     = projId   ? State.employees.find(e => e.id === projId)   : null;

  const amount = Number(document.getElementById('dp-amount')?.value) || 0;
  const paid   = Number(document.getElementById('dp-paid')?.value)   || 0;

  const fields = {
    'Название проекта':    document.getElementById('dp-name')?.value.trim() || '',
    'Статус работы':       document.getElementById('dp-work-status')?.value || 'В работе',
    'Статус оплаты':       document.getElementById('dp-pay-status')?.value  || 'Не оплачено',
    'Стоимость заказа':    amount || null,
    'Оплачено':            paid   || null,
    'Дата начала':         document.getElementById('dp-date-start')?.value  || null,
    'Сроки заказа План':   document.getElementById('dp-date-plan')?.value   || null,
    'Сроки заказа Факт':   document.getElementById('dp-date-fact')?.value   || null,
    'Дата завершения':     document.getElementById('dp-date-end')?.value    || null,
    'Ссылка на Бриф':      document.getElementById('dp-brief')?.value.trim()        || null,
    'Ссылка на сценарии':  document.getElementById('dp-scripts-link')?.value.trim() || null,
    'Ссылка на Инстаграм': document.getElementById('dp-instagram')?.value.trim()    || null,
    'Комментарий':         document.getElementById('dp-comment')?.value.trim()       || '',
    'Сценариев':    Number(document.getElementById('dp-scripts')?.value) || 0,
    'Снято':        Number(document.getElementById('dp-shots')?.value)   || 0,
    'Смонтировано': Number(document.getElementById('dp-edited')?.value)  || 0,
    'Сторис':       Number(document.getElementById('dp-stories')?.value) || 0,
  };

  if (clientId) { fields['Клиент ID']    = clientId; fields['Клиент']    = client?.fields['Имя']       || ''; }
  if (tariffId) { fields['Тариф ID']     = tariffId; fields['Тариф']     = tariff?.fields['Название']  || ''; }
  if (empId)    { fields['Сотрудник ID'] = empId;    fields['Сотрудник'] = emp?.fields['Имя']          || ''; }
  if (projId)   { fields['Проджект ID']  = projId;   fields['Проджект']  = proj?.fields['Имя']         || ''; }

  try {
    await Airtable.update(CONFIG.TABLES.DEALS, id, fields);
    Object.assign(d.fields, fields);
    renderDeals();
    closeDrawer('drawer-detail');
    toast('Проект сохранён ✓');
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

// ════════════════════════════
// ОПЕРАЦИИ
// ════════════════════════════
async function loadOperations() {
  if (State.operations.length > 0) renderOperations();
  else spinner('operations-list');
  try {
    const [ops,deals,employees]=await Promise.all([Airtable.getAll(CONFIG.TABLES.OPERATIONS),Airtable.getAll(CONFIG.TABLES.DEALS),Airtable.getAll(CONFIG.TABLES.EMPLOYEES)]);
    State.operations=ops; State.deals=deals; State.employees=employees; renderOperations();
  } catch(e) {
    if (!State.operations.length) document.getElementById('operations-list').innerHTML=`<div class="empty"><p>Ошибка: ${e.message}</p></div>`;
    else toast('Ошибка обновления','error');
  }
}
function renderOperations() {
  const list=State.operations;
  document.getElementById('operations-list').innerHTML=list.length
    ?list.map(o=>`<div class="card">
        <div class="card-row"><div>
          <div class="card-title">${escHtml(o.fields['Тип операции']||'Операция')}</div>
          <div class="card-sub">${o.fields['Проект']?'📁 '+escHtml(o.fields['Проект']):''}${o.fields['Исполнитель']?' · 👤 '+escHtml(o.fields['Исполнитель']):''}</div>
          <div class="card-sub">${o.fields['Кол-во']?'Кол-во: '+o.fields['Кол-во']:''}${o.fields['Кол-во часов']?' · Часов: '+o.fields['Кол-во часов']:''}${o.fields['Дата']?' · '+o.fields['Дата']:''}</div>
        </div>${statusBadge(o.fields['Статус оплаты'])}</div></div>`).join('')
    :`<div class="empty"><div class="icon">📋</div><p>Операций пока нет</p></div>`;
}
async function saveOperation() {
  const btn=document.getElementById('save-op-btn'); btn.innerHTML=`<span class="spinner"></span>`; btn.disabled=true;
  try {
    const dealId=document.getElementById('op-deal').value;
    const empId=document.getElementById('op-employee').value;
    const deal=State.deals.find(d=>d.id===dealId); const emp=State.employees.find(e=>e.id===empId);
    const fields={'Тип операции':document.getElementById('op-type').value,'Кол-во':Number(document.getElementById('op-qty').value)||0,'Кол-во часов':Number(document.getElementById('op-hours').value)||0,'Статус оплаты':document.getElementById('op-pay').value,'Дата':new Date().toLocaleDateString('ru-RU')};
    if(deal){fields['Проект ID']=dealId;fields['Проект']=deal.fields['Название проекта']||deal.fields['Название сделки']||'';}
    if(emp){fields['Исполнитель ID']=empId;fields['Исполнитель']=emp.fields['Имя']||'';}
    if(!fields['Тип операции']){toast('Выберите тип операции','error');return;}
    const res=await Airtable.create(CONFIG.TABLES.OPERATIONS,fields);
    const newRec=res.records?.[0]||{id:'tmp_'+Date.now(),fields};
    State.operations.unshift(newRec);
    closeDrawer('drawer-operation'); toast('Операция добавлена ✓'); renderOperations();
    ['op-qty', 'op-hours'].forEach(id => {
      document.getElementById(id).value = '';
    });
  } catch(e){toast(e.message,'error');} finally{btn.innerHTML='Сохранить';btn.disabled=false;}
}
async function populateDealSelect(selectId) {
  const sel=document.getElementById(selectId);
  if(State.deals.length===0)State.deals=await Airtable.getAll(CONFIG.TABLES.DEALS);
  sel.innerHTML=`<option value="">Выберите проект</option>`+State.deals.map(d=>`<option value="${d.id}">${escHtml(d.fields['Название проекта']||d.fields['Название сделки']||'Без названия')}</option>`).join('');
}
async function populateClientSelect() {
  if(State.clients.length===0)State.clients=await Airtable.getAll(CONFIG.TABLES.CLIENTS);
  const sel=document.getElementById('d-client');
  sel.innerHTML=`<option value="">Выберите клиента</option>`+State.clients.map(c=>`<option value="${c.id}">${escHtml(c.fields['Имя']||'—')}</option>`).join('');
}
async function populateEmployeeSelect(selectId = 'op-employee') {
  if(State.employees.length===0)State.employees=await Airtable.getAll(CONFIG.TABLES.EMPLOYEES);
  const sel=document.getElementById(selectId);
  if (sel) {
    sel.innerHTML=`<option value="">Выберите сотрудника</option>`+State.employees.map(e=>`<option value="${e.id}">${escHtml(e.fields['Имя']||'—')}</option>`).join('');
  }
}
async function populateTariffSelect(selectId = 'd-tariff') {
  if(State.tariffs.length===0)State.tariffs=await Airtable.getAll(CONFIG.TABLES.TARIFFS);
  const sel=document.getElementById(selectId);
  if(sel) sel.innerHTML=`<option value="">Выберите тариф</option>`+State.tariffs.map(t=>`<option value="${t.id}">${escHtml(t.fields['Название']||'')}</option>`).join('');
}

// ─── Drawers

function openNonTargetModal(ids) {
  _nonTargetPendingIds = ids || [];
  if (!_nonTargetPendingIds.length) return;

  document.getElementById('reject-comment').value = '';

  // Шапка: один лид или несколько
  const isBulk = _nonTargetPendingIds.length > 1;
  if (isBulk) {
    document.getElementById('reject-lead-info').innerHTML = `
      <div style="font-weight:700;font-size:15px">👥 ${_nonTargetPendingIds.length} лидов</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px">Одна причина будет применена ко всем</div>`;
  } else {
    const lead = State.leads.find(l => l.id === _nonTargetPendingIds[0]);
    const f = lead?.fields || {};
    const current = f['Причина: Не целевой'] || '';
    document.getElementById('reject-lead-info').innerHTML = `
      <div style="font-weight:600;font-size:15px">${escHtml(getField(f, CONFIG.LEAD_FIELDS.name) || '—')}</div>
      <div style="font-size:13px;color:var(--text2);margin-top:4px">📱 ${escHtml(getField(f, CONFIG.LEAD_FIELDS.phone) || '—')}</div>`;
    // Подсвечиваем текущую причину если она уже есть
    document.getElementById('reject-reasons').innerHTML = NON_TARGET_REASONS.map(r =>
      `<button class="reject-reason-btn${r === current ? ' selected' : ''}" onclick="selectRejectReason(this)">${escHtml(r)}</button>`
    ).join('');
    openDrawer('drawer-reject');
    return;
  }

  // Для bulk — кнопки без pre-selected
  document.getElementById('reject-reasons').innerHTML = NON_TARGET_REASONS.map(r =>
    `<button class="reject-reason-btn" onclick="selectRejectReason(this)">${escHtml(r)}</button>`
  ).join('');

  openDrawer('drawer-reject');
}

function selectRejectReason(btn) {
  document.querySelectorAll('#reject-reasons .reject-reason-btn')
    .forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function cancelReject() {
  closeDrawer('drawer-reject');
  _nonTargetPendingIds = [];
}

async function confirmReject() {
  const reason = document.querySelector('#reject-reasons .reject-reason-btn.selected')?.textContent?.trim();
  if (!reason) { toast('Укажите причину', 'error'); return; }

  const ids    = _nonTargetPendingIds;
  if (!ids.length) return;

  const btn     = document.getElementById('confirm-reject-btn');
  const comment = document.getElementById('reject-comment').value.trim();
  const isBulk  = ids.length > 1;

  btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true;
  try {
    const stageField = getStageFieldName(State.leads[0]?.fields || {});
    const stageObj   = FUNNEL_STAGES.find(s => s.key === 'Не целевой');
    const stageId    = stageObj ? stageObj.id : null;

    const apiFields = {
      [stageField]: stageId || [],
      'Причина: Не целевой': reason,
    };

    // Оптимистичное обновление локального стейта
    ids.forEach(id => {
      const lead = State.leads.find(l => l.id === id);
      if (!lead) return;
      Object.assign(lead.fields, {
        [stageField]: 'Не целевой',
        [stageField + ' ID']: stageId ? String(stageId) : '',
        'Причина: Не целевой': reason,
      });
      if (comment) {
        const existing = lead.fields['Комментарий'] || '';
        lead.fields['Комментарий'] = existing ? `${existing}\n${comment}` : comment;
      }
    });

    closeDrawer('drawer-reject');
    closeDrawer('drawer-detail');
    renderKanban(State.leads);
    renderLeadsStats();

    if (isBulk) {
      const batchFields = { ...apiFields };
      if (comment) batchFields['Комментарий'] = comment; // общий комментарий
      await Airtable.batchUpdate(CONFIG.TABLES.LEADS,
        ids.map(id => ({ id, fields: batchFields })));
      toast(`🚫 ${ids.length} лидов → Не целевой: ${reason}`);
    } else {
      const singleFields = { ...apiFields };
      if (comment) {
        const lead = State.leads.find(l => l.id === ids[0]);
        const existing = lead?.fields['Комментарий'] || '';
        singleFields['Комментарий'] = existing ? `${existing}\n${comment}` : comment;
      }
      await Airtable.update(CONFIG.TABLES.LEADS, ids[0], singleFields);
      toast(`🚫 Не целевой: ${reason}`);
    }

    _nonTargetPendingIds = [];
  } catch(e) {
    toast('Ошибка: ' + e.message, 'error');
  } finally {
    btn.innerHTML = '🚫 Отметить не целевым'; btn.disabled = false;
  }
}

// ════════════════════════════
// ПЕРЕИМЕНОВАНИЕ КОЛОНКИ
// ════════════════════════════

function renameColumn(stageKey, stageRowId) {
  closeAllDropdownMenus();

  // Находим заголовок колонки
  const col = document.querySelector(`.kanban-col[data-stage="${CSS.escape(stageKey)}"]`);
  if (!col) return;
  const nameSpan = col.querySelector('.kanban-col-header-top > span');
  if (!nameSpan) return;

  const originalHTML = nameSpan.innerHTML;
  const originalText = stageKey;

  // Заменяем span на input
  const input = document.createElement('input');
  input.value = originalText;
  input.className = 'col-rename-input';
  input.style.cssText = `
    background: rgba(99,102,241,0.12);
    border: 1.5px solid rgba(99,102,241,0.6);
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    font-family: inherit;
    padding: 3px 8px;
    width: 140px;
    outline: none;
  `;

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let saved = false;

  const save = async () => {
    if (saved) return;
    saved = true;
    const newName = input.value.trim();
    if (!newName || newName === originalText) {
      // Откат без изменений
      input.replaceWith(nameSpan);
      return;
    }
    await saveColumnRename(stageKey, stageRowId, newName, nameSpan, input);
  };

  const cancel = () => {
    if (saved) return;
    saved = true;
    input.replaceWith(nameSpan);
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', () => { setTimeout(save, 150); });
}

async function saveColumnRename(oldName, stageRowId, newName, nameSpan, input) {
  // Оптимистично показываем новое имя
  nameSpan.innerHTML = newName;
  input.replaceWith(nameSpan);

  try {
    // Обновляем в Baserow
    await Airtable.update(CONFIG.TABLES.STAGES, stageRowId, { 'Название': newName });

    // Обновляем локальный State.stages
    const stageInState = State.stages.find(s => String(s.id) === String(stageRowId));
    if (stageInState) stageInState.fields['Название'] = newName;

    // Обновляем DEFAULT_FUNNEL_STAGES (фолбек)
    const defStage = DEFAULT_FUNNEL_STAGES.find(s => s.key === oldName);
    if (defStage) defStage.key = newName;

    // Обновляем ключи сортировки колонок если был старый ключ
    if (State.columnSorting[oldName]) {
      State.columnSorting[newName] = State.columnSorting[oldName];
      delete State.columnSorting[oldName];
      localStorage.setItem('crm_column_sorting', JSON.stringify(State.columnSorting));
    }

    // Перерисовываем канбан с новым именем
    renderKanban(State.leads);
    toast(`Этап переименован: «${newName}» ✓`);
  } catch(e) {
    // Откат при ошибке
    nameSpan.innerHTML = oldName;
    toast('Ошибка: ' + e.message, 'error');
  }
}

function openAuditLink() {
  const link = document.getElementById('ei-record-link')?.value.trim();
  if (link) {
    window.open(link, '_blank');
  }
}

function updateAuditButtonState() {
  const input = document.getElementById('ei-record-link');
  const btn = document.getElementById('ei-audit-btn');
  if (input && btn) {
    const hasLink = input.value.trim().length > 0;
    btn.disabled = !hasLink;
  }
}

// ─── Обработчики фильтров Лидов
function populateLeadsFilterOptions() {
  const select = document.getElementById('flt-manager');
  if (!select) return;

  const perms = State.permissions;
  const currentUser = State.currentUser;

  if (perms && perms['Только свои Лиды'] && currentUser) {
    State.filterManager = currentUser.name;
    select.innerHTML = `<option value="${escHtml(currentUser.name)}" selected>${escHtml(currentUser.name)}</option>`;
    select.disabled = true;
    return;
  }

  select.disabled = false;
  const currentVal = select.value;
  select.innerHTML = '<option value="">Все менеджеры</option>' + 
    State.employees.map(e => {
      const name = e.fields['Имя'] || '';
      return `<option value="${escHtml(name)}"${currentVal === name ? ' selected' : ''}>${escHtml(name)}</option>`;
    }).join('');
}

function onLeadsFilterChange() {
  const searchInput = document.getElementById('flt-search');
  const mgrSelect = document.getElementById('flt-manager');
  const dateTypeSelect = document.getElementById('flt-date-type');
  const dateInput = document.getElementById('flt-date');
  const clearBtn = document.getElementById('flt-clear-btn');

  if (searchInput) State.filterSearch = searchInput.value;
  if (mgrSelect) State.filterManager = mgrSelect.value;
  if (dateTypeSelect) {
    State.filterDateType = dateTypeSelect.value;
    if (State.filterDateType) {
      dateInput.style.display = 'inline-block';
    } else {
      dateInput.style.display = 'none';
      State.filterDate = '';
      dateInput.value = '';
    }
  }
  if (dateInput && State.filterDateType) {
    State.filterDate = dateInput.value;
  }

  // Показываем/скрываем кнопку сброса
  const hasActiveFilters = !!(State.filterManager || State.filterSearch || (State.filterDateType && State.filterDate));
  if (clearBtn) {
    clearBtn.style.display = hasActiveFilters ? 'inline-flex' : 'none';
  }

  // Перерисовываем доску и показатели
  renderLeadsStats();
  renderKanban(State.leads);
}

function clearLeadsFilters() {
  const searchInput = document.getElementById('flt-search');
  const mgrSelect = document.getElementById('flt-manager');
  const dateTypeSelect = document.getElementById('flt-date-type');
  const dateInput = document.getElementById('flt-date');
  const clearBtn = document.getElementById('flt-clear-btn');

  State.filterSearch = '';
  State.filterDateType = '';
  State.filterDate = '';

  const perms = State.permissions;
  const currentUser = State.currentUser;
  
  if (perms && perms['Только свои Лиды'] && currentUser) {
    State.filterManager = currentUser.name;
  } else {
    State.filterManager = '';
    if (mgrSelect) mgrSelect.value = '';
  }

  if (searchInput) searchInput.value = '';
  if (dateTypeSelect) dateTypeSelect.value = '';
  if (dateInput) {
    dateInput.value = '';
    dateInput.style.display = 'none';
  }
  if (clearBtn) clearBtn.style.display = 'none';

  renderLeadsStats();
  renderKanban(State.leads);
}

// ════════════════════════════
// ВНУТРЕННИЙ CRM КАЛЕНДАРЬ
// ════════════════════════════
const CalState = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(),
  selectedDate: new Date().toISOString().substring(0, 10),
  filterManager: ''
};

async function loadCalendarPage() {
  const container = document.getElementById('calendar-view-container');
  if (!container) return;
  
  spinner('calendar-view-container');
  
  // Загружаем лиды и сотрудников, если еще не загружены
  if (State.leads.length === 0) {
    try {
      const [leads, employees] = await Promise.all([
        Airtable.getAll(CONFIG.TABLES.LEADS),
        Airtable.getAll(CONFIG.TABLES.EMPLOYEES)
      ]);
      State.leads = leads;
      State.employees = employees;
    } catch(e) {
      container.innerHTML = `<div class="empty">⚠️ Ошибка загрузки данных: ${escHtml(e.message)}</div>`;
      return;
    }
  }

  // Применяем принудительный фильтр «Только свои Лиды»
  const perms = State.permissions;
  const currentUser = State.currentUser;
  const filterSelect = document.getElementById('cal-flt-manager');

  if (perms && perms['Только свои Лиды'] && currentUser) {
    CalState.filterManager = currentUser.name;
    if (filterSelect) {
      filterSelect.innerHTML = `<option value="${escHtml(currentUser.name)}" selected>${escHtml(currentUser.name)}</option>`;
      filterSelect.disabled = true;
    }
  } else {
    if (filterSelect) {
      filterSelect.disabled = false;
      const currentVal = CalState.filterManager;
      filterSelect.innerHTML = '<option value="">Все менеджеры</option>' +
        State.employees.map(e => {
          const name = e.fields['Имя'] || '';
          return `<option value="${escHtml(name)}"${currentVal === name ? ' selected' : ''}>${escHtml(name)}</option>`;
        }).join('');
    }
  }

  renderCalendar();
}

function renderCalendar() {
  const container = document.getElementById('calendar-view-container');
  const titleEl = document.getElementById('calendar-title');
  if (!container) return;

  // Обновляем заголовок с названием месяца
  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  if (titleEl) {
    titleEl.textContent = `${monthNames[CalState.currentMonth]} ${CalState.currentYear}`;
  }

  const isMobile = window.innerWidth < 768;

  if (isMobile) {
    renderMobileCalendar(container);
  } else {
    renderDesktopCalendar(container);
  }
}

function renderDesktopCalendar(container) {
  const year = CalState.currentYear;
  const month = CalState.currentMonth;

  // Первый день недели в месяце (0 - воскресенье, 1 - понедельник и т.д.)
  const firstDay = new Date(year, month, 1).getDay();
  // Сдвиг для Пн=0, Вт=1 ... Вс=6
  const startDay = firstDay === 0 ? 6 : firstDay - 1;
  // Кол-во дней в текущем месяце
  const totalDays = new Date(year, month + 1, 0).getDate();
  // Кол-во дней в предыдущем месяце
  const prevTotalDays = new Date(year, month, 0).getDate();

  let html = `
    <div class="calendar-grid">
      <div class="calendar-day-header">Пн</div>
      <div class="calendar-day-header">Вт</div>
      <div class="calendar-day-header">Ср</div>
      <div class="calendar-day-header">Чт</div>
      <div class="calendar-day-header">Пт</div>
      <div class="calendar-day-header">Сб</div>
      <div class="calendar-day-header">Вс</div>
  `;

  // Предыдущий месяц (серые ячейки)
  for (let i = startDay - 1; i >= 0; i--) {
    const dNum = prevTotalDays - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    html += renderDayCell(prevYear, prevMonth, dNum, true);
  }

  // Текущий месяц
  for (let dNum = 1; dNum <= totalDays; dNum++) {
    html += renderDayCell(year, month, dNum, false);
  }

  // Следующий месяц (серые ячейки)
  const totalCells = startDay + totalDays;
  const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remainingCells; i++) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    html += renderDayCell(nextYear, nextMonth, i, true);
  }

  html += `</div>`;
  container.innerHTML = html;
}

function renderDayCell(y, m, dNum, isOtherMonth) {
  const cellDate = new Date(y, m, dNum);
  const cellDateStr = `${String(dNum).padStart(2,'0')}.${String(m+1).padStart(2,'0')}.${y}`;
  const isoDateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(dNum).padStart(2,'0')}`;
  
  const today = new Date();
  const isToday = today.getDate() === dNum && today.getMonth() === m && today.getFullYear() === y;

  // Фильтруем лиды по дате
  let cellLeads = State.leads.filter(l => {
    const cDate = l.fields['Дата консультации'];
    if (!cDate) return false;
    // Сравниваем нормализованную дату
    return toInputDateFormat(cDate) === isoDateStr;
  });

  if (CalState.filterManager) {
    cellLeads = cellLeads.filter(l => l.fields['Менеджер'] === CalState.filterManager);
  }

  // Сортировка по времени
  cellLeads.sort((a,b) => String(a.fields['Время консультации'] || '').localeCompare(String(b.fields['Время консультации'] || '')));

  let eventsHtml = '';
  cellLeads.forEach(l => {
    const time = l.fields['Время консультации'] || '—';
    const name = getField(l.fields, CONFIG.LEAD_FIELDS.name) || 'Лид';
    const mgr = l.fields['Менеджер'] || '';
    const color = getManagerColor(mgr);
    const stage = l.fields['Воронка'] || 'Лид';
    eventsHtml += `
      <div class="calendar-event-badge" style="--mgr-color: ${color}" onclick="event.stopPropagation(); openLeadDetail('${l.id}', '${escHtml(stage)}')" title="${escHtml(name)} (${time}) - ${escHtml(mgr)}">
        <span style="font-weight:800">${escHtml(time)}</span> ${escHtml(name)}
      </div>
    `;
  });

  const cellClass = `calendar-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`;
  return `
    <div class="${cellClass}" onclick="goMobileDay('${isoDateStr}')">
      <div class="calendar-day-num">${dNum}</div>
      <div class="calendar-events-container">${eventsHtml}</div>
    </div>
  `;
}

function renderMobileCalendar(container) {
  const selectedDateObj = new Date(CalState.selectedDate);
  
  // Генерируем 14 дней (3 дня назад, 10 дней вперед)
  let timelineHtml = '<div class="mobile-week-timeline">';
  
  for (let i = -3; i < 11; i++) {
    const cellDate = new Date();
    cellDate.setDate(new Date().getDate() + i);
    
    const isoDateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth()+1).padStart(2,'0')}-${String(cellDate.getDate()).padStart(2,'0')}`;
    const dNum = cellDate.getDate();
    const weekNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const wName = weekNames[cellDate.getDay()];
    
    const isActive = CalState.selectedDate === isoDateStr;
    const isToday = new Date().toDateString() === cellDate.toDateString();

    // Проверяем наличие событий
    let dayLeads = State.leads.filter(l => {
      const cDate = l.fields['Дата консультации'];
      return cDate && toInputDateFormat(cDate) === isoDateStr;
    });
    if (CalState.filterManager) {
      dayLeads = dayLeads.filter(l => l.fields['Менеджер'] === CalState.filterManager);
    }
    const hasEvents = dayLeads.length > 0;

    const dayClass = `mobile-week-day ${isActive ? 'active' : ''} ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}`;
    timelineHtml += `
      <div class="${dayClass}" onclick="selectMobileDate('${isoDateStr}')">
        <span class="mobile-week-day-name">${wName}</span>
        <span class="mobile-week-day-num">${dNum}</span>
      </div>
    `;
  }
  timelineHtml += '</div>';

  // Рендерим список событий на выбранный день
  let eventsHtml = '<div class="mobile-event-list">';
  
  let dayLeads = State.leads.filter(l => {
    const cDate = l.fields['Дата консультации'];
    return cDate && toInputDateFormat(cDate) === CalState.selectedDate;
  });
  if (CalState.filterManager) {
    dayLeads = dayLeads.filter(l => l.fields['Менеджер'] === CalState.filterManager);
  }
  
  dayLeads.sort((a,b) => String(a.fields['Время консультации'] || '').localeCompare(String(b.fields['Время консультации'] || '')));

  if (dayLeads.length === 0) {
    eventsHtml += `
      <div class="mobile-event-empty">
        <div style="font-size:32px; margin-bottom:8px;">📅</div>
        Нет назначенных консультаций на этот день
      </div>
    `;
  } else {
    dayLeads.forEach(l => {
      const time = l.fields['Время консультации'] || '—';
      const name = getField(l.fields, CONFIG.LEAD_FIELDS.name) || 'Лид';
      const mgr = l.fields['Менеджер'] || 'не назначен';
      const color = getManagerColor(mgr);
      const source = getField(l.fields, CONFIG.LEAD_FIELDS.source) || '—';
      const stage = l.fields['Воронка'] || 'Лид';
      
      eventsHtml += `
        <div class="mobile-event-card" onclick="openLeadDetail('${l.id}', '${escHtml(stage)}')">
          <div class="mobile-event-time">${escHtml(time)}</div>
          <div class="mobile-event-details">
            <div class="mobile-event-name">${escHtml(name)}</div>
            <div class="mobile-event-meta">
              <span class="mobile-event-manager-dot" style="--mgr-color: ${color}"></span>
              <span>${escHtml(mgr)}</span>
              <span>•</span>
              <span>Источник: ${escHtml(source)}</span>
            </div>
          </div>
        </div>
      `;
    });
  }
  eventsHtml += '</div>';

  container.innerHTML = timelineHtml + eventsHtml;
}

function selectMobileDate(dateStr) {
  CalState.selectedDate = dateStr;
  renderCalendar();
}

function goMobileDay(dateStr) {
  CalState.selectedDate = dateStr;
  CalState.currentYear = new Date(dateStr).getFullYear();
  CalState.currentMonth = new Date(dateStr).getMonth();
  renderCalendar();
}

function prevMonth() {
  if (CalState.currentMonth === 0) {
    CalState.currentMonth = 11;
    CalState.currentYear--;
  } else {
    CalState.currentMonth--;
  }
  renderCalendar();
}

function nextMonth() {
  if (CalState.currentMonth === 11) {
    CalState.currentMonth = 0;
    CalState.currentYear++;
  } else {
    CalState.currentMonth++;
  }
  renderCalendar();
}

function goToday() {
  const today = new Date();
  CalState.currentYear = today.getFullYear();
  CalState.currentMonth = today.getMonth();
  CalState.selectedDate = today.toISOString().substring(0, 10);
  renderCalendar();
}

function onCalendarFilterChange() {
  const select = document.getElementById('cal-flt-manager');
  if (select) {
    CalState.filterManager = select.value;
    renderCalendar();
  }
}

// Слушатель изменения размеров экрана для адаптивного рендеринга
window.addEventListener('resize', () => {
  if (State.currentPage === 'calendar') {
    renderCalendar();
  }
});

// Экспортируем функции в window
window.loadCalendarPage = loadCalendarPage;
window.renderCalendar = renderCalendar;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.goToday = goToday;
window.onCalendarFilterChange = onCalendarFilterChange;
window.selectMobileDate = selectMobileDate;
window.goMobileDay = goMobileDay;


