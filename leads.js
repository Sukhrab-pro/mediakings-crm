// === LEADS, CLIENTS, DEALS, OPERATIONS MODULE ===
let LeadUndoStack = [];

// Вспомогательная функция для проверки наличия несохраненного ввода в активном текстовом поле
function isInputDirty(lead) {
  if (!lead || !document.activeElement) return false;
  const el = document.activeElement;
  const id = el.id;
  const val = el.value !== undefined ? el.value.trim() : null;
  
  if (id === 'ei-name') {
    const saved = (getField(lead.fields, CONFIG.LEAD_FIELDS.name) || '').trim();
    return val !== saved;
  }
  if (id === 'ei-phone') {
    const saved = (getField(lead.fields, CONFIG.LEAD_FIELDS.phone) || '').trim();
    return val !== saved;
  }
  if (id === 'ei-instagram') {
    const saved = (lead.fields['Instagram'] || '').trim();
    return val !== saved;
  }
  if (id === 'ei-source') {
    const saved = (getField(lead.fields, CONFIG.LEAD_FIELDS.source) || '').trim();
    return val !== saved;
  }
  if (id === 'ei-niche') {
    const saved = (lead.fields['Ниша'] || '').trim();
    return val !== saved;
  }
  if (id === 'ei-budget') {
    const saved = String(lead.fields['Бюджет'] || '');
    return val !== saved;
  }
  if (id === 'ei-record-link') {
    const saved = (lead.fields['Ссылка на запись'] || '').trim();
    return val !== saved;
  }
  if (id === 'ei-comment') {
    const saved = (lead.fields['Комментарий'] || '').trim();
    return val !== saved;
  }
  return false;
}

// Функция для отмены последнего изменения лида
async function undoLeadEdit(id) {
  // Находим индекс последней записи для данного лида
  let indexToPop = -1;
  for (let i = LeadUndoStack.length - 1; i >= 0; i--) {
    if (LeadUndoStack[i].leadId === id) {
      indexToPop = i;
      break;
    }
  }
  if (indexToPop === -1) {
    toast('Нет изменений для отмены', 'info');
    return;
  }
  
  const entry = LeadUndoStack.splice(indexToPop, 1)[0];
  const snapshot = entry.fields;
  const lead = State.leads.find(l => l.id === id);
  if (!lead) return;
  
  // Подготовка полей для обновления в Baserow
  const fieldsToUpdate = {};
  for (const key in snapshot) {
    if (key === 'Менеджер') {
      const managerName = snapshot['Менеджер'];
      const emp = managerName ? State.employees.find(e => e.fields['Имя'] === managerName) : null;
      fieldsToUpdate['Менеджер'] = emp ? [emp.id] : [];
    } else {
      fieldsToUpdate[key] = snapshot[key];
    }
  }
  
  try {
    toast('↩️ Отмена изменений...');
    await Airtable.update(CONFIG.TABLES.LEADS, id, fieldsToUpdate);
    
    // Обновляем локальный стейт
    Object.assign(lead.fields, snapshot);
    
    // Обновляем значения в DOM, если драуэр все еще открыт для этого лида
    if (window._activeLeadId === id) {
      const nameEl = document.getElementById('ei-name');
      if (nameEl) nameEl.value = snapshot['Имя'] || '';
      
      const phoneEl = document.getElementById('ei-phone');
      if (phoneEl) phoneEl.value = snapshot['Телефон'] || '';
      
      const instaEl = document.getElementById('ei-instagram');
      if (instaEl) instaEl.value = snapshot['Instagram'] || '';
      
      const sourceEl = document.getElementById('ei-source');
      if (sourceEl) sourceEl.value = snapshot['Источник'] || '';
      
      const nicheEl = document.getElementById('ei-niche');
      if (nicheEl) nicheEl.value = snapshot['Ниша'] || '';
      
      const budgetEl = document.getElementById('ei-budget');
      if (budgetEl) budgetEl.value = snapshot['Бюджет'] || '';
      
      const managerEl = document.getElementById('ei-manager');
      if (managerEl) {
        const managerName = snapshot['Менеджер'];
        const emp = managerName ? State.employees.find(e => e.fields['Имя'] === managerName) : null;
        managerEl.value = emp ? emp.id : '';
      }
      
      const recordEl = document.getElementById('ei-record-link');
      if (recordEl) recordEl.value = snapshot['Ссылка на запись'] || '';
      
      const nonTargetEl = document.getElementById('ei-nontarget-reason');
      if (nonTargetEl) nonTargetEl.value = snapshot['Причина: Не целевой'] || '';
      
      const commentEl = document.getElementById('ei-comment');
      if (commentEl) commentEl.value = snapshot['Комментарий'] || '';
      
      if (typeof updateAuditButtonState === 'function') {
        updateAuditButtonState();
      }
    }
    
    renderKanban(State.leads);
    renderLeadsStats();
    renderLeadMiddleColumn(lead);
    updateUndoButtonVisibility(id);
    
    toast('↩️ Изменение отменено (Cmd+Z)');
    if (typeof syncGoogleCalendarEvent === 'function') {
      syncGoogleCalendarEvent(lead).catch(console.error);
    }
  } catch (e) {
    toast('Ошибка отмены: ' + e.message, 'error');
  }
}

// Функция для управления видимостью кнопки "Отменить"
function updateUndoButtonVisibility(id) {
  const btn = document.getElementById('ei-undo-btn');
  if (!btn) return;
  const hasUndo = LeadUndoStack.some(entry => entry.leadId === id);
  btn.style.display = hasUndo ? 'inline-flex' : 'none';
}

// Глобальный слушатель для отмены изменений по Cmd+Z / Ctrl+Z
window.addEventListener('keydown', (e) => {
  const drawer = document.getElementById('drawer-detail');
  if (drawer && drawer.classList.contains('open') && window._activeLeadId) {
    const isCmdZ = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
    if (isCmdZ) {
      const lead = State.leads.find(l => l.id === window._activeLeadId);
      if (lead && isInputDirty(lead)) {
        // Позволяем работать стандартному Cmd+Z браузера, если пользователь печатает
        return;
      }
      
      const hasUndoForLead = LeadUndoStack.some(entry => entry.leadId === window._activeLeadId);
      if (hasUndoForLead) {
        e.preventDefault();
        if (document.activeElement) {
          document.activeElement.blur();
        }
        setTimeout(() => {
          undoLeadEdit(window._activeLeadId);
        }, 50);
      }
    }
  }
});

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

// Преобразование строкового значения даты в формат YYYY-MM-DD
function convertDbDateToYmd(dateStr) {
  if (!dateStr) return null;
  const d = parseDateStr(dateStr);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Автосистематизация: перенос ниши и инстаграма из комментариев в отдельные поля
function parseNewLeadsComments(leads) {
  const updates = [];
  
  const formatInstagramUrl = (insta) => {
    if (!insta) return null;
    let val = insta.trim().replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    const lower = val.toLowerCase();
    if (lower === 'не указано' || lower === 'пока нет' || lower === 'нет' || lower === '-' || lower === 'неуказано' || lower === 'нет.' || lower === 'null') {
      return null;
    }
    if (val.startsWith('http://') || val.startsWith('https://')) return val;
    
    let username = val;
    if (username.startsWith('@')) username = username.slice(1);
    username = username.replace(/\s+/g, '');
    
    if (username.length > 0 && !username.includes('/') && !username.includes('.')) {
      return `https://www.instagram.com/${username}/`;
    }
    if (username.length > 0) {
      if (username.toLowerCase().includes('instagram.com/')) {
        const parts = username.split('instagram.com/');
        if (parts[1]) return `https://www.instagram.com/${parts[1]}`;
      }
      if (!username.includes('/') && !username.includes('?') && !username.includes(':')) {
        return `https://www.instagram.com/${username}/`;
      }
      if (username.includes('.') || username.includes('/')) {
        return `https://${username}`;
      }
    }
    return null;
  };

  const parseCommentFields = (comment) => {
    if (!comment) return null;
    const nicheRegex = /(?:Ниша|Ниша клиента):\s*([^|]+)/i;
    const instaRegex = /(?:Инстаграм|Instagram|Инста|Insta):\s*([^|]+)/i;
    
    let niche = null;
    let instagram = null;
    
    const nicheMatch = comment.match(nicheRegex);
    if (nicheMatch) {
      niche = nicheMatch[1].trim();
      niche = niche.replace(/(?:\+7|8)[\s ]*\d{3}[\s ]*\d{3}[\s ]*\d{2}[\s ]*\d{2}/g, '').trim();
      niche = niche.replace(/\+7\s*\(?\d{3}\)?\s*\d{3}\s*\d{2}\s*\d{2}/g, '').trim();
      niche = niche.replace(/[\s\u202a-\u202f]+$/g, '').trim();
      niche = niche.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    }
    
    const instaMatch = comment.match(instaRegex);
    if (instaMatch) {
      instagram = instaMatch[1].trim();
      instagram = instagram.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    }
    
    let cleaned = comment;
    cleaned = cleaned.replace(/(?:Ниша|Ниша клиента):\s*[^|]+(\|)?/gi, '');
    cleaned = cleaned.replace(/(?:Инстаграм|Instagram|Инста|Insta):\s*[^|]+(\|)?/gi, '');
    cleaned = cleaned.replace(/^[|\s\u202a-\u202f\n\r]+|[|\s\u202a-\u202f\n\r]+$/g, '');
    cleaned = cleaned.replace(/\s*\|\s*/g, ' ').trim();
    cleaned = cleaned.trim();
    
    if (niche || instagram) {
      return { niche, instagram, cleanedComment: cleaned };
    }
    return null;
  };

  for (const lead of leads) {
    const f = lead.fields;
    const comment = f['Комментарий'] || '';
    const parsed = parseCommentFields(comment);
    
    if (parsed) {
      const updateFields = {};
      let needsUpdate = false;
      
      if (parsed.niche && !f['Ниша']) {
        updateFields['Ниша'] = parsed.niche;
        f['Ниша'] = parsed.niche;
        needsUpdate = true;
      }
      
      if (parsed.instagram && !f['Instagram']) {
        const validUrl = formatInstagramUrl(parsed.instagram);
        if (validUrl) {
          updateFields['Instagram'] = validUrl;
          f['Instagram'] = validUrl;
          needsUpdate = true;
        } else {
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        updateFields['Комментарий'] = parsed.cleanedComment;
        f['Комментарий'] = parsed.cleanedComment;
        
        updates.push({
          id: lead.id,
          fields: updateFields
        });
      }
    }
  }

  if (updates.length > 0) {
    console.log(`[Parse] Найдено ${updates.length} лидов с неструктурированными комментариями. Запуск переноса в поля...`);
    Airtable.batchUpdate(CONFIG.TABLES.LEADS, updates)
      .then(res => {
        console.log(`[Parse] Успешно перенесены данные для ${updates.length} лидов.`);
      })
      .catch(err => {
        console.error('[Parse] Ошибка переноса данных комментариев в Baserow:', err);
      });
  }
}

// Автосинхронизация и самолечение задач-консультаций для старых и новых лидов
function syncConsultationTasks(leads) {
  const updates = [];
  const todayStr = getLocalDateString();
  const nowStr = getLocalDateTimeString();

  for (const lead of leads) {
    const f = lead.fields;
    const dateVal = f['Дата консультации'];
    if (!dateVal) continue;

    let tasks = [];
    try {
      tasks = safeJsonParse(f['Задачи'] || '[]');
      if (!Array.isArray(tasks)) tasks = [];
    } catch(e) {
      tasks = [];
    }

    const hasActiveTask = tasks.some(t => (t.type === 'consult' || t.type === 'call') && !t.cancelled);
    if (!hasActiveTask) {
      const isDone = !!f['Консультация проведена'];
      const timeVal = f['Время консультации'] || '12:00';
      const managerName = f['Менеджер'] || 'Система';
      const ymd = convertDbDateToYmd(dateVal);
      if (!ymd) continue;

      const assignDateVal = f['Дата назначения'] || f['Дата'] || todayStr;
      const assignYmd = convertDbDateToYmd(assignDateVal) || todayStr;

      const consultTask = {
        id: 't_auto_' + Math.random().toString(36).substr(2, 9),
        type: 'consult',
        text: 'Провести консультацию',
        assignedDate: assignYmd,
        dueDate: ymd,
        dueTime: timeVal,
        duration: Number(f['Длительность']) || 30,
        done: isDone,
        completedAt: isDone ? nowStr : '',
        user: managerName,
        createdAt: nowStr
      };

      tasks.push(consultTask);
      f['Задачи'] = JSON.stringify(tasks);

      let history = [];
      try {
        history = safeJsonParse(f['История'] || '[]');
        if (!Array.isArray(history)) history = [];
      } catch(e) {
        history = [];
      }
      history.unshift({
        date: new Date().toLocaleString('ru-RU'),
        user: 'Система',
        type: 'task_create',
        taskId: consultTask.id,
        details: 'Автоматически создана задача: "Провести консультацию"'
      });
      f['История'] = JSON.stringify(history);

      updates.push({
        id: lead.id,
        fields: {
          'Задачи': f['Задачи'],
          'История': f['История']
        }
      });
    }
  }

  if (updates.length > 0) {
    console.log(`[Sync] Найдено ${updates.length} лидов, требующих создание задачи-консультации. Запуск фоновой синхронизации...`);
    Airtable.batchUpdate(CONFIG.TABLES.LEADS, updates)
      .then(res => {
        console.log(`[Sync] Успешно синхронизировано ${updates.length} лидов в Baserow.`);
      })
      .catch(err => {
        console.error('[Sync] Ошибка фоновой синхронизации в Baserow:', err);
      });
  }
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
    const [leads, clients, deals, pipelines, stages, employees, calls, incomes] = await Promise.all([
      Airtable.getAll(CONFIG.TABLES.LEADS),
      Airtable.getAll(CONFIG.TABLES.CLIENTS),
      Airtable.getAll(CONFIG.TABLES.DEALS),
      Airtable.getAll(CONFIG.TABLES.PIPELINES),
      Airtable.getAll(CONFIG.TABLES.STAGES),
      Airtable.getAll(CONFIG.TABLES.EMPLOYEES),
      Airtable.getAll(CONFIG.TABLES.CALLS),
      Airtable.getAll(CONFIG.TABLES.FINANCE_INCOMES)
    ]);
    State.leads = leads;
    State.clients = clients;
    State.deals = deals;
    State.pipelines = pipelines;
    State.stages = stages;
    State.employees = employees;
    State.calls = calls || [];
    State.financeIncomes = incomes || [];

    // Запуск автосинхронизации/миграции задач-консультаций
    syncConsultationTasks(State.leads);
    parseNewLeadsComments(State.leads);

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

function getStatsPeriodDates() {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  const setStartOfDay = (d) => {
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const setEndOfDay = (d) => {
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const period = State.statsPeriod || 'this_week';

  if (period === 'today') {
    start = setStartOfDay(new Date(now));
    end = setEndOfDay(new Date(now));
  } else if (period === 'this_week') {
    start = setStartOfDay(new Date(now));
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
    end = setEndOfDay(new Date(start));
    end.setDate(end.getDate() + 6);
  } else if (period === 'last_week') {
    start = setStartOfDay(new Date(now));
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1) - 7);
    end = setEndOfDay(new Date(start));
    end.setDate(end.getDate() + 6);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (period === 'custom') {
    if (State.statsCustomFrom) {
      start = setStartOfDay(new Date(State.statsCustomFrom));
    } else {
      start = new Date(0); // far past
    }
    if (State.statsCustomTo) {
      end = setEndOfDay(new Date(State.statsCustomTo));
    } else {
      end = new Date(3000, 0, 1); // far future
    }
  }

  return { start, end };
}

function onStatsPeriodChange(val) {
  State.statsPeriod = val;
  const customDatesEl = document.getElementById('stats-custom-dates');
  if (customDatesEl) {
    customDatesEl.style.display = val === 'custom' ? 'flex' : 'none';
  }
  renderLeadsStats();
}

function onStatsCustomDateChange() {
  const fromEl = document.getElementById('stats-date-from');
  const toEl = document.getElementById('stats-date-to');
  if (fromEl) State.statsCustomFrom = fromEl.value;
  if (toEl) State.statsCustomTo = toEl.value;
  renderLeadsStats();
}

window.onStatsPeriodChange = onStatsPeriodChange;
window.onStatsCustomDateChange = onStatsCustomDateChange;

function renderLeadsStats() {
  const leads = State.leads;

  function pluralizeDeals(count) {
    let n = Math.abs(count);
    n %= 100;
    if (n >= 5 && n <= 20) return `${count} проектов`;
    n %= 10;
    if (n === 1) return `${count} проект`;
    if (n >= 2 && n <= 4) return `${count} проекта`;
    return `${count} проектов`;
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
      const lid = String(l.id);
      return name.includes(q) ||
             (qPhone && phone.includes(qPhone)) ||
             niche.includes(q) ||
             source.includes(q) ||
             comment.includes(q) ||
             lid.includes(q.replace('#',''));
    });
  }

  // 2. Для активных счетчиков берем только неархивированные лиды
  const activePipelineLeads = currentPipelineLeads.filter(l => !isLeadArchived(l));

  // Получаем границы выбранного периода
  const period = getStatsPeriodDates();

  // Счётчики по статусам воронки
  const mainStageKeys = FUNNEL_STAGES.filter(s => s.group === 'main').map(s => s.key);
  const inWorkCount     = activePipelineLeads.filter(l => mainStageKeys.includes(getField(l.fields, CONFIG.LEAD_FIELDS.stage))).length;
  const warmingCount    = activePipelineLeads.filter(l => getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'На прогрев').length;
  const unprocessedCount= activePipelineLeads.filter(l => getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Не обработано').length;
  const nonTargetCount  = activePipelineLeads.filter(l => getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Не целевой').length;

  const consultAppointedInPeriod = activePipelineLeads.filter(l => {
    const tasks = safeJsonParse(l.fields['Задачи'] || '[]');
    return tasks.some(t => {
      if ((t.type !== 'consult' && t.type !== 'call') || t.cancelled) return false;
      const d = parseDateStr(t.dueDate);
      return d && d >= period.start && d <= period.end;
    });
  }).length;

  const consultDoneInPeriod = activePipelineLeads.filter(l => {
    const tasks = safeJsonParse(l.fields['Задачи'] || '[]');
    return tasks.some(t => {
      if ((t.type !== 'consult' && t.type !== 'call') || !t.done || t.cancelled) return false;
      const d = parseDateStr(t.dueDate);
      return d && d >= period.start && d <= period.end;
    });
  }).length;

  const awaitingPayment = activePipelineLeads.filter(l => {
    const s = getField(l.fields, CONFIG.LEAD_FIELDS.stage);
    return s === 'Договор на рассмотрении';
  });
  const awaitingPaymentSum = awaitingPayment.reduce((s, l) => s + (Number(l.fields['Бюджет']) || 0), 0);

  const soldLeads = currentPipelineLeads.filter(l => getField(l.fields, CONFIG.LEAD_FIELDS.stage) === 'Продано');
  
  const soldInPeriod = soldLeads.filter(l => { 
    const d = parseDateStr(l.fields['Дата продажи']) || parseLeadDate(l); 
    return d && d >= period.start && d <= period.end; 
  });
  
  const sumOf = arr => arr.reduce((s,l) => s + (Number(l.fields['Бюджет'])||0), 0);
  const sumOfPaid = arr => arr.reduce((s,l) => s + (Number(l.fields['Оплата'])||0), 0);

  const fmt = n => n.toLocaleString('ru-RU');

  // Динамические текстовые ярлыки для периода
  let periodLabel = 'за период';
  let periodLabelLc = 'за период';
  if (State.statsPeriod === 'today') {
    periodLabel = 'сегодня';
    periodLabelLc = 'сегодня';
  } else if (State.statsPeriod === 'this_week') {
    periodLabel = 'за неделю';
    periodLabelLc = 'за неделю';
  } else if (State.statsPeriod === 'last_week') {
    periodLabel = 'за прошлую неделю';
    periodLabelLc = 'за прошлую неделю';
  } else if (State.statsPeriod === 'month') {
    periodLabel = 'за месяц';
    periodLabelLc = 'за месяц';
  }

  document.getElementById('leads-stats').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
      <div style="font-size:14px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
        📊 Показатели воронки
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="font-size:12px; color:var(--text2); font-weight:600;">Период показателей:</span>
        <select id="stats-period-select" class="form-select compact-input" style="width:160px; margin:0;" onchange="onStatsPeriodChange(this.value)">
          <option value="today" ${State.statsPeriod === 'today' ? 'selected' : ''}>Сегодня</option>
          <option value="this_week" ${State.statsPeriod === 'this_week' ? 'selected' : ''}>Эта неделя</option>
          <option value="last_week" ${State.statsPeriod === 'last_week' ? 'selected' : ''}>Прошлая неделя</option>
          <option value="month" ${State.statsPeriod === 'month' ? 'selected' : ''}>За месяц</option>
          <option value="custom" ${State.statsPeriod === 'custom' ? 'selected' : ''}>Диапазон дат...</option>
        </select>
        <div id="stats-custom-dates" style="display:${State.statsPeriod === 'custom' ? 'flex' : 'none'}; align-items:center; gap:6px;">
          <input type="date" id="stats-date-from" class="form-input compact-input" style="width:130px; margin:0;" value="${State.statsCustomFrom || ''}" onchange="onStatsCustomDateChange()" onclick="try{this.showPicker()}catch(e){}"/>
          <span style="color:var(--text2); font-size:12px;">—</span>
          <input type="date" id="stats-date-to" class="form-input compact-input" style="width:130px; margin:0;" value="${State.statsCustomTo || ''}" onchange="onStatsCustomDateChange()" onclick="try{this.showPicker()}catch(e){}"/>
        </div>
      </div>
    </div>

    <!-- Tabular Stats Layout -->
    <div class="stats-tables-container">
      <!-- Table 1: Воронка -->
      <div class="stats-table-wrapper" style="flex: 1.5; min-width: 0;">
        <div class="stats-table-title">📊 Состояние воронки</div>
        <table class="stats-data-table horizontal">
          <thead>
            <tr>
              <th>🎯 Всего</th>
              <th>⚙️ В работе</th>
              <th>🔥 Прогрев</th>
              <th>⏳ Не обр.</th>
              <th>🚫 Нецел.</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="num val-default">${activePipelineLeads.length}</td>
              <td class="num val-blue">${inWorkCount}</td>
              <td class="num val-orange">${warmingCount}</td>
              <td class="num val-default">${unprocessedCount}</td>
              <td class="num" style="color: #94a3b8;">${nonTargetCount}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Table 2: Активность -->
      <div class="stats-table-wrapper" style="flex: 0.8; min-width: 0;">
        <div class="stats-table-title">🤝 Консультации ${periodLabelLc}</div>
        <table class="stats-data-table horizontal">
          <thead>
            <tr>
              <th>📅 Назначено</th>
              <th>✅ Проведено</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="num val-blue">${consultAppointedInPeriod}</td>
              <td class="num val-green">${consultDoneInPeriod}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Table 3: Финансы -->
      <div class="stats-table-wrapper" style="flex: 1.8; min-width: 0;">
        <div class="stats-table-title">💰 Финансы ${periodLabelLc}</div>
        <table class="stats-data-table horizontal">
          <thead>
            <tr>
              <th>💳 В ожидании</th>
              <th>📈 Выручка</th>
              <th>📥 В кассу</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="num val-orange">${fmt(awaitingPaymentSum)} ₸ <span class="sub">${awaitingPayment.length} дог.</span></td>
              <td class="num val-green">${fmt(sumOf(soldInPeriod))} ₸ <span class="sub">${pluralizeDeals(soldInPeriod.length)}</span></td>
              <td class="num val-blue">${fmt(sumOfPaid(soldInPeriod))} ₸ <span class="sub">${pluralizeDeals(soldInPeriod.length)}</span></td>
            </tr>
          </tbody>
        </table>
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
      
      const currentMgr = lead.fields['Менеджер'] || '';
      html += `<li><span>👤 Назначить менеджера...</span><span class="arrow">▶</span>
        <ul class="submenu" style="max-height: 250px; overflow-y: auto;">
          <li onclick="assignLeadManager('${id}', '')">${!currentMgr ? '✓ ' : ''}— Снять менеджера —</li>
          ${State.employees.map(emp => {
            const name = emp.fields['Имя'] || '';
            const empId = emp.id;
            const isSelected = currentMgr === name;
            return `<li onclick="assignLeadManager('${id}', '${empId}')">${isSelected ? '✓ ' : ''}${escHtml(name)}</li>`;
          }).join('')}
        </ul>
      </li>`;

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
      const matchesId = String(lead.id).includes(q.replace('#',''));

      if (!matchesName && !matchesPhone && !matchesNiche && !matchesSource && !matchesComment && !matchesId) return;
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
                <div style="display:flex; align-items:center; gap:6px;">${mgBadge}<span style="font-size:10px; color:var(--text2); font-weight:600;">#${lead.id}</span></div>
              </div>
              ${lead.fields['Ниша'] ? `<div class="kanban-card-sub" style="color:#a5b4fc; font-weight: 500;">💼 ${escHtml(lead.fields['Ниша'])}</div>` : ''}
              ${phone  ? `<div class="kanban-card-sub">📱 ${escHtml(phone)}</div>` : ''}
              ${igHandle ? `<div class="kanban-card-sub" style="color:#c026d3; cursor:pointer;" onclick="event.stopPropagation(); copyInstagram('${escHtml(igRaw)}')">📸 ${escHtml(igHandle)}</div>` : ''}
              ${cd     ? `<div class="kanban-card-sub" style="color:#3b82f6">📅 ${escHtml(cd)} ${escHtml(lead.fields['Время консультации']||'')}</div>` :
                date    ? `<div class="kanban-card-sub">📋 ${date}</div>` : ''}
              ${(() => {
                const tasksList = safeJsonParse(lead.fields['Задачи'] || '[]');
                const activeTasksList = tasksList.filter(t => !t.done && !t.cancelled && t.dueDate);
                if (activeTasksList.length === 0) return '';
                
                const todayStr = getLocalDateString();
                const overdueTasks = activeTasksList.filter(t => t.dueDate < todayStr);
                const nonOverdueTasks = activeTasksList.filter(t => t.dueDate >= todayStr);

                let t = null;
                if (nonOverdueTasks.length > 0) {
                  nonOverdueTasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.dueTime || '').localeCompare(b.dueTime || ''));
                  t = nonOverdueTasks[0];
                } else if (overdueTasks.length > 0) {
                  overdueTasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.dueTime || '').localeCompare(b.dueTime || ''));
                  t = overdueTasks[0];
                }

                if (!t) return '';
                
                const isOverdue = t.dueDate < todayStr;
                const isToday = t.dueDate === todayStr;
                const color = isOverdue ? '#fca5a5' : (isToday ? '#fcd34d' : '#93c5fd'); // мягкий красный, желтый, голубой
                const icon = isOverdue ? '⚠️' : '🔔';
                const timeStr = t.dueTime ? ` в ${t.dueTime}` : '';
                
                return `<div class="kanban-card-sub" style="color:${color}; font-weight:600; font-size:11px;" title="${escHtml(t.text)}">${icon} ${formatDate(t.dueDate)}${timeStr}: ${escHtml(t.text)}</div>`;
              })()}
              ${(() => {
                const projectPrice = getLeadProjectPrice(lead);
                const budget = projectPrice || Number(lead.fields['Бюджет']) || 0;
                if (!budget) return '';
                const paid = calculateLeadPayments(lead);
                const pct = paid > 0 ? Math.min(Math.round((paid / Number(budget)) * 100), 100) : 0;
                if (paid > 0) {
                  const barColor = pct >= 100 ? '#34d399' : pct >= 50 ? '#f59e0b' : '#6366f1';
                  return `<div class="kanban-card-sub" style="color:#34d399">
                    💰 ${Number(budget).toLocaleString('ru-RU')} ₸
                    <span style="color:${barColor}; font-weight:700; margin-left:4px;">${pct}% оплачено</span>
                  </div>
                  <div style="background:rgba(255,255,255,0.08); border-radius:3px; height:3px; margin:3px 0 0; overflow:hidden;">
                    <div style="height:3px; border-radius:3px; background:${barColor}; width:${pct}%;"></div>
                  </div>`;
                }
                return `<div class="kanban-card-sub" style="color:#34d399">💰 ${Number(budget).toLocaleString('ru-RU')} ₸</div>`;
              })()}
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
  if (window.updateTasksReminderNotification) window.updateTasksReminderNotification();
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
  if (newStage === 'Связаться позднее') {
    openContactLaterModal(leadId, newStage, fromStage, beforeId);
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
  if (newStage === 'Связаться позднее') {
    openContactLaterModal(id, newStage, oldStage);
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
  const history = safeJsonParse(f['История'] || '[]');
  const id = lead.id;

  // Ищем звонки, привязанные к этому лиду
  const leadCalls = (State.calls || []).filter(c => {
    const linkedIds = String(c.fields['Лиды ID'] || '').split(',').map(s => s.trim());
    return linkedIds.includes(String(id));
  });

  let callsHtml = '';
  if (leadCalls.length > 0) {
    callsHtml = `
      <div class="lead-calls-section" style="padding:12px; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0; background:rgba(99,102,241,0.03);">
        <div style="font-size:11px; font-weight:800; color:#a5b4fc; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <span>📞 Разборы звонков ИИ (${leadCalls.length})</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; max-height: 180px; overflow-y: auto;">
          ${leadCalls.map(c => {
            const score = Number(c.fields['Оценка']) || 0;
            let scoreColor = '#ef4444';
            let scoreBg = 'rgba(239, 68, 68, 0.15)';
            if (score >= 6) {
              scoreColor = '#10b981';
              scoreBg = 'rgba(16, 185, 129, 0.15)';
            } else if (score >= 4) {
              scoreColor = '#f59e0b';
              scoreBg = 'rgba(245, 158, 11, 0.15)';
            }
            
            return `
              <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                <div style="flex:1; min-width:0;">
                  <div style="font-size:12px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(c.fields['Имя'] || 'Звонок')}</div>
                  <div style="font-size:11px; color:var(--text3); margin-top:2px;">Дата: ${c.fields['Дата'] || '—'} | Менеджер: ${escHtml(c.fields['Менеджер'] || '—')}</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                  <span style="font-size:11px; font-weight:800; color:${scoreColor}; background:${scoreBg}; padding:2px 8px; border-radius:12px;">${score}/7</span>
                  ${c.fields['Ссылка на запись'] ? `<a href="${c.fields['Ссылка на запись']}" target="_blank" rel="noopener" class="btn btn-secondary btn-compact" style="padding:0 !important; width:28px; height:28px; display:flex; align-items:center; justify-content:center; text-decoration:none;" title="Открыть запись">🎥</a>` : ''}
                  <button class="btn btn-primary btn-compact" onclick="openCallAuditDetailsModal('${c.id}')" style="padding:0 !important; width:28px; height:28px; display:flex; align-items:center; justify-content:center;" title="Открыть аудит ИИ">📝</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Active user selection
  const currentUser = localStorage.getItem('crm_current_user') || '';
  const empOptions = State.employees.map(e => {
    const name = e.fields['Имя'] || '';
    return `<option value="${escHtml(name)}" ${currentUser === name ? 'selected' : ''}>${escHtml(name)}</option>`;
  }).join('');

  const todayStr = getLocalDateString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrow);

  const renderedTaskIds = new Set();

  function parseHistoryDate(dateStr) {
    if (!dateStr) return new Date(0);
    let m = String(dateStr).match(/(\d{2})\.(\d{2})\.(\d{4}),?\s+(\d{2}):(\d{2}):?(\d{2})?/);
    if (m) {
      const hh = parseInt(m[4], 10) || 0;
      const mm = parseInt(m[5], 10) || 0;
      const ss = parseInt(m[6], 10) || 0;
      return new Date(+m[3], +m[2]-1, +m[1], hh, mm, ss);
    }
    m = String(dateStr).match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) {
      return new Date(+m[3], +m[2]-1, +m[1]);
    }
    const d = new Date(dateStr);
    return isNaN(d) ? new Date(0) : d;
  }

  const combinedHistory = [...history];

  // 1. Виртуальные события для выполненных задач без записей в истории
  for (const task of tasks) {
    if (task.done && !task.cancelled) {
      const isReferenced = history.some(h => {
        if (h.taskId === task.id) return true;
        if (h.type === 'task_done' || h.type === 'task_create') {
          const match = String(h.details || '').match(/задача:\s*"(.*?)"/);
          const taskText = match ? match[1] : h.details;
          return taskText === task.text || String(h.details || '').includes(task.text);
        }
        return false;
      });

      if (!isReferenced) {
        let taskDate = '';
        if (task.completedAt) {
          try {
            taskDate = new Date(task.completedAt).toLocaleString('ru-RU');
          } catch(e) {
            taskDate = task.completedAt;
          }
        } else if (task.dueDate) {
          const parts = task.dueDate.split('-');
          taskDate = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}, ${task.dueTime || '12:00'}:00` : task.dueDate;
        }

        combinedHistory.push({
          date: taskDate,
          user: task.user || 'Система',
          type: 'task_done',
          taskId: task.id,
          details: `Выполнена задача: "${task.text}"`,
          isVirtual: true
        });
      }
    }
  }

  // 2. Виртуальные события для активных задач без записей в истории
  for (const task of tasks) {
    if (!task.done && !task.cancelled) {
      const isReferenced = history.some(h => {
        if (h.taskId === task.id) return true;
        if (h.type === 'task_create') {
          const match = String(h.details || '').match(/Создана задача:\s*"(.*?)"/);
          const taskText = match ? match[1] : h.details;
          return taskText === task.text || String(h.details || '').includes(task.text);
        }
        return false;
      });

      if (!isReferenced) {
        let taskDate = '';
        if (task.createdAt) {
          try {
            taskDate = new Date(task.createdAt).toLocaleString('ru-RU');
          } catch(e) {
            taskDate = task.createdAt;
          }
        } else if (task.dueDate) {
          const parts = task.dueDate.split('-');
          taskDate = parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}, ${task.dueTime || '12:00'}:00` : task.dueDate;
        }

        combinedHistory.push({
          date: taskDate,
          user: task.user || 'Система',
          type: 'task_create',
          taskId: task.id,
          details: `Создана задача: "${task.text}"`,
          isVirtual: true
        });
      }
    }
  }

  // Сортируем историю: новые сверху (по убыванию даты)
  combinedHistory.sort((a, b) => parseHistoryDate(b.date) - parseHistoryDate(a.date));

  const timelineHtml = combinedHistory.length === 0
    ? '<div style="color:var(--text2); font-size:13px; font-style:italic; text-align:center; padding:40px 0;">История пуста. Напишите первый комментарий или поставьте задачу!</div>'
    : combinedHistory.map((h) => {
        const isComment = h.type === 'comment_add';
        const isTaskCreate = h.type === 'task_create';
        const isTaskDone = h.type === 'task_done';
        const isStageChange = h.type === 'stage_change';
        
        let icon = '📝';
        let bg = 'rgba(255,255,255,0.02)';
        let border = '1px solid rgba(255,255,255,0.04)';
        
        if (isStageChange) {
          icon = '🔄';
          bg = 'rgba(59,130,246,0.04)';
          border = '1px solid rgba(59,130,246,0.15)';
        } else if (isTaskCreate) {
          icon = '➕';
          bg = 'rgba(245,158,11,0.04)';
          border = '1px solid rgba(245,158,11,0.15)';
        } else if (isTaskDone) {
          icon = '✅';
          bg = 'rgba(16,185,129,0.04)';
          border = '1px solid rgba(16,185,129,0.15)';
        } else if (isComment) {
          icon = '💬';
          bg = 'rgba(99,102,241,0.06)';
          border = '1px solid rgba(99,102,241,0.15)';
        }

        // Render comment in chat style
        if (isComment) {
          const isCurrentUserComment = (h.user === currentUser);
          const alignStyle = isCurrentUserComment 
            ? 'align-self: flex-end; margin-left: 20%; background:rgba(99,102,241,0.15); border-color:rgba(99,102,241,0.3); border-bottom-right-radius:4px;' 
            : 'align-self: flex-start; margin-right: 20%; border-bottom-left-radius:4px;';
          
          let commentText = h.details || '';
          if (commentText.startsWith('Добавлен комментарий: "')) {
            commentText = commentText.replace(/^Добавлен комментарий:\s*"/, '').replace(/"$/, '');
          }
          
          return `
            <div class="timeline-comment-bubble" style="display:flex; flex-direction:column; padding:10px 14px; border-radius:16px; border:1px solid rgba(255,255,255,0.06); margin-bottom:4px; max-width:100%; box-shadow: 0 2px 6px rgba(0,0,0,0.1); ${alignStyle}">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:8px;">
                <span style="font-weight:700; font-size:11px; color:#a5b4fc;">👤 ${escHtml(h.user || '—')}</span>
                <span style="font-size:10px; color:var(--text3);">${escHtml(h.date)}</span>
              </div>
              <div style="font-size:13px; color:#fff; line-height:1.4; word-break:break-word; white-space:pre-wrap;">${escHtml(commentText)}</div>
            </div>
          `;
        }

        // Render task item with interactive checkbox
        if (isTaskCreate) {
          let taskId = h.taskId;
          if (!taskId) {
            // Match legacy task creation in history
            const match = h.details.match(/Создана задача:\s*"(.*?)"/);
            const taskText = match ? match[1] : h.details;
            const foundTask = tasks.find(t => !renderedTaskIds.has(t.id) && (t.text === taskText || h.details.includes(t.text)));
            if (foundTask) {
              taskId = foundTask.id;
              h.taskId = taskId;
            }
          }
          if (taskId) {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              renderedTaskIds.add(task.id);
              if (State.editingTaskId === task.id) {
                return renderInlineTaskEditForm(id, task);
              }
              const isOverdue = !task.done && !task.cancelled && task.dueDate && task.dueDate < todayStr;
              const isToday = !task.done && !task.cancelled && task.dueDate === todayStr;
              const dueClass = task.done ? 'done' : (isOverdue ? 'overdue' : (isToday ? 'today' : 'future'));
              const timeStr = task.dueTime ? ` в ${task.dueTime}` : '';
              
              let dueLabelHtml = '';
              if (task.done) {
                dueLabelHtml = `<span class="task-due done" style="font-weight:700; padding:1px 6px; border-radius:4px; background:rgba(16,185,129,0.15); color:#10b981;">Назначено на: ${formatDate(task.dueDate)}${timeStr}${task.completedAt ? ` | Выполнено: ${task.completedAt}` : ''}</span>`;
              } else {
                const statusLabel = isOverdue ? 'Просрочено' : (isToday ? 'Сегодня' : 'Предстоит');
                dueLabelHtml = `<span class="task-due ${dueClass}" style="font-weight:700; padding:1px 6px; border-radius:4px;">${statusLabel}: ${formatDate(task.dueDate)}${timeStr}</span>`;
              }
              
              return `
                <div class="timeline-task-card" style="background:${bg}; border:${border}; border-radius:12px; padding:12px; margin-bottom:4px; display:flex; gap:10px; align-items:flex-start; box-shadow: 0 2px 6px rgba(0,0,0,0.1); align-self: stretch; position:relative;">
                  ${task.cancelled ? 
                    `<span onclick="toggleTaskCancelled('${id}', '${task.id}')" style="margin-top:2px; font-size:14px; cursor:pointer; flex-shrink:0; width:16px; height:16px; display:flex; align-items:center; justify-content:center; color:#ef4444;" title="Восстановить задачу">❌</span>` :
                    `<input type="checkbox" class="task-checkbox" ${task.done ? 'checked' : ''} onclick="toggleTaskDone('${id}', '${task.id}')" style="margin-top:2px; width:16px; height:16px; cursor:pointer; flex-shrink:0;">`
                  }
                  <div style="flex:1; padding-right:20px;">
                    <div style="font-size:13px; font-weight:600; color:#fff; ${(task.done || task.cancelled) ? 'text-decoration:line-through; opacity:0.5;' : ''}">${escHtml(task.text)}</div>
                    ${task.cancelled ? '' : `
                      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:6px; font-size:10px;">
                        <span style="color:var(--text2)">👤 ${escHtml(task.user || '—')}</span>
                        ${dueLabelHtml}
                        ${task.duration ? `<span style="color:var(--text3)">⏱ ${task.duration} мин</span>` : ''}
                      </div>
                    `}
                  </div>
                  <div style="position:absolute; right:12px; top:12px; display:flex; gap:6px; align-items:center;">
                    ${!task.cancelled ? `
                      <span onclick="startEditTask('${task.id}')" style="font-size:12px; cursor:pointer; opacity:0.4; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.4" title="Редактировать задачу">✏️</span>
                      <span onclick="toggleTaskCancelled('${id}', '${task.id}')" style="font-size:11px; cursor:pointer; opacity:0.4; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.4" title="Отменить задачу">❌</span>
                    ` : ''}
                  </div>
                </div>
              `;
            }
          }
        }

        if (isTaskDone) {
          let taskId = h.taskId;
          if (!taskId) {
            const match = h.details.match(/Выполнена задача:\s*"(.*?)"/);
            const taskText = match ? match[1] : h.details;
            const foundTask = tasks.find(t => !renderedTaskIds.has(t.id) && (t.text === taskText || h.details.includes(t.text)));
            if (foundTask) {
              taskId = foundTask.id;
              h.taskId = taskId;
            }
          }
          if (taskId) {
            const task = tasks.find(t => t.id === taskId);
            if (task && !renderedTaskIds.has(task.id)) {
              renderedTaskIds.add(task.id);
              const timeStr = task.dueTime ? ` в ${task.dueTime}` : '';
              return `
                <div class="timeline-task-card" style="background:${bg}; border:${border}; border-radius:12px; padding:12px; margin-bottom:4px; display:flex; gap:10px; align-items:flex-start; box-shadow: 0 2px 6px rgba(0,0,0,0.1); align-self: stretch; position:relative;">
                  <input type="checkbox" class="task-checkbox" checked onclick="toggleTaskDone('${id}', '${task.id}')" style="margin-top:2px; width:16px; height:16px; cursor:pointer; flex-shrink:0;">
                  <div style="flex:1; padding-right:20px;">
                    <div style="font-size:13px; font-weight:600; color:#fff; text-decoration:line-through; opacity:0.5;">${escHtml(task.text)}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:6px; font-size:10px;">
                      <span style="color:var(--text2)">👤 ${escHtml(h.user || task.user || '—')}</span>
                      <span class="task-due done" style="font-weight:700; padding:1px 6px; border-radius:4px; background:rgba(16,185,129,0.15); color:#10b981;">Назначено на: ${formatDate(task.dueDate)}${timeStr}${task.completedAt ? ` | Выполнено: ${task.completedAt}` : ''}</span>
                    </div>
                  </div>
                  <div style="position:absolute; right:12px; top:12px; display:flex; gap:6px; align-items:center;">
                    ${!task.cancelled ? `
                      <span onclick="startEditTask('${task.id}')" style="font-size:12px; cursor:pointer; opacity:0.4; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.4" title="Редактировать задачу">✏️</span>
                      <span onclick="toggleTaskCancelled('${id}', '${task.id}')" style="font-size:11px; cursor:pointer; opacity:0.4; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.4" title="Отменить задачу">❌</span>
                    ` : ''}
                  </div>
                </div>
              `;
            }
          }
        }

        // Standard history item
        return `
          <div class="timeline-history-item" style="background:${bg}; border:${border}; border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; gap:4px; font-size:12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom:4px; align-self: stretch;">
            <div style="display:flex; justify-content:space-between; align-items:center; color:var(--text2);">
              <span style="font-weight:700;">${icon} ${escHtml(h.user || '—')}</span>
              <span style="font-size:10px; color:var(--text3);">${escHtml(h.date)}</span>
            </div>
            <div style="color:var(--text1); line-height:1.4; white-space:pre-wrap;">${escHtml(h.details)}</div>
          </div>
        `;
      }).join('');

  // Active tasks rendering (legacy or new, as long as they are not done/cancelled)
  const activeTasks = tasks.filter(t => !t.done && !t.cancelled);
  let activeTasksHtml = '';
  if (activeTasks.length > 0) {
    activeTasksHtml = `
      <div class="active-tasks-section" style="margin-bottom:12px; align-self: stretch;">
        <div style="font-size:12px; font-weight:800; color:var(--text2); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">📋 Активные задачи (${activeTasks.length})</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${activeTasks.map(task => {
            if (State.editingTaskId === task.id) {
              return renderInlineTaskEditForm(id, task);
            }
            const isOverdue = task.dueDate && task.dueDate < todayStr;
            const isToday = task.dueDate === todayStr;
            const dueClass = isOverdue ? 'overdue' : (isToday ? 'today' : 'future');
            const timeStr = task.dueTime ? ` в ${task.dueTime}` : '';
            const statusLabel = isOverdue ? 'Просрочено' : (isToday ? 'Сегодня' : 'Предстоит');
            
            return `
              <div class="timeline-task-card" style="background:rgba(245,158,11,0.04); border:1px solid rgba(245,158,11,0.15); border-radius:12px; padding:12px; display:flex; gap:10px; align-items:flex-start; box-shadow: 0 2px 6px rgba(0,0,0,0.1); position:relative; align-self:stretch;">
                <input type="checkbox" class="task-checkbox" onclick="toggleTaskDone('${id}', '${task.id}')" style="margin-top:2px; width:16px; height:16px; cursor:pointer; flex-shrink:0;">
                <div style="flex:1; padding-right:20px;">
                  <div style="font-size:13px; font-weight:600; color:#fff;">${escHtml(task.text)}</div>
                  <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:6px; font-size:10px;">
                    <span style="color:var(--text2)">👤 ${escHtml(task.user || '—')}</span>
                    <span class="task-due ${dueClass}" style="font-weight:700; padding:1px 6px; border-radius:4px;">${statusLabel}: ${formatDate(task.dueDate)}${timeStr}</span>
                    ${task.duration ? `<span style="color:var(--text3)">⏱ ${task.duration} мин</span>` : ''}
                  </div>
                </div>
                <div style="position:absolute; right:12px; top:12px; display:flex; gap:6px; align-items:center;">
                  <span onclick="startEditTask('${task.id}')" style="font-size:12px; cursor:pointer; opacity:0.4; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.4" title="Редактировать задачу">✏️</span>
                  <span onclick="toggleTaskCancelled('${id}', '${task.id}')" style="font-size:11px; cursor:pointer; opacity:0.4; transition:opacity 0.2s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.4" title="Отменить задачу">❌</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; height: 100%; box-sizing: border-box;">
      
      <!-- Top form section: User & Add Task -->
      <div style="padding:12px; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0;">
        <div class="user-selector-container" style="margin-bottom:10px; display:flex; align-items:center; gap:8px;">
          <span style="font-weight:700; font-size:13px; color:var(--text2);">Кто делает:</span>
          <select id="lead-current-user" class="form-select compact-input" style="flex:1; padding:4px 8px !important; height:28px !important; font-size:12px !important; margin:0;" onchange="localStorage.setItem('crm_current_user', this.value)">
            <option value="">— Выберите себя —</option>
            ${empOptions}
          </select>
        </div>

        <div style="padding:10px; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid rgba(255,255,255,0.04)">
          <div style="font-size:11px; font-weight:700; color:var(--text2); margin-bottom:6px; display:flex; align-items:center; gap:4px;">📌 Поставить задачу с напоминанием:</div>
          <div style="display:flex; gap:6px; margin-bottom:6px;">
            <select id="ei-new-task-type" class="form-select compact-input" style="width:110px; padding:4px 8px !important; height:28px !important; font-size:12px !important; margin:0;" onchange="onNewTaskTypeChange(this.value)">
              <option value="call" selected>Звонок</option>
              <option value="consult">Консультация</option>
              <option value="task">Задача</option>
            </select>
            <input type="text" id="ei-new-task-text" class="form-input compact-input" placeholder="Что нужно напомнить..." value="Связаться с клиентом" style="flex:1; margin:0; min-height: unset !important; height:28px !important; font-size:12px !important; padding:2px 8px !important;">
          </div>
          <div class="inline-form-row" style="display:flex; gap:6px; align-items:center;">
            <input type="date" id="ei-new-task-date" class="form-input compact-input" value="${tomorrowStr}" onclick="try{this.showPicker()}catch(e){}" style="flex:1; height:28px !important; font-size:12px !important; padding:2px 6px !important;">
            <input type="time" id="ei-new-task-time" class="form-input compact-input" value="12:00" onclick="try{this.showPicker()}catch(e){}" style="width:80px; height:28px !important; font-size:12px !important; padding:2px 6px !important;" title="Время напоминания">
            <input type="number" id="ei-new-task-duration" class="form-input compact-input" value="30" style="width:55px; height:28px !important; font-size:12px !important; padding:2px 6px !important;" title="Длительность (мин)" placeholder="мин">
            <button class="btn btn-save-compact" onclick="addLeadTask('${id}')" style="padding:4px 10px !important; font-size:12px !important; height:28px !important; margin:0; line-height:1;">Поставить</button>
          </div>
        </div>
      </div>

      ${callsHtml}

      <!-- Scrolling timeline section -->
      <div style="flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px;" id="lead-timeline-scroller">
        ${activeTasksHtml}
        <div style="font-size:12px; font-weight:800; color:var(--text2); text-transform:uppercase; letter-spacing:0.05em; display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; flex-shrink:0;">
          <span>📜 Лента активности</span>
          <span style="font-size:10px; font-weight:600; text-transform:none; color:var(--text3);">${history.length} событий</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${timelineHtml}
        </div>
      </div>

      <!-- Bottom Chat comment field -->
      <div style="padding:10px 12px; border-top:1px solid rgba(255,255,255,0.06); flex-shrink:0; background:rgba(0,0,0,0.15);">
        <div style="display:flex; gap:8px; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:2px 6px 2px 14px;">
          <textarea id="ei-new-comment" class="form-input compact-input" placeholder="Написать комментарий в историю..." style="flex:1; border:none !important; background:none !important; padding:6px 0 !important; margin:0 !important; height:28px !important; min-height:28px !important; max-height:80px; resize:none; font-size:13px; color:#fff; outline:none; line-height:1.4;" onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); addLeadComment('${id}'); }"></textarea>
          <button class="chat-send-btn" onclick="addLeadComment('${id}')" style="background:var(--primary); color:#fff; border:none; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s; padding:0; flex-shrink:0; font-size:11px;">
            ✈️
          </button>
        </div>
      </div>

    </div>
  `;

  // Auto-scroll timeline to top
  const scroller = document.getElementById('lead-timeline-scroller');
  if (scroller) scroller.scrollTop = 0;
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
    details: text
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

function renderLeadPaymentsBlock(lead) {
  if (!lead) return '';
  // Бюджет = из проекта (Стоимость заказа), фолбек — поле Бюджет на лиде
  const projectPrice = getLeadProjectPrice(lead);
  const budget = projectPrice || Number(lead.fields['Бюджет']) || 0;
  const paid = calculateLeadPayments(lead);
  const remaining = budget - paid;
  const pct = budget > 0 ? Math.min(Math.round((paid / budget) * 100), 100) : 0;
  const barColor = pct >= 100 ? '#34d399' : pct >= 50 ? '#f59e0b' : '#6366f1';
  const payments = getLeadPaymentsList(lead);

  const paymentRows = payments.length > 0
    ? payments.map(p => {
        const f = p.fields;
        const catName = f['Категория'] || '—';
        const accName = f['Источник'] || '—';
        const txId = f['ID транзакции'] || '';
        const dateStr = f['Дата транзакции'] ? f['Дата транзакции'].substring(0,10) : '—';
        const amt = Number(f['Сумма']) || 0;
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div>
              <div style="font-size:12px; font-weight:700; color:#34d399;">+${amt.toLocaleString('ru-RU')} ₸</div>
              <div style="font-size:11px; color:var(--text2); margin-top:2px;">${dateStr} · ${escHtml(catName)} · ${escHtml(accName)}</div>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              ${txId ? `<span style="font-size:10px; color:var(--text2);">#${txId}</span>` : ''}
              <button onclick="openFinanceFromLead('${p.id}')" style="background:none; border:none; color:#6366f1; cursor:pointer; font-size:12px; padding:2px 6px;" title="Открыть в финансах">↗️</button>
            </div>
          </div>`;
      }).join('')
    : `<div style="font-size:12px; color:var(--text2); padding:8px 0;">Платежей ещё нет</div>`;

  return `
    <div style="margin-bottom:12px;">
      <div class="section-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span>💰 Платежи</span>
        <button onclick="openAddPaymentFromLead('${lead.id}')" style="background:linear-gradient(135deg,#10b981,#059669); border:none; color:#fff; border-radius:8px; padding:4px 10px; font-size:11px; font-weight:700; cursor:pointer;">+ Добавить</button>
      </div>
      <div style="background:var(--surface2); border-radius:10px; padding:12px; border:1px solid rgba(255,255,255,0.06);">
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:10px;">
          <div>
            <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; margin-bottom:2px;">Бюджет</div>
            <div style="font-size:14px; font-weight:800; color:#fff;">${budget.toLocaleString('ru-RU')} ₸</div>
          </div>
          <div>
            <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; margin-bottom:2px;">Оплачено</div>
            <div style="font-size:14px; font-weight:800; color:#34d399;">${paid.toLocaleString('ru-RU')} ₸</div>
          </div>
          <div>
            <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; margin-bottom:2px;">Остаток</div>
            <div style="font-size:14px; font-weight:800; color:${remaining > 0 ? '#f59e0b' : '#34d399'};">${remaining > 0 ? remaining.toLocaleString('ru-RU') + ' ₸' : '✅ Закрыто'}</div>
          </div>
        </div>
        ${budget > 0 ? `
        <div style="background:rgba(255,255,255,0.06); border-radius:6px; height:6px; overflow:hidden; margin-bottom:10px;">
          <div style="height:6px; border-radius:6px; background:${barColor}; width:${pct}%; transition:width 0.4s;"></div>
        </div>` : ''}
        ${paymentRows}
      </div>
    </div>`;
}
window.renderLeadPaymentsBlock = renderLeadPaymentsBlock;

function openFinanceFromLead(incomeId) {
  navigate('finance');
  setTimeout(() => {
    const el = document.getElementById('finance-search-input');
    if (el) {
      // Ищем по ID транзакции
      const inc = State.financeIncomes.find(i => i.id === incomeId);
      if (inc) {
        el.value = inc.fields['Примечание'] || '';
        onFinanceSearch();
      }
    }
  }, 1500);
}
window.openFinanceFromLead = openFinanceFromLead;

async function openAddPaymentFromLead(leadId) {
  const lead = State.leads.find(l => l.id === leadId);
  if (!lead) return;
  await openAddOperationMenu();
  // Выставляем тип Доходы и привязываем лид
  const typeSelect = document.getElementById('uni-op-type');
  if (typeSelect) { typeSelect.value = 'Доходы'; onUnifiedOpTypeChange('Доходы'); }
  document.getElementById('uni-lead-id').value = leadId;
  setUnifiedOpTypeEnabled(false);
  // Предзаполняем сумму из остатка
  const paid = calculateLeadPayments(lead);
  const remaining = (Number(lead.fields['Бюджет']) || 0) - paid;
  if (remaining > 0) document.getElementById('uni-amount').value = remaining;
  // Показываем привязку лида
  showLeadLinkInForm(lead);
}
window.openAddPaymentFromLead = openAddPaymentFromLead;

function showLeadLinkInForm(lead) {
  const group = document.getElementById('uni-lead-link-group');
  const selectedEl = document.getElementById('uni-lead-selected');
  const nameEl = document.getElementById('uni-lead-selected-name');
  if (group) group.style.display = 'block';
  if (selectedEl) { selectedEl.style.display = 'flex'; }
  if (nameEl) nameEl.textContent = '🎯 ' + (lead.fields['Имя'] || lead.id);
  const searchEl = document.getElementById('uni-lead-search');
  if (searchEl) searchEl.style.display = 'none';
}
window.showLeadLinkInForm = showLeadLinkInForm;

function calculateLeadPayments(lead) {
  if (!lead) return 0;

  // Метод 1: через link_row Проекты (LEADS.Проекты → DEALS)
  const leadProjectIds = new Set();
  const projectIdStr = String(lead.fields['Проекты ID'] || '');
  projectIdStr.split(',').map(x => x.trim()).filter(Boolean).forEach(id => leadProjectIds.add(id));

  let total = 0;

  if (leadProjectIds.size > 0) {
    // Суммируем доходы где Заказ ID = один из проектов лида
    const byProject = (State.financeIncomes || []).filter(inc => {
      const zakazId = String(inc.fields['Заказ ID'] || inc.fields['Заказ'] || '');
      return zakazId && leadProjectIds.has(zakazId.split(',')[0].trim());
    });
    total += byProject.reduce((sum, inc) => sum + (Number(inc.fields['Сумма']) || 0), 0);
  }

  // Метод 2: прямая связь через Лид ID (для операций добавленных вручную без проекта)
  const byLeadId = (State.financeIncomes || []).filter(inc => {
    const lid = String(inc.fields['Лид ID'] || '');
    if (!lid || lid === String(lead.id)) return false;
    // Не считаем дважды если уже учтён через проект
    const zakazId = String(inc.fields['Заказ ID'] || '');
    return lid === String(lead.id) && (!zakazId || !leadProjectIds.has(zakazId.split(',')[0].trim()));
  });
  // Исправляем — прямая привязка
  const byLeadIdDirect = (State.financeIncomes || []).filter(inc =>
    String(inc.fields['Лид ID'] || '') === String(lead.id)
  );
  // Берём уникальные (не дублируем)
  const counted = new Set(leadProjectIds.size > 0
    ? (State.financeIncomes || []).filter(inc => {
        const zakazId = String(inc.fields['Заказ ID'] || '').split(',')[0].trim();
        return zakazId && leadProjectIds.has(zakazId);
      }).map(i => i.id)
    : []);
  const additionalByLead = byLeadIdDirect.filter(inc => !counted.has(inc.id));
  total += additionalByLead.reduce((sum, inc) => sum + (Number(inc.fields['Сумма']) || 0), 0);

  return total;
}

function getLeadProjectPrice(lead) {
  if (!lead) return 0;
  const ids = String(lead.fields['Проекты ID'] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!ids.length) return 0;
  return (State.deals || [])
    .filter(d => ids.includes(String(d.id)))
    .reduce((sum, d) => sum + (Number(d.fields['Стоимость заказа']) || 0), 0);
}

function getLeadPaymentsList(lead) {
  if (!lead) return [];
  const byLeadId = (State.financeIncomes || []).filter(inc =>
    String(inc.fields['Лид ID'] || '') === String(lead.id)
  );
  return byLeadId.sort((a, b) => {
    const da = a.fields['Дата транзакции'] || '';
    const db = b.fields['Дата транзакции'] || '';
    return db.localeCompare(da);
  });
}

function getSyncedConsultationFields(tasks) {
  const activeTasks = tasks.filter(t => (t.type === 'consult' || t.type === 'call') && !t.cancelled);
  if (activeTasks.length > 0) {
    // Сортируем: сначала невыполненные, затем выполненные, по типу (consult в приоритете), по дате
    activeTasks.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.type !== b.type) {
        if (a.type === 'consult') return -1;
        if (b.type === 'consult') return 1;
      }
      const dateA = a.dueDate + 'T' + (a.dueTime || '00:00');
      const dateB = b.dueDate + 'T' + (b.dueTime || '00:00');
      return dateA.localeCompare(dateB);
    });
    const primaryTask = activeTasks[0];
    
    // Преобразуем YYYY-MM-DD в DD.MM.YYYY для базы данных
    let dbDate = primaryTask.dueDate;
    const m = String(primaryTask.dueDate).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) dbDate = `${m[3]}.${m[2]}.${m[1]}`;
    
    return {
      'Дата консультации': dbDate,
      'Время консультации': primaryTask.dueTime || '',
      'Консультация проведена': primaryTask.done,
      'Длительность': primaryTask.duration || 30
    };
  } else {
    return {
      'Дата консультации': null,
      'Время консультации': null,
      'Консультация проведена': false,
      'Длительность': null
    };
  }
}

async function addLeadTask(id) {
  const textEl = document.getElementById('ei-new-task-text');
  const dateEl = document.getElementById('ei-new-task-date');
  const timeEl = document.getElementById('ei-new-task-time');
  const typeEl = document.getElementById('ei-new-task-type');
  const durationEl = document.getElementById('ei-new-task-duration');
  const text = textEl?.value.trim();
  const dueDate = dateEl?.value;
  const dueTime = timeEl?.value || '12:00';
  const taskType = typeEl?.value || 'call';
  const duration = durationEl ? (Number(durationEl.value) || 30) : 30;

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
    type: taskType,
    dueDate: dueDate,
    dueTime: dueTime,
    duration: duration,
    done: false,
    createdAt: dateStr,
    completedAt: '',
    user: currentUser
  };
  if (taskType === 'consult') {
    const assignDateVal = lead.fields['Дата назначения'] || lead.fields['Дата'] || getLocalDateString();
    newTask.assignedDate = convertDbDateToYmd(assignDateVal) || getLocalDateString();
  }
  tasks.push(newTask);

  const history = safeJsonParse(lead.fields['История'] || '[]');
  history.unshift({
    date: dateStr,
    user: currentUser,
    type: 'task_create',
    taskId: newTask.id,
    details: text
  });

  const updates = {
    'Задачи': JSON.stringify(tasks),
    'История': JSON.stringify(history)
  };
  const synced = getSyncedConsultationFields(tasks);
  Object.assign(updates, synced);

  textEl.value = '';
  dateEl.value = '';
  if (timeEl) timeEl.value = '12:00';
  if (durationEl) durationEl.value = '30';

  try {
    await Airtable.update(CONFIG.TABLES.LEADS, id, updates);
    Object.assign(lead.fields, updates);
    renderLeadMiddleColumn(lead);
    renderKanban(State.leads);
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
  if (task.done) {
    task.cancelled = false;
  }
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
  const synced = getSyncedConsultationFields(tasks);
  Object.assign(updates, synced);

  try {
    await Airtable.update(CONFIG.TABLES.LEADS, leadId, updates);
    Object.assign(lead.fields, updates);
    renderLeadMiddleColumn(lead);
    renderKanban(State.leads);
    toast(task.done ? 'Задача выполнена ✓' : 'Задача возвращена в работу');
  } catch (e) {
    toast('Ошибка обновления задачи: ' + e.message, 'error');
  }
}

async function toggleTaskCancelled(leadId, taskId) {
  const lead = State.leads.find(l => l.id === leadId);
  if (!lead) return;

  const currentUser = localStorage.getItem('crm_current_user') || 'Система';
  const dateStr = new Date().toLocaleString('ru-RU');

  const tasks = safeJsonParse(lead.fields['Задачи'] || '[]');
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  task.cancelled = !task.cancelled;
  if (task.cancelled) {
    task.done = false;
    task.completedAt = '';
  }

  const history = safeJsonParse(lead.fields['История'] || '[]');
  history.unshift({
    date: dateStr,
    user: currentUser,
    type: 'task_cancelled',
    details: task.cancelled ? `Отменена задача: "${task.text}"` : `Задача возвращена в работу (после отмены): "${task.text}"`
  });

  const updates = {
    'Задачи': JSON.stringify(tasks),
    'История': JSON.stringify(history)
  };
  const synced = getSyncedConsultationFields(tasks);
  Object.assign(updates, synced);

  try {
    await Airtable.update(CONFIG.TABLES.LEADS, leadId, updates);
    Object.assign(lead.fields, updates);
    renderLeadMiddleColumn(lead);
    renderKanban(State.leads);
    toast(task.cancelled ? 'Задача отменена' : 'Задача возвращена в работу');
  } catch (e) {
    toast('Ошибка обновления задачи: ' + e.message, 'error');
  }
}

function onNewTaskTypeChange(type) {
  const textEl = document.getElementById('ei-new-task-text');
  if (!textEl) return;
  if (type === 'call') {
    textEl.value = 'Связаться с клиентом';
  } else if (type === 'consult') {
    textEl.value = 'Провести консультацию';
  } else {
    textEl.value = '';
  }
}

function renderInlineTaskEditForm(leadId, task) {
  return `
    <div class="timeline-task-card edit-mode" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:8px; align-self:stretch; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
      <div style="font-size:11px; font-weight:700; color:var(--text2); display:flex; justify-content:space-between;">
        <span>✏️ Редактирование задачи</span>
      </div>
      <div style="display:flex; gap:6px;">
        <select id="ei-edit-task-type-${task.id}" class="form-select compact-input" style="width:110px; padding:4px 8px !important; height:28px !important; font-size:12px !important; margin:0;">
          <option value="call" ${task.type === 'call' ? 'selected' : ''}>Звонок</option>
          <option value="consult" ${task.type === 'consult' ? 'selected' : ''}>Консультация</option>
          <option value="task" ${task.type === 'task' ? 'selected' : ''}>Задача</option>
        </select>
        <input type="text" id="ei-edit-task-text-${task.id}" class="form-input compact-input" value="${escHtml(task.text)}" style="flex:1; margin:0; height:28px !important; font-size:12px !important; padding:2px 8px !important;">
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <input type="date" id="ei-edit-task-date-${task.id}" class="form-input compact-input" value="${task.dueDate}" onclick="try{this.showPicker()}catch(e){}" style="flex:1; height:28px !important; font-size:12px !important; padding:2px 6px !important;">
        <input type="time" id="ei-edit-task-time-${task.id}" class="form-input compact-input" value="${task.dueTime || '12:00'}" onclick="try{this.showPicker()}catch(e){}" style="width:80px; height:28px !important; font-size:12px !important; padding:2px 6px !important;">
        <input type="number" id="ei-edit-task-duration-${task.id}" class="form-input compact-input" value="${task.duration || 30}" style="width:55px; height:28px !important; font-size:12px !important; padding:2px 6px !important;" title="Длительность (мин)" placeholder="мин">
      </div>
      <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:4px;">
        <button class="btn btn-secondary btn-compact" onclick="cancelEditTask()" style="padding:4px 10px !important; font-size:11px !important; height:24px !important; margin:0; line-height:1;">Отмена</button>
        <button class="btn btn-save-compact" onclick="saveEditTask('${leadId}', '${task.id}')" style="padding:4px 10px !important; font-size:11px !important; height:24px !important; margin:0; line-height:1; background:var(--primary); color:#fff; border:none;">Сохранить</button>
      </div>
    </div>
  `;
}

function startEditTask(taskId) {
  State.editingTaskId = taskId;
  const lead = State.leads.find(l => {
    const tasks = safeJsonParse(l.fields['Задачи'] || '[]');
    return Array.isArray(tasks) && tasks.some(t => t.id === taskId);
  });
  if (lead) {
    renderLeadMiddleColumn(lead);
  }
}

function cancelEditTask() {
  State.editingTaskId = null;
  if (window._activeLeadId) {
    const lead = State.leads.find(l => l.id === window._activeLeadId);
    if (lead) {
      renderLeadMiddleColumn(lead);
    }
  }
}

async function saveEditTask(leadId, taskId) {
  const lead = State.leads.find(l => l.id === leadId);
  if (!lead) return;

  const typeEl = document.getElementById(`ei-edit-task-type-${taskId}`);
  const textEl = document.getElementById(`ei-edit-task-text-${taskId}`);
  const dateEl = document.getElementById(`ei-edit-task-date-${taskId}`);
  const timeEl = document.getElementById(`ei-edit-task-time-${taskId}`);
  const durationEl = document.getElementById(`ei-edit-task-duration-${taskId}`);

  const taskType = typeEl?.value || 'call';
  const text = textEl?.value.trim();
  const dueDate = dateEl?.value;
  const dueTime = timeEl?.value || '12:00';
  const duration = durationEl ? (Number(durationEl.value) || 30) : 30;

  if (!text) { toast('Введите текст задачи', 'error'); return; }
  if (!dueDate) { toast('Выберите срок выполнения', 'error'); return; }

  const tasks = safeJsonParse(lead.fields['Задачи'] || '[]');
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const currentUser = localStorage.getItem('crm_current_user') || 'Система';
  const dateStr = new Date().toLocaleString('ru-RU');

  // Логируем изменения задачи в историю
  const changes = [];
  if (task.text !== text) changes.push(`текст: «${task.text}» → «${text}»`);
  if (task.type !== taskType) changes.push(`тип: «${task.type}» → «${taskType}»`);
  if (task.dueDate !== dueDate) changes.push(`дата: «${task.dueDate}» → «${dueDate}»`);
  if (task.dueTime !== dueTime) changes.push(`время: «${task.dueTime || '—'}» → «${dueTime}»`);
  if (task.duration !== duration) changes.push(`длительность: «${task.duration || '—'}» → «${duration} мин»`);

  task.text = text;
  task.type = taskType;
  task.dueDate = dueDate;
  task.dueTime = dueTime;
  task.duration = duration;

  const history = safeJsonParse(lead.fields['История'] || '[]');
  if (changes.length > 0) {
    history.unshift({
      date: dateStr,
      user: currentUser,
      type: 'task_edit',
      taskId: taskId,
      details: `Редактирована задача: ${changes.join(', ')}`
    });
  }

  const updates = {
    'Задачи': JSON.stringify(tasks),
    'История': JSON.stringify(history)
  };
  
  const synced = getSyncedConsultationFields(tasks);
  Object.assign(updates, synced);

  try {
    await Airtable.update(CONFIG.TABLES.LEADS, leadId, updates);
    Object.assign(lead.fields, updates);
    
    State.editingTaskId = null;
    
    renderLeadMiddleColumn(lead);
    renderKanban(State.leads);
    
    if (typeof renderCalendar === 'function') {
      renderCalendar();
    }
    
    toast('Задача обновлена ✓');
    if (typeof syncGoogleCalendarEvent === 'function') {
      syncGoogleCalendarEvent(lead).catch(console.error);
    }
  } catch (e) {
    toast('Ошибка обновления задачи: ' + e.message, 'error');
  }
}

// Expose these functions to window context
window.addLeadComment = addLeadComment;
window.addLeadTask = addLeadTask;
window.toggleTaskDone = toggleTaskDone;
window.toggleTaskCancelled = toggleTaskCancelled;
window.onNewTaskTypeChange = onNewTaskTypeChange;
window.startEditTask = startEditTask;
window.cancelEditTask = cancelEditTask;
window.saveEditTask = saveEditTask;

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
  window._activeLeadId = id; // Запоминаем ID активного лида
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
    
    <!-- HEADER BAR: Title and status -->
    <div class="drawer-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:12px; margin-bottom:12px; flex-wrap: wrap; gap:10px; padding-right: 40px;">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <h3 class="drawer-title" style="margin:0; font-size:18px; font-weight:800; color:#fff;">🎯 ${name}</h3>
        <div>${statusBadge(stage)}</div>
        <button id="ei-undo-btn" class="btn btn-secondary btn-compact" style="display:none; align-items:center; gap:6px; font-weight:700; background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.3); color: #a5b4fc; padding: 4px 10px; height: auto;" onclick="document.activeElement?.blur(); setTimeout(() => undoLeadEdit('${id}'), 50);" title="Отменить последнее изменение (Cmd+Z)">↩️ Отменить</button>
      </div>
    </div>

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
            <label class="form-label">Ниша</label>
            <input class="form-input compact-input" id="ei-niche" placeholder="Введите нишу клиента" value="${escHtml(f['Ниша']||'')}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Бюджет (₸)</label>
            <input class="form-input compact-input" id="ei-budget" type="number" placeholder="0" value="${escHtml(String(f['Бюджет']||''))}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Оплачено (₸)</label>
            <input class="form-input compact-input" id="ei-paid" type="number" placeholder="0" value="${calculateLeadPayments(lead)}" readonly disabled style="background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.06); cursor: not-allowed; color: #a5b4fc; font-weight: 700;"/>
          </div>
          <div class="form-group">
            <label class="form-label">Менеджер</label>
            <select class="form-select compact-input" id="ei-manager">
              <option value="">— не назначен —</option>
              ${empOptions}
            </select>
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

        <!-- Payments block -->
        ${renderLeadPaymentsBlock(lead)}

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

  // Настройка автосохранения при выходе из поля или изменении
  const attachAutoSave = (selector, eventType = 'blur') => {
    const el = document.getElementById(selector);
    if (el) {
      el.addEventListener(eventType, () => {
        saveLeadEdit(id, true);
      });
    }
  };

  attachAutoSave('ei-name', 'blur');
  attachAutoSave('ei-phone', 'blur');
  attachAutoSave('ei-instagram', 'blur');
  attachAutoSave('ei-source', 'blur');
  attachAutoSave('ei-niche', 'blur');
  attachAutoSave('ei-budget', 'blur');
  attachAutoSave('ei-manager', 'change');
  attachAutoSave('ei-record-link', 'blur');
  attachAutoSave('ei-nontarget-reason', 'change');
  attachAutoSave('ei-comment', 'blur');
  updateUndoButtonVisibility(id);
}

// ─── Сохранить редактирование лида
async function saveLeadEdit(id, silent = false) {
  const lead = State.leads.find(l => l.id === id); if (!lead) return;
  const stageField = getStageFieldName(lead.fields);
  const empId  = document.getElementById('ei-manager')?.value;
  const emp    = empId ? State.employees.find(e => e.id === empId) : null;
  
  const niche = document.getElementById('ei-niche')?.value.trim() || '';

  const fields = {
    'Имя':     document.getElementById('ei-name')?.value.trim()   || '',
    'Телефон': document.getElementById('ei-phone')?.value.trim()  || '',
    'Источник':document.getElementById('ei-source')?.value.trim() || '',
    'Ниша':    niche,
    'Комментарий': document.getElementById('ei-comment')?.value.trim() || '',
  };
  
  const currentStage = lead.fields[stageField] || 'Новая заявка';
  const stagesOrdered = FUNNEL_STAGES.map(s => s.key);
  const stageIdx = stagesOrdered.indexOf(currentStage);
  const consultIdx = stagesOrdered.indexOf('Консультация назначена');
  const hasManager = emp || lead.fields['Менеджер'];
  if (!lead.fields['Дата назначения'] && stageIdx >= consultIdx && hasManager) {
    fields['Дата назначения'] = new Date().toLocaleDateString('ru-RU');
  }
  
  const budget = Number(document.getElementById('ei-budget')?.value);
  const calculatedPaid = calculateLeadPayments(lead);
  const nonTargetEl = document.getElementById('ei-nontarget-reason');
  const recordLink = document.getElementById('ei-record-link')?.value.trim() || null;
  const instagram  = document.getElementById('ei-instagram')?.value.trim() || null;
  if (budget) fields['Бюджет'] = budget; else fields['Бюджет'] = null;
  fields['Оплата'] = calculatedPaid > 0 ? calculatedPaid : null;
  fields['Менеджер'] = empId ? empId : [];
  if (nonTargetEl) fields['Причина: Не целевой'] = nonTargetEl.value || null;
  fields['Ссылка на запись'] = recordLink;
  fields['Instagram'] = instagram;

  // ─── Логируем изменения полей в историю
  const changedFieldsList = [];
  const fieldsToCheck = [
    { key: 'Имя',                    label: 'Имя' },
    { key: 'Телефон',                label: 'Телефон' },
    { key: 'Источник',               label: 'Источник' },
    { key: 'Ниша',                   label: 'Ниша' },
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

  if (changedFieldsList.length === 0) return;

  // Сохраняем снимок перед применением изменений для отмены по Cmd+Z
  const snapshot = {};
  const fieldsToSnap = ['Имя', 'Телефон', 'Источник', 'Ниша', 'Комментарий', 'Бюджет', 'Менеджер', 'Причина: Не целевой', 'Ссылка на запись', 'Instagram', 'История', 'Дата назначения'];
  for (const key of fieldsToSnap) {
    snapshot[key] = lead.fields[key] !== undefined ? JSON.parse(JSON.stringify(lead.fields[key])) : null;
  }
  LeadUndoStack.push({ leadId: id, fields: snapshot });
  if (LeadUndoStack.length > 50) {
    LeadUndoStack.shift();
  }

  try {
    await Airtable.update(CONFIG.TABLES.LEADS, id, fields);
    Object.assign(lead.fields, fields);
    lead.fields['Менеджер'] = emp ? (emp.fields['Имя'] || '') : '';

    renderKanban(State.leads);
    renderLeadsStats();
    renderLeadMiddleColumn(lead);
    updateUndoButtonVisibility(id);
    if (!silent) {
      toast('Изменения сохранены ✓');
    }
    syncGoogleCalendarEvent(lead).catch(console.error);
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

async function assignLeadManager(leadId, employeeId) {
  closeAllDropdownMenus();
  
  const lead = State.leads.find(l => l.id === leadId);
  if (!lead) return;
  
  const emp = State.employees.find(e => String(e.id) === String(employeeId));
  const newMgrName = emp ? (emp.fields['Имя'] || '') : '';
  const oldMgrName = lead.fields['Менеджер'] || '';
  
  if (newMgrName === oldMgrName) return;
  
  const updates = {
    'Менеджер': employeeId ? [Number(employeeId)] : []
  };
  
  const history = safeJsonParse(lead.fields['История'] || '[]');
  const currentUser = localStorage.getItem('crm_current_user') || 'Система';
  history.unshift({
    date: new Date().toLocaleString('ru-RU'),
    user: currentUser,
    type: 'edit_fields',
    details: `Менеджер: «${oldMgrName || '—'}» → «${newMgrName || '—'}»`
  });
  updates['История'] = JSON.stringify(history);
  
  const stageField = getStageFieldName(lead.fields);
  const currentStage = lead.fields[stageField] || 'Новая заявка';
  const stagesOrdered = FUNNEL_STAGES.map(s => s.key);
  const stageIdx = stagesOrdered.indexOf(currentStage);
  const consultIdx = stagesOrdered.indexOf('Консультация назначена');
  if (!lead.fields['Дата назначения'] && stageIdx >= consultIdx && newMgrName) {
    updates['Дата назначения'] = new Date().toLocaleDateString('ru-RU');
  }

  // Optimistic update
  lead.fields['Менеджер'] = newMgrName;
  lead.fields['История'] = updates['История'];
  if (updates['Дата назначения']) {
    lead.fields['Дата назначения'] = updates['Дата назначения'];
  }
  
  renderKanban(State.leads);
  renderLeadsStats();
  
  // If lead detail drawer is open, re-render
  const drawer = document.getElementById('drawer-detail');
  if (drawer && drawer.classList.contains('open') && window._activeLeadId === leadId) {
    openLeadDetail(leadId, currentStage);
  }
  
  try {
    await Airtable.update(CONFIG.TABLES.LEADS, leadId, updates);
    toast(`Менеджер изменен на «${newMgrName || '—'}» ✓`);
  } catch (e) {
    toast('Ошибка назначения менеджера: ' + e.message, 'error');
    await loadLeads();
  }
}
window.assignLeadManager = assignLeadManager;

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
  
  const tasks = safeJsonParse(lead.fields['Задачи'] || '[]');
  const consultTasks = tasks.filter(t => t.type === 'consult' && !t.cancelled);
  if (consultTasks.length > 0) {
    consultTasks.forEach(t => {
      t.done = newVal;
      t.completedAt = newVal ? new Date().toLocaleString('ru-RU') : '';
    });
  } else if (newVal) {
    const currentUser = localStorage.getItem('crm_current_user') || 'Система';
    const dateStr = new Date().toLocaleString('ru-RU');
    const todayStr = getLocalDateString();
    
    const assignDateVal = lead.fields['Дата назначения'] || lead.fields['Дата'] || todayStr;
    const assignYmd = convertDbDateToYmd(assignDateVal) || todayStr;
    
    const newTask = {
      id: 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      text: 'Провести консультацию',
      type: 'consult',
      assignedDate: assignYmd,
      dueDate: todayStr,
      dueTime: '12:00',
      done: true,
      createdAt: dateStr,
      completedAt: dateStr,
      user: currentUser
    };
    tasks.push(newTask);
  }
  
  const history = safeJsonParse(lead.fields['История'] || '[]');
  history.unshift({
    date: new Date().toLocaleString('ru-RU'),
    user: localStorage.getItem('crm_current_user') || 'Система',
    type: 'task_done',
    details: newVal ? 'Выполнена задача: "Провести консультацию"' : 'Задача возвращена в работу: "Провести консультацию"'
  });

  lead.fields['Консультация проведена'] = newVal;
  lead.fields['Задачи'] = JSON.stringify(tasks);
  lead.fields['История'] = JSON.stringify(history);

  const synced = getSyncedConsultationFields(tasks);
  Object.assign(lead.fields, synced);

  renderKanban(State.leads);
  renderLeadsStats();

  const drawer = document.getElementById('drawer-detail');
  if (drawer && drawer.classList.contains('open') && window._activeLeadId === id) {
    renderLeadMiddleColumn(lead);
  }

  try {
    await Airtable.update(CONFIG.TABLES.LEADS, id, {
      'Консультация проведена': newVal,
      'Задачи': JSON.stringify(tasks),
      'История': JSON.stringify(history),
      'Дата консультации': lead.fields['Дата консультации'],
      'Время консультации': lead.fields['Время консультации']
    });
    toast(newVal ? '✅ Консультация проведена' : '☑️ Отметка снята');
  } catch(e) {
    toast('Ошибка сохранения: ' + e.message, 'error');
    await loadLeads();
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

    const nicheVal = document.getElementById('l-niche')?.value.trim() || '';

    const apiFields = {
      'Имя':       name,
      'Телефон':   document.getElementById('l-phone').value.trim(),
      'Instagram': document.getElementById('l-instagram')?.value.trim() || '',
      'Источник':  document.getElementById('l-source').value.trim(),
      'Ниша':      nicheVal,
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
    ['l-name','l-phone','l-instagram','l-source','l-niche','l-budget','l-comment','l-consult-date','l-consult-time']
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

    // Привязываем заявку если есть
    const leadId = document.getElementById('d-lead-id')?.value || '';
    if (leadId) fields['Заявка ID'] = leadId;

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

let _contactLaterLeadId = null;
let _contactLaterNewStage = null;
let _contactLaterFromStage = null;
let _contactLaterBeforeId = null;
let _quickTaskOnly = false;

function openContactLaterModal(leadId, newStage, fromStage, beforeId) {
  _quickTaskOnly = false;
  _contactLaterLeadId = leadId;
  _contactLaterNewStage = newStage;
  _contactLaterFromStage = fromStage;
  _contactLaterBeforeId = beforeId;

  const lead = State.leads.find(l => l.id === leadId);
  if (!lead) return;

  const leadName = getField(lead.fields, CONFIG.LEAD_FIELDS.name) || 'Лид';
  const leadPhone = getField(lead.fields, CONFIG.LEAD_FIELDS.phone) || '';

  const titleEl = document.querySelector('#drawer-contact-later .drawer-title');
  if (titleEl) titleEl.textContent = '📅 Планирование контакта';

  const saveBtn = document.getElementById('confirm-contact-later-btn');
  if (saveBtn) saveBtn.textContent = '📅 Запланировать и перенести';

  const infoEl = document.getElementById('contact-later-lead-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <div style="font-weight:700; font-size:14px; color:#fff;">🎯 ${escHtml(leadName)}</div>
      ${leadPhone ? `<div style="font-size:12px; color:var(--text2); margin-top:4px;">📱 ${escHtml(leadPhone)}</div>` : ''}
    `;
  }

  const isConsult = (_contactLaterNewStage === 'Консультация назначена');

  const dateEl = document.getElementById('contact-later-date');
  if (dateEl) {
    if (isConsult) {
      dateEl.value = getLocalDateString();
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateEl.value = getLocalDateString(tomorrow);
    }
  }

  const timeEl = document.getElementById('contact-later-time');
  if (timeEl) {
    timeEl.value = '12:00';
  }

  const textEl = document.getElementById('contact-later-text');
  if (textEl) {
    textEl.value = isConsult ? 'Провести консультацию' : 'Связаться позднее';
    textEl.placeholder = isConsult ? 'Например: Провести zoom-презентацию' : 'Например: Позвонить и узнать решение по КП';
  }

  openDrawer('drawer-contact-later');
}

function openQuickTaskModal(leadId) {
  _quickTaskOnly = true;
  _contactLaterLeadId = leadId;
  _contactLaterNewStage = null;
  _contactLaterFromStage = null;
  _contactLaterBeforeId = null;

  const lead = State.leads.find(l => l.id === leadId);
  if (!lead) return;

  const leadName = getField(lead.fields, CONFIG.LEAD_FIELDS.name) || 'Лид';
  const leadPhone = getField(lead.fields, CONFIG.LEAD_FIELDS.phone) || '';

  const titleEl = document.querySelector('#drawer-contact-later .drawer-title');
  if (titleEl) titleEl.textContent = '📅 Быстрая задача';

  const saveBtn = document.getElementById('confirm-contact-later-btn');
  if (saveBtn) saveBtn.textContent = '📅 Создать задачу';

  const infoEl = document.getElementById('contact-later-lead-info');
  if (infoEl) {
    infoEl.innerHTML = `
      <div style="font-weight:700; font-size:14px; color:#fff;">🎯 ${escHtml(leadName)}</div>
      ${leadPhone ? `<div style="font-size:12px; color:var(--text2); margin-top:4px;">📱 ${escHtml(leadPhone)}</div>` : ''}
    `;
  }

  // Заполняем дефолтную дату: сегодня
  const todayStr = getLocalDateString();
  const dateEl = document.getElementById('contact-later-date');
  if (dateEl) {
    dateEl.value = todayStr;
  }

  const timeEl = document.getElementById('contact-later-time');
  if (timeEl) {
    timeEl.value = '12:00';
  }

  const textEl = document.getElementById('contact-later-text');
  if (textEl) {
    textEl.value = '';
    textEl.placeholder = 'Например: Позвонить и узнать решение по КП';
  }

  openDrawer('drawer-contact-later');
}

function cancelContactLater() {
  closeDrawer('drawer-contact-later');
  if (!_quickTaskOnly) {
    // Сбрасываем Kanban, чтобы вернуть карточку на прежнее место, если перенос был через drag-and-drop
    renderKanban(State.leads);
  }
  _contactLaterLeadId = null;
  _contactLaterNewStage = null;
  _contactLaterFromStage = null;
  _contactLaterBeforeId = null;
  _quickTaskOnly = false;
}

async function confirmContactLater() {
  const leadId = _contactLaterLeadId;
  if (!leadId) return;

  const dateEl = document.getElementById('contact-later-date');
  const timeEl = document.getElementById('contact-later-time');
  const textEl = document.getElementById('contact-later-text');
  const dueDate = dateEl?.value;
  const dueTime = timeEl?.value || '12:00';
  const text = textEl?.value.trim();

  if (!dueDate) { toast('Выберите дату', 'error'); return; }
  if (!text) { toast('Укажите суть задачи', 'error'); return; }

  const lead = State.leads.find(l => l.id === leadId);
  if (!lead) return;

  const btn = document.getElementById('confirm-contact-later-btn');
  if (btn) {
    btn.innerHTML = '<span class="spinner"></span> Сохранение...';
    btn.disabled = true;
  }

  try {
    const currentUser = localStorage.getItem('crm_current_user') || 'Система';
    const dateStr = new Date().toLocaleString('ru-RU');

    // 1. Создаем новую задачу
    const tasks = safeJsonParse(lead.fields['Задачи'] || '[]');
    const isConsult = (_contactLaterNewStage === 'Консультация назначена');
    const newTask = {
      id: 't_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      text: text,
      type: isConsult ? 'consult' : 'call',
      dueDate: dueDate,
      dueTime: dueTime,
      done: false,
      createdAt: dateStr,
      completedAt: '',
      user: currentUser
    };
    tasks.push(newTask);

    const updates = {
      'Задачи': JSON.stringify(tasks)
    };
    const synced = getSyncedConsultationFields(tasks);
    Object.assign(updates, synced);

    const history = safeJsonParse(lead.fields['История'] || '[]');

    if (!_quickTaskOnly) {
      // 2. Логируем смену этапа и создание задачи в историю
      if (_contactLaterFromStage && _contactLaterFromStage !== _contactLaterNewStage) {
        history.unshift({
          date: dateStr,
          user: currentUser,
          type: 'stage_change',
          details: `Этап: «${_contactLaterFromStage || '—'}» → «${_contactLaterNewStage}»`
        });
      }
      history.unshift({
        date: dateStr,
        user: currentUser,
        type: 'task_create',
        taskId: newTask.id,
        details: text
      });

      const stageField = getStageFieldName(lead.fields);
      const stageObj = FUNNEL_STAGES.find(s => s.key === _contactLaterNewStage);
      const stageId = stageObj ? stageObj.id : null;

      updates[stageField] = stageId || [];
      updates['История'] = JSON.stringify(history);

      // Оптимистично обновляем локальный стейт
      Object.assign(lead.fields, {
        [stageField]: _contactLaterNewStage,
        [stageField + ' ID']: stageId ? String(stageId) : '',
        'Задачи': JSON.stringify(tasks),
        'История': JSON.stringify(history),
        ...synced
      });

      if (_contactLaterBeforeId !== undefined) {
        reorderLocalLeads(leadId, _contactLaterBeforeId);
      }
    } else {
      // Только задача (без смены этапа)
      history.unshift({
        date: dateStr,
        user: currentUser,
        type: 'task_create',
        taskId: newTask.id,
        details: text
      });
      updates['История'] = JSON.stringify(history);
      Object.assign(lead.fields, {
        'Задачи': JSON.stringify(tasks),
        'История': JSON.stringify(history),
        ...synced
      });
    }

    closeDrawer('drawer-contact-later');
    renderKanban(State.leads);
    
    // Сохраняем в Airtable
    await Airtable.update(CONFIG.TABLES.LEADS, leadId, updates);
    if (!_quickTaskOnly && _contactLaterBeforeId !== undefined) {
      await moveBaserowRow(CONFIG.TABLES.LEADS, leadId, _contactLaterBeforeId);
    }

    toast(_quickTaskOnly ? 'Задача создана ✓' : 'Этап обновлен и задача запланирована ✓');
  } catch (e) {
    toast('Ошибка сохранения: ' + e.message, 'error');
    await loadLeads();
  } finally {
    if (btn) {
      btn.innerHTML = _quickTaskOnly ? '📅 Создать задачу' : '📅 Запланировать и перенести';
      btn.disabled = false;
    }
    _contactLaterLeadId = null;
    _contactLaterNewStage = null;
    _contactLaterFromStage = null;
    _contactLaterBeforeId = null;
    _quickTaskOnly = false;
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
  selectedDate: getLocalDateString(),
  filterManager: '',
  view: localStorage.getItem('crm_calendar_view') || 'month'
};

function syncCalendarViewButtons() {
  const view = CalState.view;
  const btnMonth = document.getElementById('btn-cal-view-month');
  const btnWeek = document.getElementById('btn-cal-view-week');
  const btnDay = document.getElementById('btn-cal-view-day');
  
  if (btnMonth) {
    btnMonth.style.background = view === 'month' ? '#3b82f6' : 'transparent';
    btnMonth.style.color = view === 'month' ? '#fff' : 'var(--text2)';
  }
  if (btnWeek) {
    btnWeek.style.background = view === 'week' ? '#3b82f6' : 'transparent';
    btnWeek.style.color = view === 'week' ? '#fff' : 'var(--text2)';
  }
  if (btnDay) {
    btnDay.style.background = view === 'day' ? '#3b82f6' : 'transparent';
    btnDay.style.color = view === 'day' ? '#fff' : 'var(--text2)';
  }
}

function setCalendarView(view) {
  CalState.view = view;
  localStorage.setItem('crm_calendar_view', view);
  syncCalendarViewButtons();
  renderCalendar();
}
window.setCalendarView = setCalendarView;

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

  syncCalendarViewButtons();
  renderCalendar();
}

function renderCalendar() {
  const container = document.getElementById('calendar-view-container');
  const titleEl = document.getElementById('calendar-title');
  if (!container) return;

  const isMobile = window.innerWidth < 768;

  if (CalState.view === 'month') {
    // Обновляем заголовок с названием месяца
    const monthNames = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    if (titleEl) {
      titleEl.textContent = `${monthNames[CalState.currentMonth]} ${CalState.currentYear}`;
    }

    if (isMobile) {
      renderMobileCalendar(container);
    } else {
      renderDesktopCalendar(container);
    }
  } else if (CalState.view === 'week') {
    renderGridCalendar(container, titleEl, 7);
  } else if (CalState.view === 'day') {
    renderGridCalendar(container, titleEl, 1);
  }
}

function isCallEvent(lead) {
  const tasks = safeJsonParse(lead.fields['Задачи'] || '[]');
  const cDate = lead.fields['Дата консультации'];
  const cTime = lead.fields['Время консультации'];
  if (!cDate) return false;
  
  const ymd = convertDbDateToYmd(cDate);
  const match = tasks.find(t => t.dueDate === ymd && t.dueTime === cTime && !t.cancelled);
  if (match) {
    return match.type === 'call' || String(match.text || '').toLowerCase().includes('звон');
  }
  
  const stage = lead.fields['Воронка'];
  if (stage === 'В обработке (3 касания)' || stage === 'Связаться позднее') {
    return true;
  }
  return false;
}

function renderGridCalendar(container, titleEl, numDays) {
  // 1. Рассчитываем отображаемые даты
  const days = [];
  const selected = new Date(CalState.selectedDate);
  
  if (numDays === 7) {
    // Находим понедельник текущей недели
    const day = selected.getDay();
    const monday = new Date(selected);
    monday.setDate(selected.getDate() - (day === 0 ? 6 : day - 1));
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
  } else {
    // Только выбранный день
    days.push(selected);
  }

  // 2. Обновляем заголовок календаря
  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  const monthNamesGenitive = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  
  if (titleEl) {
    if (numDays === 1) {
      const dayNum = selected.getDate();
      const monthGen = monthNamesGenitive[selected.getMonth()];
      const year = selected.getFullYear();
      titleEl.textContent = `${dayNum} ${monthGen} ${year}`;
    } else {
      const first = days[0];
      const last = days[6];
      const fYear = first.getFullYear();
      const fMonth = first.getMonth();
      const lYear = last.getFullYear();
      const lMonth = last.getMonth();
      
      if (fYear !== lYear) {
        titleEl.textContent = `${monthNames[fMonth]} ${fYear} – ${monthNames[lMonth]} ${lYear}`;
      } else if (fMonth !== lMonth) {
        titleEl.textContent = `${monthNames[fMonth]} – ${monthNames[lMonth]} ${fYear}`;
      } else {
        titleEl.textContent = `${monthNames[fMonth]} ${fYear}`;
      }
    }
  }

  // 3. Генерация шапки дней
  const shortDayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const fullDayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  
  let headerDaysHtml = '';
  const today = new Date();
  
  days.forEach(d => {
    const dNum = d.getDate();
    const jsDay = d.getDay();
    const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
    const name = numDays === 1 ? fullDayNames[dayIndex] : shortDayNames[dayIndex];
    const isToday = today.getDate() === d.getDate() && today.getMonth() === d.getMonth() && today.getFullYear() === d.getFullYear();
    
    headerDaysHtml += `
      <div class="weekly-header-day ${isToday ? 'today' : ''}">
        <span class="weekly-header-day-name">${escHtml(name)}</span>
        <span class="weekly-header-day-num">${dNum}</span>
      </div>
    `;
  });

  // 4. Генерация левой шкалы часов (08:00 - 20:00)
  let hoursHtml = '';
  for (let h = 8; h <= 20; h++) {
    const timeStr = `${String(h).padStart(2, '0')}:00`;
    hoursHtml += `<div class="weekly-hour-label">${timeStr}</div>`;
  }

  // 5. Генерация колонок дней
  let columnsHtml = '';
  const isMobile = window.innerWidth < 768;
  const inlineGridStyle = (isMobile && numDays === 7) ? 'style="min-width: 600px;"' : '';
  const inlineScrollStyle = (isMobile && numDays === 7) ? 'style="overflow-x: auto;"' : '';

  days.forEach(d => {
    const dIso = getLocalDateString(d);
    
    // Линии сетки в фоне
    let linesHtml = '';
    for (let h = 8; h <= 20; h++) {
      linesHtml += `<div class="weekly-day-grid-line"></div>`;
    }

    // Красный маркер текущего времени
    let timelineHtml = '';
    const isToday = today.getDate() === d.getDate() && today.getMonth() === d.getMonth() && today.getFullYear() === d.getFullYear();
    if (isToday) {
      const curHour = today.getHours();
      const curMin = today.getMinutes();
      if (curHour >= 8 && curHour < 21) {
        const topPx = (curHour - 8) * 60 + curMin;
        timelineHtml = `
          <div class="weekly-now-indicator" style="top: ${topPx}px">
            <div class="weekly-now-indicator-circle"></div>
          </div>
        `;
      }
    }

    // Выборка и фильтрация лидов на этот день
    let dayLeads = State.leads.filter(l => {
      const cDate = l.fields['Дата консультации'];
      return cDate && convertDbDateToYmd(cDate) === dIso;
    });

    if (CalState.filterManager) {
      dayLeads = dayLeads.filter(l => l.fields['Менеджер'] === CalState.filterManager);
    }

    // Парсинг времени и длительности событий
    const parsedEvents = [];
    dayLeads.forEach(l => {
      const tStr = l.fields['Время консультации'];
      if (!tStr) return;
      const parts = tStr.split(':');
      if (parts.length < 2) return;
      let hr = parseInt(parts[0], 10);
      let min = parseInt(parts[1], 10);
      if (isNaN(hr) || isNaN(min)) return;
      
      if (hr < 8) { hr = 8; min = 0; }
      if (hr >= 21) { hr = 20; min = 59; }

      const start = (hr - 8) * 60 + min;
      
      // Определяем длительность (Длительность из базы -> дефолт 30 минут для всех событий)
      let duration = Number(l.fields['Длительность']);
      if (isNaN(duration) || duration <= 0) {
        duration = 30;
      }
      
      const end = start + duration;
      const height = duration - 2; // зазор 2px снизу
      parsedEvents.push({ lead: l, start, end, height, originalTime: tStr });
    });

    // Сортировка по времени начала
    parsedEvents.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return (b.end - b.start) - (a.end - a.start);
    });

    // Разделение по пересекающимся кластерам
    const clusters = [];
    let currentCluster = [];
    let clusterEnd = -1;

    parsedEvents.forEach(ev => {
      if (ev.start >= clusterEnd) {
        if (currentCluster.length > 0) {
          clusters.push(currentCluster);
        }
        currentCluster = [ev];
        clusterEnd = ev.end;
      } else {
        currentCluster.push(ev);
        if (ev.end > clusterEnd) {
          clusterEnd = ev.end;
        }
      }
    });
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // Распределение на дорожки (columns) внутри кластеров
    clusters.forEach(cluster => {
      const cols = [];
      cluster.forEach(ev => {
        let placed = false;
        for (let c = 0; c < cols.length; c++) {
          const lastEv = cols[c][cols[c].length - 1];
          if (ev.start >= lastEv.end) {
            cols[c].push(ev);
            ev.colIndex = c;
            placed = true;
            break;
          }
        }
        if (!placed) {
          cols.push([ev]);
          ev.colIndex = cols.length - 1;
        }
      });

      const colCount = cols.length;
      cluster.forEach(ev => {
        ev.colCount = colCount;
        ev.width = 100 / colCount;
        ev.left = ev.colIndex * ev.width;
      });
    });

    // Формирование HTML карточек
    let eventsHtml = '';
    parsedEvents.forEach(ev => {
      const l = ev.lead;
      const time = ev.originalTime;
      const name = getField(l.fields, CONFIG.LEAD_FIELDS.name) || 'Лид';
      const mgr = l.fields['Менеджер'] || '';
      const color = getManagerColor(mgr);
      const stage = l.fields['Воронка'] || 'Лид';
      const isCall = isCallEvent(l);
      const icon = isCall ? '📞' : '👤';
      
      const isShort = ev.height <= 30;
      const cardStyle = `top: ${ev.start}px; height: ${ev.height}px; left: ${ev.left}%; width: ${ev.width}%; --mgr-color: ${color}; padding: ${isShort ? '2px 6px' : '4px 8px'}; display: flex; ${isShort ? 'flex-direction: row; gap: 6px; align-items: center;' : 'flex-direction: column; gap: 2px;'}`;
      const nameStyle = isShort ? 'font-size: 9px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' : '';
      
      eventsHtml += `
        <div class="weekly-event-card" style="${cardStyle}" onclick="event.stopPropagation(); openLeadDetail('${l.id}', '${escHtml(stage)}')" title="${escHtml(name)} (${time}) - ${escHtml(mgr)}">
          <div class="weekly-event-card-time" style="${isShort ? 'margin:0; white-space:nowrap;' : ''}">${escHtml(time)}</div>
          <div class="weekly-event-card-name" style="${nameStyle}">${icon} ${escHtml(name)}</div>
          ${(!isShort && mgr) ? `<div class="weekly-event-card-mgr">👤 ${escHtml(mgr)}</div>` : ''}
        </div>
      `;
    });

    columnsHtml += `
      <div class="weekly-day-column" data-date="${dIso}">
        ${linesHtml}
        ${timelineHtml}
        ${eventsHtml}
      </div>
    `;
  });

  const html = `
    <div class="weekly-calendar-container">
      <div class="weekly-calendar-header" ${inlineGridStyle}>
        <div class="weekly-header-spacer"></div>
        <div class="weekly-header-days">
          ${headerDaysHtml}
        </div>
      </div>
      <div class="weekly-calendar-scroll-area" ${inlineScrollStyle}>
        <div class="weekly-hours-column">
          ${hoursHtml}
        </div>
        <div class="weekly-grid-body" ${inlineGridStyle}>
          ${columnsHtml}
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Автоматический скролл до 10:00 утра (120px) при первой отрисовке
  const scrollArea = container.querySelector('.weekly-calendar-scroll-area');
  if (scrollArea && scrollArea.scrollTop === 0) {
    setTimeout(() => {
      scrollArea.scrollTop = 120;
    }, 50);
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
  if (CalState.view === 'day') {
    const d = new Date(CalState.selectedDate);
    d.setDate(d.getDate() - 1);
    CalState.selectedDate = getLocalDateString(d);
    CalState.currentYear = d.getFullYear();
    CalState.currentMonth = d.getMonth();
  } else if (CalState.view === 'week') {
    const d = new Date(CalState.selectedDate);
    d.setDate(d.getDate() - 7);
    CalState.selectedDate = getLocalDateString(d);
    CalState.currentYear = d.getFullYear();
    CalState.currentMonth = d.getMonth();
  } else {
    if (CalState.currentMonth === 0) {
      CalState.currentMonth = 11;
      CalState.currentYear--;
    } else {
      CalState.currentMonth--;
    }
    const firstDayStr = `${CalState.currentYear}-${String(CalState.currentMonth + 1).padStart(2, '0')}-01`;
    CalState.selectedDate = firstDayStr;
  }
  renderCalendar();
}

function nextMonth() {
  if (CalState.view === 'day') {
    const d = new Date(CalState.selectedDate);
    d.setDate(d.getDate() + 1);
    CalState.selectedDate = getLocalDateString(d);
    CalState.currentYear = d.getFullYear();
    CalState.currentMonth = d.getMonth();
  } else if (CalState.view === 'week') {
    const d = new Date(CalState.selectedDate);
    d.setDate(d.getDate() + 7);
    CalState.selectedDate = getLocalDateString(d);
    CalState.currentYear = d.getFullYear();
    CalState.currentMonth = d.getMonth();
  } else {
    if (CalState.currentMonth === 11) {
      CalState.currentMonth = 0;
      CalState.currentYear++;
    } else {
      CalState.currentMonth++;
    }
    const firstDayStr = `${CalState.currentYear}-${String(CalState.currentMonth + 1).padStart(2, '0')}-01`;
    CalState.selectedDate = firstDayStr;
  }
  renderCalendar();
}

function goToday() {
  const today = new Date();
  CalState.currentYear = today.getFullYear();
  CalState.currentMonth = today.getMonth();
  CalState.selectedDate = getLocalDateString(today);
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
window.openContactLaterModal = openContactLaterModal;
window.cancelContactLater = cancelContactLater;
window.confirmContactLater = confirmContactLater;
window.openQuickTaskModal = openQuickTaskModal;

// ─── Отображение подробного разбора звонка ИИ в модале
function openCallAuditDetailsModal(callId) {
  const call = (State.calls || []).find(c => String(c.id) === String(callId));
  if (!call) {
    toast('Звонок не найден', 'error');
    return;
  }
  const f = call.fields || {};
  const score = Number(f['Оценка']) || 0;
  let scoreColor = '#ef4444';
  let scoreBg = 'rgba(239, 68, 68, 0.15)';
  if (score >= 6) {
    scoreColor = '#10b981';
    scoreBg = 'rgba(16, 185, 129, 0.15)';
  } else if (score >= 4) {
    scoreColor = '#f59e0b';
    scoreBg = 'rgba(245, 158, 11, 0.15)';
  }

  const container = document.getElementById('call-audit-drawer-content');
  if (!container) return;

  // Преобразуем переносы строк и базовый markdown в HTML для красивого вывода аудита
  let auditHtml = String(f['Аудит'] || 'Разбор ИИ отсутствует.').trim();
  auditHtml = auditHtml
    .replace(/\r?\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/-\s+/g, '&bull; ');

  // Форматируем транскрипт
  let transcriptHtml = String(f['Транскрипт'] || 'Транскрипт отсутствует.').trim();
  transcriptHtml = transcriptHtml
    .replace(/\r?\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  container.innerHTML = `
    <div class="card" style="margin-bottom:16px; border-color:var(--border); padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
        <div>
          <h4 style="margin:0; font-size:16px; font-weight:800; color:#fff;">${escHtml(f['Имя'] || 'Звонок')}</h4>
          <div style="font-size:12px; color:var(--text3); margin-top:4px;">
            Дата: <strong>${f['Дата'] || '—'}</strong> | 
            Менеджер: <strong>${escHtml(f['Менеджер'] || '—')}</strong>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:14px; font-weight:800; color:${scoreColor}; background:${scoreBg}; padding:4px 12px; border-radius:16px; border: 1px solid ${scoreColor}40;">
            Оценка РОПа: ${score}/7
          </span>
          ${f['Ссылка на запись'] ? `<a href="${f['Ссылка на запись']}" target="_blank" rel="noopener" class="btn btn-primary" style="margin:0; font-size:12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none;">🎥 Запись</a>` : ''}
        </div>
      </div>
    </div>

    <!-- AI Review Details -->
    <div style="background:rgba(99,102,241,0.03); border:1px solid rgba(99,102,241,0.15); border-radius:12px; padding:16px; margin-bottom:16px;">
      <h5 style="margin-top:0; margin-bottom:12px; font-size:14px; font-weight:800; color:#a5b4fc; display:flex; align-items:center; gap:6px;">🤖 ИИ-Разбор и Рекомендации</h5>
      <div style="font-size:13px; color:#fff; line-height:1.6; word-break:break-word;">
        ${auditHtml}
      </div>
    </div>

    <!-- Transcript Accordion -->
    <div style="border:1px solid var(--border); border-radius:12px; overflow:hidden;">
      <button onclick="toggleCallTranscriptCollapse()" style="width:100%; text-align:left; background:rgba(255,255,255,0.02); border:none; color:#fff; padding:14px 16px; font-size:13px; font-weight:700; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
        <span>📜 Расшифровка разговора (Транскрипт)</span>
        <span id="call-transcript-collapse-icon">▼</span>
      </button>
      <div id="call-transcript-collapse-body" style="display:none; padding:16px; border-top:1px solid var(--border); max-height:350px; overflow-y:auto; background:rgba(0,0,0,0.1); font-size:12px; color:var(--text2); line-height:1.5; font-family:monospace;">
        ${transcriptHtml}
      </div>
    </div>
  `;

  openDrawer('drawer-call-audit');
}

function toggleCallTranscriptCollapse() {
  const body = document.getElementById('call-transcript-collapse-body');
  const icon = document.getElementById('call-transcript-collapse-icon');
  if (body && icon) {
    const isCollapsed = (body.style.display === 'none');
    body.style.display = isCollapsed ? 'block' : 'none';
    icon.textContent = isCollapsed ? '▲' : '▼';
  }
}

window.openCallAuditDetailsModal = openCallAuditDetailsModal;
window.toggleCallTranscriptCollapse = toggleCallTranscriptCollapse;


