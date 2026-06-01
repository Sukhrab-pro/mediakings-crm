// === PIPELINE SETTINGS MODULE ===
function renderPipelineSelect() {
  const sel = document.getElementById('pipeline-select');
  if (sel) {
    sel.innerHTML = State.pipelines.map(p => 
      `<option value="${p.id}" ${String(p.id) === String(State.currentPipelineId) ? 'selected' : ''}>${escHtml(p.fields['Название'] || '')}</option>`
    ).join('');
  }
}

function switchPipeline(id) {
  State.currentPipelineId = String(id);
  localStorage.setItem('currentPipelineId', State.currentPipelineId);
  renderKanban(State.leads);
}

function populateLeadStageSelect() {
  const sel = document.getElementById('l-stage');
  if (sel) {
    sel.innerHTML = FUNNEL_STAGES.filter(s => !s.blocked).map(s =>
      `<option value="${s.id}">${escHtml(s.key)}</option>`
    ).join('');
  }
}

let DeletedStageIds = new Set();

function openPipelineSettings() {
  DeletedStageIds.clear();
  const select = document.getElementById('ps-pipeline');
  if (select) {
    select.innerHTML = State.pipelines.map(p =>
      `<option value="${p.id}" ${String(p.id) === String(State.currentPipelineId) ? 'selected' : ''}>${escHtml(p.fields['Название'] || '')}</option>`
    ).join('');
  }
  loadPipelineStagesToSettings(State.currentPipelineId || (State.pipelines[0] ? String(State.pipelines[0].id) : null));
  openDrawer('drawer-pipeline');
}

function loadPipelineStagesToSettings(pipelineId) {
  DeletedStageIds.clear();
  const list = document.getElementById('ps-stages-list');
  if (!list) return;
  list.innerHTML = '';
  
  if (!pipelineId) return;

  const currentStages = State.stages.filter(s => {
    const pipeId = s.fields['Воронка ID'] || (Array.isArray(s.fields['Воронка']) ? s.fields['Воронка'][0] : s.fields['Воронка']);
    return String(pipeId || '') === String(pipelineId);
  });

  currentStages.forEach(s => {
    list.appendChild(createStageSettingsRow(s.id, s.fields['Название'] || '', s.fields['Цвет'] || 'indigo', s.fields['Группа'] || 'main', !!s.fields['Заблокирован']));
  });
}

function createStageSettingsRow(id, name, color, group, blocked) {
  const div = document.createElement('div');
  div.className = 'stage-setting-item';
  div.setAttribute('data-id', id);
  div.setAttribute('data-blocked', blocked ? '1' : '0');
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.gap = '8px';
  div.style.background = 'var(--card-bg)';
  div.style.padding = '10px';
  div.style.borderRadius = '10px';
  div.style.border = '1px solid var(--border)';

  div.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:4px">
      <button class="btn btn-secondary btn-icon" onclick="moveStageSettingsUp(this)" style="padding:2px 6px; font-size:10px; margin:0">▲</button>
      <button class="btn btn-secondary btn-icon" onclick="moveStageSettingsDown(this)" style="padding:2px 6px; font-size:10px; margin:0">▼</button>
    </div>
    <input class="form-input stage-name-input" type="text" value="${escHtml(name)}" style="flex:2; margin:0; padding:6px 10px" placeholder="Название этапа" ${blocked ? 'disabled' : ''}/>
    
    <select class="form-select stage-color-select" style="flex:1; margin:0; padding:6px 10px; font-size:13px">
      <option value="indigo" style="color:#6366f1" ${color==='indigo'?'selected':''}>Indigo</option>
      <option value="purple" style="color:#8b5cf6" ${color==='purple'?'selected':''}>Purple</option>
      <option value="blue" style="color:#3b82f6" ${color==='blue'?'selected':''}>Blue</option>
      <option value="orange" style="color:#f59e0b" ${color==='orange'?'selected':''}>Orange</option>
      <option value="gray" style="color:#64748b" ${color==='gray'?'selected':''}>Gray</option>
      <option value="light-blue" style="color:#94a3b8" ${color==='light-blue'?'selected':''}>Light Blue</option>
      <option value="red" style="color:#ef4444" ${color==='red'?'selected':''}>Red</option>
      <option value="green" style="color:#22c55e" ${color==='green'?'selected':''}>Green</option>
    </select>

    <select class="form-select stage-group-select" style="flex:1; margin:0; padding:6px 10px; font-size:13px" ${blocked ? 'disabled' : ''}>
      <option value="main" ${group==='main'?'selected':''}>Основная</option>
      <option value="reject" ${group==='reject'?'selected':''}>Отказ</option>
      <option value="sold" ${group==='sold'?'selected':''}>Продано</option>
      <option value="refund" ${group==='refund'?'selected':''}>Возврат</option>
    </select>

    <button class="btn btn-danger btn-icon" onclick="deleteStageSettingsRow(this)" style="padding:6px 10px; margin:0; background:#ef4444; border:none; color:white;" ${blocked ? 'disabled' : ''}>&times;</button>
  `;
  return div;
}

function addStageToSettingsList() {
  const list = document.getElementById('ps-stages-list');
  if (!list) return;
  const tempId = 'new_' + Date.now();
  list.appendChild(createStageSettingsRow(tempId, '', 'indigo', 'main', false));
}

function moveStageSettingsUp(btn) {
  const row = btn.closest('.stage-setting-item');
  if (row.previousElementSibling) {
    row.parentNode.insertBefore(row, row.previousElementSibling);
  }
}

function moveStageSettingsDown(btn) {
  const row = btn.closest('.stage-setting-item');
  if (row.nextElementSibling) {
    row.parentNode.insertBefore(row.nextElementSibling, row);
  }
}

function deleteStageSettingsRow(btn) {
  const row = btn.closest('.stage-setting-item');
  const id = row.getAttribute('data-id');
  if (id && !id.startsWith('new_')) {
    DeletedStageIds.add(id);
  }
  row.remove();
}

async function createNewPipeline() {
  const name = prompt('Введите название новой воронки:');
  if (!name || name.trim() === '') return;

  const btn = document.getElementById('save-pipeline-btn');
  const oldText = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span>`;
  btn.disabled = true;
  try {
    toast('Создание воронки...');
    const pipeRes = await Airtable.create(CONFIG.TABLES.PIPELINES, { 'Название': name.trim() });
    const newPipe = pipeRes.records?.[0];
    if (!newPipe) throw new Error('Не удалось создать воронку');
    
    State.pipelines.push(newPipe);
    
    // Seed default stages for this pipeline
    toast('Создание стандартных этапов...');
    const seedPromises = DEFAULT_FUNNEL_STAGES.map((s, idx) => 
      Airtable.create(CONFIG.TABLES.STAGES, {
        'Название': s.key,
        'Воронка': [parseInt(newPipe.id, 10)],
        'Цвет': s.color === '#6366f1' ? 'indigo' :
                s.color === '#8b5cf6' ? 'purple' :
                s.color === '#3b82f6' ? 'blue' :
                s.color === '#f59e0b' ? 'orange' :
                s.color === '#f97316' ? 'orange' :
                s.color === '#64748b' ? 'gray' :
                s.color === '#94a3b8' ? 'light-blue' :
                s.color === '#ef4444' ? 'red' :
                s.color === '#22c55e' ? 'green' : 'indigo',
        'Порядок': idx + 1,
        'Группа': s.group,
        'Заблокирован': !!s.blocked
      })
    );
    
    const results = await Promise.all(seedPromises);
    results.forEach(res => {
      if (res.records?.[0]) State.stages.push(res.records[0]);
    });
    
    State.stages.sort((a, b) => (Number(a.fields['Порядок']) || 0) - (Number(b.fields['Порядок']) || 0));
    
    State.currentPipelineId = String(newPipe.id);
    localStorage.setItem('currentPipelineId', State.currentPipelineId);
    
    // Reload switcher and settings
    renderPipelineSelect();
    const select = document.getElementById('ps-pipeline');
    if (select) {
      select.innerHTML = State.pipelines.map(p =>
        `<option value="${p.id}" ${String(p.id) === String(State.currentPipelineId) ? 'selected' : ''}>${escHtml(p.fields['Название'] || '')}</option>`
      ).join('');
    }
    loadPipelineStagesToSettings(State.currentPipelineId);
    renderKanban(State.leads);
    toast('Воронка создана ✓');
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  } finally {
    btn.innerHTML = oldText;
    btn.disabled = false;
  }
}

async function renameSelectedPipeline() {
  const select = document.getElementById('ps-pipeline');
  if (!select) return;
  const pipeId = select.value;
  const pipe = State.pipelines.find(p => String(p.id) === String(pipeId));
  if (!pipe) return;
  
  const newName = prompt('Введите новое название воронки:', pipe.fields['Название']);
  if (!newName || newName.trim() === '') return;
  
  try {
    toast('Переименование...');
    await Airtable.update(CONFIG.TABLES.PIPELINES, pipeId, { 'Название': newName.trim() });
    pipe.fields['Название'] = newName.trim();
    renderPipelineSelect();
    select.options[select.selectedIndex].text = newName.trim();
    toast('Воронка переименована ✓');
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  }
}

async function deleteSelectedPipeline() {
  const select = document.getElementById('ps-pipeline');
  if (!select) return;
  const pipeId = select.value;
  
  if (State.pipelines.length <= 1) {
    alert('Нельзя удалить единственную воронку');
    return;
  }
  
  // Find stages of this pipeline
  const pipeStages = State.stages.filter(s => {
    const pId = s.fields['Воронка ID'] || (Array.isArray(s.fields['Воронка']) ? s.fields['Воронка'][0] : s.fields['Воронка']);
    return String(pId || '') === String(pipeId);
  });
  const pipeStageIds = new Set(pipeStages.map(s => String(s.id)));
  
  // Check if there are leads in these stages
  const leadsInPipe = State.leads.filter(l => {
    const lStageId = String(l.fields['Воронка ID'] || '');
    return pipeStageIds.has(lStageId);
  });
  
  if (leadsInPipe.length > 0) {
    alert(`Нельзя удалить воронку, пока в ней есть лиды (${leadsInPipe.length} лидов). Пожалуйста, переместите их в другую воронку перед удалением.`);
    return;
  }
  
  if (!confirm('Вы уверены, что хотите удалить эту воронку и все её этапы? Это действие необратимо.')) return;
  
  const btn = document.getElementById('save-pipeline-btn');
  const oldText = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span>`;
  btn.disabled = true;
  try {
    toast('Удаление воронки...');
    // 1. Delete all stages
    await Promise.all(pipeStages.map(s => Airtable.remove(CONFIG.TABLES.STAGES, s.id)));
    // 2. Delete pipeline itself
    await Airtable.remove(CONFIG.TABLES.PIPELINES, pipeId);
    
    // Update local state
    State.pipelines = State.pipelines.filter(p => String(p.id) !== String(pipeId));
    State.stages = State.stages.filter(s => {
      const pId = s.fields['Воронка ID'] || (Array.isArray(s.fields['Воронка']) ? s.fields['Воронка'][0] : s.fields['Воронка']);
      return String(pId || '') !== String(pipeId);
    });
    
    // Switch to first remaining pipeline
    State.currentPipelineId = String(State.pipelines[0].id);
    localStorage.setItem('currentPipelineId', State.currentPipelineId);
    
    renderPipelineSelect();
    select.innerHTML = State.pipelines.map(p =>
      `<option value="${p.id}" ${String(p.id) === String(State.currentPipelineId) ? 'selected' : ''}>${escHtml(p.fields['Название'] || '')}</option>`
    ).join('');
    loadPipelineStagesToSettings(State.currentPipelineId);
    renderKanban(State.leads);
    toast('Воронка удалена ✓');
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  } finally {
    btn.innerHTML = oldText;
    btn.disabled = false;
  }
}

async function savePipelineSettings() {
  const select = document.getElementById('ps-pipeline');
  if (!select) return;
  const pipeId = select.value;
  
  // 1. Check if we deleted stages with active leads
  const leadsInDeletedStages = State.leads.filter(l => DeletedStageIds.has(String(l.fields['Воронка ID'])));
  if (leadsInDeletedStages.length > 0) {
    alert(`Нельзя удалить этапы, в которых есть лиды (${leadsInDeletedStages.length} лидов). Пожалуйста, переместите лидов перед удалением этапов.`);
    return;
  }
  
  const btn = document.getElementById('save-pipeline-btn');
  btn.innerHTML = `<span class="spinner"></span>`;
  btn.disabled = true;
  
  try {
    const rows = Array.from(document.querySelectorAll('#ps-stages-list .stage-setting-item'));
    
    // 2. Perform updates and creations
    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const id = row.getAttribute('data-id');
      const blocked = row.getAttribute('data-blocked') === '1';
      const name = row.querySelector('.stage-name-input').value.trim();
      const color = row.querySelector('.stage-color-select').value;
      const group = row.querySelector('.stage-group-select').value;
      const order = idx + 1;
      
      if (!name) {
        alert('У всех этапов должно быть название');
        btn.innerHTML = 'Сохранить изменения';
        btn.disabled = false;
        return;
      }
      
      if (id.startsWith('new_')) {
        // Create new stage
        const createRes = await Airtable.create(CONFIG.TABLES.STAGES, {
          'Название': name,
          'Воронка': [parseInt(pipeId, 10)],
          'Цвет': color,
          'Порядок': order,
          'Группа': group,
          'Заблокирован': false
        });
        if (createRes.records?.[0]) {
          State.stages.push(createRes.records[0]);
        }
      } else {
        // Update existing stage
        const updates = {
          'Цвет': color,
          'Порядок': order
        };
        if (!blocked) {
          updates['Название'] = name;
          updates['Группа'] = group;
        }
        await Airtable.update(CONFIG.TABLES.STAGES, id, updates);
        
        // Update locally
        const localStage = State.stages.find(s => String(s.id) === String(id));
        if (localStage) {
          Object.assign(localStage.fields, updates);
        }
      }
    }
    
    // 3. Perform deletions
    for (const deleteId of DeletedStageIds) {
      await Airtable.remove(CONFIG.TABLES.STAGES, deleteId);
      State.stages = State.stages.filter(s => String(s.id) !== String(deleteId));
    }
    
    // 4. Reload all stages from server to be 100% in sync
    State.stages = await Airtable.getAll(CONFIG.TABLES.STAGES);
    State.stages.sort((a, b) => (Number(a.fields['Порядок']) || 0) - (Number(b.fields['Порядок']) || 0));
    
    // 5. Update UI
    closeDrawer('drawer-pipeline');
    renderKanban(State.leads);
    renderLeadsStats();
    toast('Настройки воронки сохранены ✓');
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  } finally {
    btn.innerHTML = 'Сохранить изменения';
    btn.disabled = false;
  }
}

// ════════════════════════════════════════════════════
// ADMIN PAGES — Сотрудники, Тарифы, Услуги, Калькулятор, Партнеры
// ════════════════════════════════════════════════════

// ─── Сотрудники ───
async function loadAdminEmployees() {
  const el = document.getElementById('employees-content');
  if (!el) return;
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
  try {
    const rows = await Airtable.getAll(CONFIG.TABLES.EMPLOYEES);
    State.employees = rows;
    renderEmployeesTable(rows);
  } catch(e) { el.innerHTML = `<div class="empty-state">Ошибка загрузки: ${escHtml(e.message)}</div>`; }
}

function renderEmployeesTable(rows) {
  const el = document.getElementById('employees-content');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
      <h2 style="margin:0; font-size:20px; font-weight:800;">👤 Сотрудники</h2>
      <button class="btn btn-primary" onclick="openEmployeeDrawer(null)">+ Добавить сотрудника</button>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Имя</th><th>Email</th><th>Должность</th><th>Телефон</th><th>Телеграм</th><th>Статус</th><th>Действия</th>
        </tr></thead>
        <tbody>
          ${rows.filter(r => r.fields['Имя']).map(r => {
            const f = r.fields;
            const status = f['Статус'] || '';
            const statusColor = status === 'Активный' ? '#34d399' : status === 'Уволен' ? '#ef4444' : 'var(--text2)';
            return `<tr>
              <td><strong style="color:#fff;">${escHtml(f['Имя']||'—')}</strong></td>
              <td style="color:var(--text2); font-size:12px;">${escHtml(f['Email']||'—')}</td>
              <td>${escHtml(f['Должность']||'—')}</td>
              <td style="color:var(--text2);">${escHtml(f['Телефон']||'—')}</td>
              <td style="color:#a5b4fc;">${f['Телеграм имя'] ? '@'+escHtml(f['Телеграм имя']) : '—'}</td>
              <td><span style="color:${statusColor}; font-size:12px; font-weight:600;">${escHtml(status||'—')}</span></td>
              <td style="display:flex; gap:6px;">
                <button class="btn btn-secondary btn-compact" onclick="openEmployeeDrawer('${r.id}')">✏️ Изменить</button>
                <button class="btn btn-danger btn-compact" onclick="deleteEmployee('${r.id}','${escHtml(f['Имя']||'')}')" style="padding:0 10px;">🗑</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Employee Drawer -->
    <div id="drawer-employee" class="overlay" onclick="if(event.target===this)closeEmployeeDrawer()">
      <div class="drawer" style="max-width:480px;">
        <button class="drawer-close-btn" onclick="closeEmployeeDrawer()">&times;</button>
        <div id="employee-drawer-content"></div>
      </div>
    </div>`;
}

function openEmployeeDrawer(id) {
  const isNew = !id;
  const emp = id ? State.employees.find(e => e.id === id) : null;
  const f = emp ? emp.fields : {};

  document.getElementById('employee-drawer-content').innerHTML = `
    <div class="drawer-handle"></div>
    <h3 class="drawer-title" style="margin-bottom:20px;">${isNew ? '➕ Новый сотрудник' : '✏️ ' + escHtml(f['Имя']||'Сотрудник')}</h3>

    <div style="display:flex; flex-direction:column; gap:12px;">
      <div class="form-group">
        <label class="form-label">Имя *</label>
        <input class="form-input" id="emp-name" placeholder="Имя сотрудника" value="${escHtml(f['Имя']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="emp-email" type="email" placeholder="email@company.com" value="${escHtml(f['Email']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Должность</label>
        <input class="form-input" id="emp-role" placeholder="Менеджер, Проджект, Директор..." value="${escHtml(f['Должность']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Телефон</label>
        <input class="form-input" id="emp-phone" type="tel" placeholder="+7..." value="${escHtml(f['Телефон']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Телеграм (без @)</label>
        <input class="form-input" id="emp-tg" placeholder="username" value="${escHtml(f['Телеграм имя']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Инстаграм</label>
        <input class="form-input" id="emp-ig" placeholder="@username" value="${escHtml(f['Инстаграм']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Статус</label>
        <select class="form-select" id="emp-status">
          <option value="Активный" ${f['Статус']==='Активный'?'selected':''}>Активный</option>
          <option value="На испытательном" ${f['Статус']==='На испытательном'?'selected':''}>На испытательном</option>
          <option value="В отпуске" ${f['Статус']==='В отпуске'?'selected':''}>В отпуске</option>
          <option value="Уволен" ${f['Статус']==='Уволен'?'selected':''}>Уволен</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Формат найма</label>
        <input class="form-input" id="emp-format" placeholder="Удалённо, Офис, Фриланс..." value="${escHtml(f['Формат найма']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Пароль (для входа в CRM)</label>
        <input class="form-input" id="emp-password" type="password" placeholder="••••••••" value="${escHtml(f['Пароль']||'')}"/>
      </div>
    </div>

    <div style="display:flex; gap:10px; margin-top:24px;">
      <button class="btn btn-primary" style="flex:1;" onclick="saveEmployee('${id||''}')">
        ${isNew ? '➕ Создать' : '💾 Сохранить'}
      </button>
      <button class="btn btn-secondary" onclick="closeEmployeeDrawer()">Отмена</button>
    </div>`;

  document.getElementById('drawer-employee').classList.add('open');
}

function closeEmployeeDrawer() {
  const d = document.getElementById('drawer-employee');
  if (d) d.classList.remove('open');
}

async function saveEmployee(id) {
  const name = document.getElementById('emp-name')?.value.trim();
  if (!name) { toast('Введите имя сотрудника', 'error'); return; }

  const fields = {
    'Имя':           name,
    'Email':         document.getElementById('emp-email')?.value.trim() || null,
    'Должность':     document.getElementById('emp-role')?.value.trim() || null,
    'Телефон':       document.getElementById('emp-phone')?.value.trim() || null,
    'Телеграм имя':  document.getElementById('emp-tg')?.value.trim() || null,
    'Инстаграм':     document.getElementById('emp-ig')?.value.trim() || null,
    'Статус':        document.getElementById('emp-status')?.value || 'Активный',
    'Формат найма':  document.getElementById('emp-format')?.value.trim() || null,
    'Пароль':        document.getElementById('emp-password')?.value || null,
  };

  // Remove null values for clean update
  Object.keys(fields).forEach(k => { if (fields[k] === null) delete fields[k]; });

  try {
    if (id) {
      await Airtable.update(CONFIG.TABLES.EMPLOYEES, id, fields);
      const emp = State.employees.find(e => e.id === id);
      if (emp) Object.assign(emp.fields, fields);
      toast('Сотрудник обновлён ✓');
    } else {
      const result = await Airtable.create(CONFIG.TABLES.EMPLOYEES, fields);
      if (result.records?.[0]) State.employees.push(result.records[0]);
      toast('Сотрудник создан ✓');
    }
    closeEmployeeDrawer();
    renderEmployeesTable(State.employees);
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

async function deleteEmployee(id, name) {
  if (!confirm(`Удалить сотрудника "${name}"? Это действие нельзя отменить.`)) return;
  try {
    await Airtable.remove(CONFIG.TABLES.EMPLOYEES, id);
    State.employees = State.employees.filter(e => e.id !== id);
    renderEmployeesTable(State.employees);
    toast('Сотрудник удалён');
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

window.openEmployeeDrawer = openEmployeeDrawer;
window.closeEmployeeDrawer = closeEmployeeDrawer;
window.saveEmployee = saveEmployee;
window.deleteEmployee = deleteEmployee;

// ════════════════════════════════════════════════════
// ─── Тарифы ───
// ════════════════════════════════════════════════════
async function loadAdminTariffs() {
  const el = document.getElementById('tariffs-content');
  if (!el) return;
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
  try {
    const rows = await Airtable.getAll(CONFIG.TABLES.TARIFFS);
    State.tariffs = rows;
    renderTariffsTable(rows);
  } catch(e) { el.innerHTML = `<div class="empty-state">Ошибка: ${escHtml(e.message)}</div>`; }
}

function renderTariffsTable(rows) {
  const el = document.getElementById('tariffs-content');
  if (!el) return;
  const QTY_FIELDS = [
    'Кол-во: Сценарий Reels','Кол-во: Съемка Reels','Кол-во: Монтаж Reels',
    'Кол-во: Сторителлингов сторис','Кол-во: Тредс','Кол-во: Телеграм чат',
    'Кол-во: Вацап чат','Кол-во: Чат бот','Кол-во: Мультипостинг',
    'Кол-во: Таргет ФБ','Кол-во: Карусели','Кол-во: Упаковка',
    'Кол-во: Консалтинг','Кол-во: Бриф-разбор','Кол-во: Постинг рилс и сторис'
  ];
  el.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
      <h2 style="margin:0; font-size:20px; font-weight:800;">🏷️ Тарифы</h2>
      <button class="btn btn-primary" onclick="openTariffDrawer(null)">+ Добавить тариф</button>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Название</th><th>Стоимость</th><th>Рилсы</th><th>Сторис</th><th>Упаковка</th><th>Действия</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const f = r.fields;
            return `<tr>
              <td><strong style="color:#fff;">${escHtml(f['Название']||'—')}</strong></td>
              <td style="color:#34d399; font-weight:700;">${Number(f['Стоимость']||0).toLocaleString('ru-RU')} ₸</td>
              <td style="color:var(--text2);">${Number(f['Кол-во: Монтаж Reels']||0)} шт</td>
              <td style="color:var(--text2);">${Number(f['Кол-во: Сторителлингов сторис']||0)} шт</td>
              <td style="color:var(--text2);">${Number(f['Кол-во: Упаковка']||0)} шт</td>
              <td style="display:flex; gap:6px;">
                <button class="btn btn-secondary btn-compact" onclick="openTariffDrawer('${r.id}')">✏️ Изменить</button>
                <button class="btn btn-danger btn-compact" onclick="deleteTariff('${r.id}','${escHtml(f['Название']||'')}')" style="padding:0 10px;">🗑</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div id="drawer-tariff" class="overlay" onclick="if(event.target===this)closeTariffDrawer()">
      <div class="drawer" style="max-width:520px; overflow-y:auto;">
        <button class="drawer-close-btn" onclick="closeTariffDrawer()">&times;</button>
        <div id="tariff-drawer-content"></div>
      </div>
    </div>`;
}

function openTariffDrawer(id) {
  const isNew = !id;
  const t = id ? State.tariffs.find(r => r.id === id) : null;
  const f = t ? t.fields : {};
  const QTY = [
    ['Кол-во: Сценарий Reels','Сценарии Reels'],['Кол-во: Съемка Reels','Съёмка Reels'],
    ['Кол-во: Монтаж Reels','Монтаж Reels'],['Кол-во: Сторителлингов сторис','Сторис'],
    ['Кол-во: Тредс','Тредс'],['Кол-во: Телеграм чат','Телеграм чат'],
    ['Кол-во: Вацап чат','Вацап чат'],['Кол-во: Чат бот','Чат бот'],
    ['Кол-во: Мультипостинг','Мультипостинг'],['Кол-во: Таргет ФБ','Таргет ФБ'],
    ['Кол-во: Карусели','Карусели'],['Кол-во: Упаковка','Упаковка'],
    ['Кол-во: Консалтинг','Консалтинг'],['Кол-во: Бриф-разбор','Бриф-разбор'],
    ['Кол-во: Постинг рилс и сторис','Постинг Reels/Stories']
  ];
  document.getElementById('tariff-drawer-content').innerHTML = `
    <div class="drawer-handle"></div>
    <h3 class="drawer-title" style="margin-bottom:20px;">${isNew ? '➕ Новый тариф' : '✏️ ' + escHtml(f['Название']||'Тариф')}</h3>
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div class="form-group">
        <label class="form-label">Название *</label>
        <input class="form-input" id="tar-name" placeholder="Тариф Стандарт, VIP..." value="${escHtml(f['Название']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Стоимость (₸) *</label>
        <input class="form-input" id="tar-price" type="number" placeholder="0" value="${f['Стоимость']||''}"/>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.07); padding-top:12px; margin-top:4px;">
        <div style="font-size:12px; font-weight:700; color:var(--text2); margin-bottom:10px; text-transform:uppercase; letter-spacing:0.06em;">Включено в тариф</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          ${QTY.map(([key, label]) => `
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:11px;">${escHtml(label)}</label>
              <input class="form-input compact-input" data-tar-key="${escHtml(key)}" type="number" min="0" placeholder="0" value="${Number(f[key]||0)||''}"/>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div style="display:flex; gap:10px; margin-top:24px;">
      <button class="btn btn-primary" style="flex:1;" onclick="saveTariff('${id||''}')">
        ${isNew ? '➕ Создать' : '💾 Сохранить'}
      </button>
      <button class="btn btn-secondary" onclick="closeTariffDrawer()">Отмена</button>
    </div>`;
  document.getElementById('drawer-tariff').classList.add('open');
}

function closeTariffDrawer() {
  const d = document.getElementById('drawer-tariff');
  if (d) d.classList.remove('open');
}

async function saveTariff(id) {
  const name = document.getElementById('tar-name')?.value.trim();
  const price = Number(document.getElementById('tar-price')?.value) || 0;
  if (!name) { toast('Введите название тарифа', 'error'); return; }
  const fields = { 'Название': name, 'Стоимость': price };
  document.querySelectorAll('[data-tar-key]').forEach(inp => {
    const v = Number(inp.value) || 0;
    if (v > 0) fields[inp.dataset.tarKey] = v;
    else fields[inp.dataset.tarKey] = 0;
  });
  try {
    if (id) {
      await Airtable.update(CONFIG.TABLES.TARIFFS, id, fields);
      const t = State.tariffs.find(r => r.id === id);
      if (t) Object.assign(t.fields, fields);
      toast('Тариф обновлён ✓');
    } else {
      const res = await Airtable.create(CONFIG.TABLES.TARIFFS, fields);
      if (res.records?.[0]) State.tariffs.push(res.records[0]);
      toast('Тариф создан ✓');
    }
    closeTariffDrawer();
    renderTariffsTable(State.tariffs);
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

async function deleteTariff(id, name) {
  if (!confirm(`Удалить тариф "${name}"?`)) return;
  try {
    await Airtable.remove(CONFIG.TABLES.TARIFFS, id);
    State.tariffs = State.tariffs.filter(r => r.id !== id);
    renderTariffsTable(State.tariffs);
    toast('Тариф удалён');
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

window.openTariffDrawer = openTariffDrawer;
window.closeTariffDrawer = closeTariffDrawer;
window.saveTariff = saveTariff;
window.deleteTariff = deleteTariff;

// ════════════════════════════════════════════════════
// ─── Конструктор тарифов ───
// ════════════════════════════════════════════════════

// Группировка услуг по категориям с иконками
const CATEGORY_ICONS = {
  'Рилс': '🎬',
  'Сторис': '📱',
  'Тредс': '🧵',
  'Телеграм': '✈️',
  'Вацап': '💬',
  'Чат бот': '🤖',
  'Мультипостинг': '📡',
  'Таргет ФБ': '🎯',
  'Карусели': '🎠',
  'Упаковка': '📦',
  'Консалтинг': '💡',
  'YouTube видео': '▶️',
  'Разборы': '🔍',
  'Постинг': '📤',
};

async function loadTariffConstructor() {
  const el = document.getElementById('tariff-constructor-content');
  if (!el) return;
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
  try {
    const [tariffs, services] = await Promise.all([
      Airtable.getAll(CONFIG.TABLES.TARIFFS),
      Airtable.getAll(CONFIG.TABLES.SERVICES),
    ]);
    State.tariffs = tariffs;
    State.services = services;
    renderTariffConstructorPage();
  } catch(e) {
    el.innerHTML = `<div class="empty-state">Ошибка: ${escHtml(e.message)}</div>`;
  }
}

function _tcCalcTariff(tariffFields, serviceLookup) {
  let totalCost = 0;
  const breakdown = [];
  for (const [key, qtyVal] of Object.entries(tariffFields)) {
    if (!key.startsWith('Кол-во:')) continue;
    const qty = Number(qtyVal) || 0;
    if (qty <= 0) continue;
    const svcName = findServiceName(key);
    const svc = serviceLookup[svcName];
    if (!svc) continue;
    let itemCost = 0;
    if (svcName === 'Съемка Reels') {
      itemCost = (qty / 10) * svc.sebes;
    } else {
      itemCost = qty * svc.sebes;
    }
    totalCost += itemCost;
    breakdown.push({ name: svcName, qty, unit: svc.unit, sebes: svc.sebes, itemCost });
  }
  return { totalCost, breakdown };
}

function renderTariffConstructorPage() {
  const el = document.getElementById('tariff-constructor-content');
  if (!el) return;

  // Строим serviceLookup
  const serviceLookup = {};
  (State.services || []).forEach(s => {
    const f = s.fields || {};
    const name = f['Название услуги'];
    if (name) serviceLookup[name] = {
      sebes: Number(f['Себестоимость']) || 0,
      unit: f['Ед. измерения'] || 'шт',
      category: f['Категория'] || 'Прочее'
    };
  });

  const tariffs = State.tariffs || [];

  const cardsHtml = tariffs.length === 0
    ? `<div style="color:var(--text2); font-size:13px; padding:20px 0;">Нет тарифов. Создайте первый!</div>`
    : tariffs.map(t => {
        const f = t.fields || {};
        const name = f['Название'] || '—';
        const salePrice = Number(f['Стоимость']) || 0;
        const { totalCost, breakdown } = _tcCalcTariff(f, serviceLookup);
        const profit = salePrice - totalCost;
        const margin = salePrice > 0 ? Math.round((profit / salePrice) * 100) : 0;
        const marginColor = margin >= 70 ? '#34d399' : margin >= 50 ? '#f59e0b' : '#ef4444';
        const activeSvcs = breakdown.filter(b => b.qty > 0);
        const badgesHtml = activeSvcs.slice(0, 5).map(b => {
          const icon = CATEGORY_ICONS[serviceLookup[b.name]?.category] || '•';
          return `<span style="background:rgba(255,255,255,0.06); border-radius:6px; padding:2px 8px; font-size:11px; white-space:nowrap;">${icon} ${escHtml(b.name.replace(' Reels','').replace(' настройка','').replace('YouTube видео ','YT '))}: ${b.qty}</span>`;
        }).join('');
        const moreBadges = activeSvcs.length > 5 ? `<span style="color:var(--text2); font-size:11px;">+${activeSvcs.length - 5} ещё</span>` : '';

        return `
          <div class="card" style="padding:18px; display:flex; flex-direction:column; gap:12px; cursor:pointer; transition:all 0.2s;" onclick="openTariffConstructorDrawer('${t.id}')">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div style="font-size:16px; font-weight:800; color:#fff;">${escHtml(name)}</div>
              <div style="display:flex; gap:6px; align-items:center;">
                <button onclick="event.stopPropagation(); deleteTariffFromConstructor('${t.id}','${escHtml(name)}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:16px; padding:2px 4px;" title="Удалить">🗑️</button>
              </div>
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
              <div>
                <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Цена</div>
                <div style="font-size:18px; font-weight:800; color:#34d399;">${salePrice.toLocaleString('ru-RU')} ₸</div>
              </div>
              <div>
                <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Себестоимость</div>
                <div style="font-size:18px; font-weight:800; color:#fb7185;">${totalCost.toLocaleString('ru-RU')} ₸</div>
              </div>
              <div>
                <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Маржа</div>
                <div style="font-size:18px; font-weight:800; color:${marginColor};">${margin}%</div>
              </div>
              <div>
                <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Прибыль</div>
                <div style="font-size:18px; font-weight:800; color:#a78bfa;">${profit.toLocaleString('ru-RU')} ₸</div>
              </div>
            </div>
            ${activeSvcs.length > 0 ? `<div style="display:flex; flex-wrap:wrap; gap:6px;">${badgesHtml}${moreBadges}</div>` : `<div style="color:var(--text2); font-size:12px;">Состав не задан</div>`}
          </div>`;
      }).join('');

  el.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
      <h2 style="margin:0; font-size:20px; font-weight:800;">🏗️ Конструктор тарифов</h2>
      <button class="btn btn-primary" onclick="openTariffConstructorDrawer(null)" style="background:linear-gradient(135deg,#6366f1,#8b5cf6); border:none; color:#fff !important; height:38px; padding:0 18px; display:inline-flex; align-items:center; gap:6px;">➕ Новый тариф</button>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px; margin-bottom:24px;">
      ${cardsHtml}
    </div>

    <!-- DRAWER-КОНСТРУКТОР -->
    <div id="drawer-tc" class="overlay" onclick="if(event.target===this)closeTariffConstructorDrawer()">
      <div class="drawer" style="width:600px; max-width:95vw; max-height:95vh; overflow-y:auto; display:flex; flex-direction:column;">
        <button class="drawer-close-btn" onclick="closeTariffConstructorDrawer()">&times;</button>
        <div id="tc-drawer-content"></div>
      </div>
    </div>`;
}

function openTariffConstructorDrawer(id) {
  const isNew = !id;
  const t = id ? (State.tariffs || []).find(r => r.id === id) : null;
  const f = t ? (t.fields || {}) : {};

  // Строим serviceLookup
  const serviceLookup = {};
  (State.services || []).forEach(s => {
    const sf = s.fields || {};
    const name = sf['Название услуги'];
    if (name) serviceLookup[name] = {
      sebes: Number(sf['Себестоимость']) || 0,
      unit: sf['Ед. измерения'] || 'шт',
      category: sf['Категория'] || 'Прочее'
    };
  });

  // Группируем услуги по категориям
  const byCategory = {};
  (State.services || []).forEach(s => {
    const sf = s.fields || {};
    const cat = sf['Категория'] || 'Прочее';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(sf);
  });

  // Обратный маппинг: serviceName → tariff key (без "Кол-во: ")
  const svcToTarKey = {};
  if (typeof TARIFF_SERVICE_MAP !== 'undefined') {
    for (const [tarKey, svcName] of Object.entries(TARIFF_SERVICE_MAP)) {
      svcToTarKey[svcName] = tarKey;
    }
  }

  const rowsHtml = Object.entries(byCategory).map(([cat, svcs]) => {
    const icon = CATEGORY_ICONS[cat] || '📌';
    const rowsInCat = svcs.map(sf => {
      const svcName = sf['Название услуги'] || '';
      const tarKey = svcToTarKey[svcName] ? ('Кол-во: ' + svcToTarKey[svcName]) : null;
      if (!tarKey) return '';
      const currentQty = tarKey ? (Number(f[tarKey]) || 0) : 0;
      const sebes = Number(sf['Себестоимость']) || 0;
      const unit = sf['Ед. измерения'] || 'шт';
      const lineTotal = svcName === 'Съемка Reels'
        ? Math.round((currentQty / 10) * sebes)
        : currentQty * sebes;
      return `
        <div style="display:grid; grid-template-columns:1fr 80px 120px 100px; gap:8px; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
          <div>
            <div style="font-size:13px; font-weight:600; color:#fff;">${escHtml(svcName)}</div>
            ${svcName === 'Съемка Reels' ? `<div style="font-size:10px; color:var(--text2);">норм: 10 рилс = 1 ч</div>` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" min="0" data-tar-key="${escHtml(tarKey)}" data-svc="${escHtml(svcName)}" data-sebes="${sebes}"
              value="${currentQty || ''}" placeholder="0"
              oninput="tcRecalc()"
              style="width:72px; height:32px; background:var(--surface); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; font-size:13px; font-weight:700; text-align:center; padding:0 4px;"/>
          </div>
          <div style="font-size:12px; color:var(--text2);">${escHtml(unit)} × ${sebes.toLocaleString('ru-RU')} ₸</div>
          <div id="tc-line-${escHtml(tarKey.replace(/[^a-zA-Zа-яА-Я0-9]/g,'_'))}" style="font-size:13px; font-weight:700; color:${lineTotal > 0 ? '#fb7185' : 'var(--text2)'}; text-align:right;">${lineTotal > 0 ? lineTotal.toLocaleString('ru-RU') + ' ₸' : '—'}</div>
        </div>`;
    }).filter(Boolean).join('');
    if (!rowsInCat) return '';
    return `
      <div style="margin-bottom:4px;">
        <div style="font-size:12px; font-weight:800; color:var(--text2); text-transform:uppercase; letter-spacing:0.06em; padding:10px 0 4px; display:flex; align-items:center; gap:6px;">${icon} ${escHtml(cat)}</div>
        ${rowsInCat}
      </div>`;
  }).join('');

  const salePrice = Number(f['Стоимость']) || 0;
  const { totalCost } = _tcCalcTariff(f, serviceLookup);
  const profit = salePrice - totalCost;
  const margin = salePrice > 0 ? Math.round((profit / salePrice) * 100) : 0;
  const marginColor = margin >= 70 ? '#34d399' : margin >= 50 ? '#f59e0b' : '#ef4444';

  document.getElementById('tc-drawer-content').innerHTML = `
    <div class="drawer-handle"></div>
    <div class="drawer-title" style="margin-bottom:16px;">${isNew ? '➕ Новый тариф' : '✏️ ' + escHtml(f['Название'] || 'Тариф')}</div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">Название тарифа *</label>
        <input id="tc-name" class="form-input" placeholder="Тариф Стандарт..." value="${escHtml(f['Название'] || '')}"/>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">Цена продажи (₸) *</label>
        <input id="tc-price" class="form-input" type="number" placeholder="0" value="${salePrice || ''}" oninput="tcRecalc()"/>
      </div>
    </div>

    <!-- Живая статистика -->
    <div id="tc-stats" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:20px; background:var(--surface2); border-radius:12px; padding:14px; border:1px solid rgba(255,255,255,0.06);">
      <div style="text-align:center;">
        <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Себестоимость</div>
        <div id="tc-stat-cost" style="font-size:16px; font-weight:800; color:#fb7185;">${totalCost.toLocaleString('ru-RU')} ₸</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Цена</div>
        <div id="tc-stat-price" style="font-size:16px; font-weight:800; color:#34d399;">${salePrice.toLocaleString('ru-RU')} ₸</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Прибыль</div>
        <div id="tc-stat-profit" style="font-size:16px; font-weight:800; color:#a78bfa;">${profit.toLocaleString('ru-RU')} ₸</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Маржа</div>
        <div id="tc-stat-margin" style="font-size:16px; font-weight:800; color:${marginColor};">${margin}%</div>
      </div>
    </div>

    <!-- Индикатор маржи -->
    <div style="margin-bottom:20px; background:var(--surface2); border-radius:8px; height:8px; overflow:hidden;">
      <div id="tc-margin-bar" style="height:8px; border-radius:8px; background:${marginColor}; width:${Math.min(Math.max(margin,0),100)}%; transition:all 0.3s;"></div>
    </div>

    <!-- Состав тарифа -->
    <div style="font-size:12px; font-weight:800; color:var(--text2); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px;">📋 Состав тарифа</div>
    <div style="padding:0 4px;">
      <!-- Шапка таблицы -->
      <div style="display:grid; grid-template-columns:1fr 80px 120px 100px; gap:8px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.08);">
        <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase;">Услуга</div>
        <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase;">Кол-во</div>
        <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase;">Ед. × Цена</div>
        <div style="font-size:10px; color:var(--text2); font-weight:700; text-transform:uppercase; text-align:right;">Итого</div>
      </div>
      ${rowsHtml}
    </div>

    <div style="display:flex; gap:10px; margin-top:24px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.06);">
      <button id="tc-save-btn" class="btn btn-primary" style="flex:1; background:linear-gradient(135deg,#6366f1,#8b5cf6); border:none; color:#fff !important;" onclick="saveTariffFromConstructor('${id || ''}')">
        ${isNew ? '➕ Создать тариф' : '💾 Сохранить'}
      </button>
      <button class="btn btn-secondary" onclick="closeTariffConstructorDrawer()">Отмена</button>
    </div>`;

  document.getElementById('drawer-tc').classList.add('open');
}

function tcRecalc() {
  // Пересчёт себестоимости в реальном времени
  const serviceLookup = {};
  (State.services || []).forEach(s => {
    const sf = s.fields || {};
    const name = sf['Название услуги'];
    if (name) serviceLookup[name] = { sebes: Number(sf['Себестоимость']) || 0 };
  });

  let totalCost = 0;
  document.querySelectorAll('#tc-drawer-content [data-tar-key]').forEach(inp => {
    const qty = Number(inp.value) || 0;
    const svcName = inp.dataset.svc;
    const sebes = Number(inp.dataset.sebes) || 0;
    let itemCost = 0;
    if (svcName === 'Съемка Reels') {
      itemCost = (qty / 10) * sebes;
    } else {
      itemCost = qty * sebes;
    }
    totalCost += itemCost;

    // Обновляем строку
    const lineId = 'tc-line-' + inp.dataset.tarKey.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_');
    const lineEl = document.getElementById(lineId);
    if (lineEl) {
      lineEl.textContent = itemCost > 0 ? itemCost.toLocaleString('ru-RU') + ' ₸' : '—';
      lineEl.style.color = itemCost > 0 ? '#fb7185' : 'var(--text2)';
    }
  });

  const salePrice = Number(document.getElementById('tc-price')?.value) || 0;
  const profit = salePrice - totalCost;
  const margin = salePrice > 0 ? Math.round((profit / salePrice) * 100) : 0;
  const marginColor = margin >= 70 ? '#34d399' : margin >= 50 ? '#f59e0b' : '#ef4444';

  const costEl = document.getElementById('tc-stat-cost');
  const priceEl = document.getElementById('tc-stat-price');
  const profitEl = document.getElementById('tc-stat-profit');
  const marginEl = document.getElementById('tc-stat-margin');
  const barEl = document.getElementById('tc-margin-bar');

  if (costEl) costEl.textContent = totalCost.toLocaleString('ru-RU') + ' ₸';
  if (priceEl) { priceEl.textContent = salePrice.toLocaleString('ru-RU') + ' ₸'; }
  if (profitEl) { profitEl.textContent = profit.toLocaleString('ru-RU') + ' ₸'; profitEl.style.color = profit >= 0 ? '#a78bfa' : '#ef4444'; }
  if (marginEl) { marginEl.textContent = margin + '%'; marginEl.style.color = marginColor; }
  if (barEl) { barEl.style.width = Math.min(Math.max(margin, 0), 100) + '%'; barEl.style.background = marginColor; }
}

function closeTariffConstructorDrawer() {
  const d = document.getElementById('drawer-tc');
  if (d) d.classList.remove('open');
}

async function saveTariffFromConstructor(id) {
  const name = document.getElementById('tc-name')?.value.trim();
  const price = Number(document.getElementById('tc-price')?.value) || 0;
  if (!name) { toast('Введите название тарифа', 'error'); return; }

  const fields = { 'Название': name, 'Стоимость': price };
  document.querySelectorAll('#tc-drawer-content [data-tar-key]').forEach(inp => {
    fields[inp.dataset.tarKey] = Number(inp.value) || 0;
  });

  const btn = document.getElementById('tc-save-btn');
  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
    if (id) {
      await Airtable.update(CONFIG.TABLES.TARIFFS, id, fields);
      const t = (State.tariffs || []).find(r => r.id === id);
      if (t) Object.assign(t.fields, fields);
      toast('Тариф обновлён ✓');
    } else {
      const res = await Airtable.create(CONFIG.TABLES.TARIFFS, fields);
      if (res.records?.[0]) State.tariffs.push(res.records[0]);
      toast('Тариф создан ✓');
    }
    closeTariffConstructorDrawer();
    renderTariffConstructorPage();
  } catch(e) {
    toast('Ошибка: ' + e.message, 'error');
  } finally {
    btn.innerHTML = id ? '💾 Сохранить' : '➕ Создать тариф';
    btn.disabled = false;
  }
}

async function deleteTariffFromConstructor(id, name) {
  if (!confirm(`Удалить тариф "${name}"?`)) return;
  try {
    await Airtable.remove(CONFIG.TABLES.TARIFFS, id);
    State.tariffs = (State.tariffs || []).filter(r => r.id !== id);
    renderTariffConstructorPage();
    toast('Тариф удалён');
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

window.loadTariffConstructor = loadTariffConstructor;
window.openTariffConstructorDrawer = openTariffConstructorDrawer;
window.closeTariffConstructorDrawer = closeTariffConstructorDrawer;
window.saveTariffFromConstructor = saveTariffFromConstructor;
window.deleteTariffFromConstructor = deleteTariffFromConstructor;
window.tcRecalc = tcRecalc;

// ════════════════════════════════════════════════════
// ─── Цены на услуги ───
// ════════════════════════════════════════════════════
async function loadAdminServices() {
  const el = document.getElementById('services-content');
  if (!el) return;
  el.innerHTML = `<div class="loading-state"><div class="spinner"></div></div>`;
  try {
    const rows = await Airtable.getAll(CONFIG.TABLES.SERVICES);
    State.services = rows;
    renderServicesTable(rows);
  } catch(e) { el.innerHTML = `<div class="empty-state">Ошибка: ${escHtml(e.message)}</div>`; }
}

function renderServicesTable(rows) {
  const el = document.getElementById('services-content');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
      <h2 style="margin:0; font-size:20px; font-weight:800;">💲 Цены на услуги</h2>
      <button class="btn btn-primary" onclick="openServiceDrawer(null)">+ Добавить услугу</button>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Название</th><th>Категория</th><th>Ед. изм.</th><th>Цена продажи</th><th>Себестоимость</th><th>Маржа</th><th>Действия</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const f = r.fields;
            const sale = Number(f['Цена продажи']||0);
            const sebes = Number(f['Себестоимость']||0);
            const margin = sale - sebes;
            const marginPct = sale > 0 ? Math.round(margin/sale*100) : 0;
            return `<tr>
              <td><strong style="color:#fff;">${escHtml(f['Название услуги']||'—')}</strong></td>
              <td style="color:var(--text2); font-size:12px;">${escHtml(f['Категория']||'—')}</td>
              <td style="color:var(--text2);">${escHtml(f['Ед. измерения']||'шт')}</td>
              <td style="color:#34d399; font-weight:700;">${sale.toLocaleString('ru-RU')} ₸</td>
              <td style="color:#f59e0b;">${sebes.toLocaleString('ru-RU')} ₸</td>
              <td style="color:${marginPct>=50?'#34d399':marginPct>=30?'#f59e0b':'#ef4444'}; font-weight:600;">${marginPct}%</td>
              <td style="display:flex; gap:6px;">
                <button class="btn btn-secondary btn-compact" onclick="openServiceDrawer('${r.id}')">✏️</button>
                <button class="btn btn-danger btn-compact" onclick="deleteService('${r.id}','${escHtml(f['Название услуги']||'')}')" style="padding:0 10px;">🗑</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div id="drawer-service" class="overlay" onclick="if(event.target===this)closeServiceDrawer()">
      <div class="drawer" style="max-width:440px;">
        <button class="drawer-close-btn" onclick="closeServiceDrawer()">&times;</button>
        <div id="service-drawer-content"></div>
      </div>
    </div>`;
}

function openServiceDrawer(id) {
  const isNew = !id;
  const s = id ? State.services.find(r => r.id === id) : null;
  const f = s ? s.fields : {};
  document.getElementById('service-drawer-content').innerHTML = `
    <div class="drawer-handle"></div>
    <h3 class="drawer-title" style="margin-bottom:20px;">${isNew ? '➕ Новая услуга' : '✏️ ' + escHtml(f['Название услуги']||'Услуга')}</h3>
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div class="form-group">
        <label class="form-label">Название *</label>
        <input class="form-input" id="svc-name" placeholder="Съёмка Reels, Монтаж..." value="${escHtml(f['Название услуги']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Категория</label>
        <input class="form-input" id="svc-cat" placeholder="Производство, Маркетинг..." value="${escHtml(f['Категория']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Единица измерения</label>
        <input class="form-input" id="svc-unit" placeholder="шт, ч, мес..." value="${escHtml(f['Ед. измерения']||'')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Цена продажи (₸)</label>
        <input class="form-input" id="svc-sale" type="number" placeholder="0" value="${f['Цена продажи']||''}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Себестоимость (₸)</label>
        <input class="form-input" id="svc-sebes" type="number" placeholder="0" value="${f['Себестоимость']||''}"/>
      </div>
    </div>
    <div style="display:flex; gap:10px; margin-top:24px;">
      <button class="btn btn-primary" style="flex:1;" onclick="saveService('${id||''}')">
        ${isNew ? '➕ Создать' : '💾 Сохранить'}
      </button>
      <button class="btn btn-secondary" onclick="closeServiceDrawer()">Отмена</button>
    </div>`;
  document.getElementById('drawer-service').classList.add('open');
}

function closeServiceDrawer() {
  const d = document.getElementById('drawer-service');
  if (d) d.classList.remove('open');
}

async function saveService(id) {
  const name = document.getElementById('svc-name')?.value.trim();
  if (!name) { toast('Введите название услуги', 'error'); return; }
  const fields = {
    'Название услуги': name,
    'Категория':       document.getElementById('svc-cat')?.value.trim() || null,
    'Ед. измерения':   document.getElementById('svc-unit')?.value.trim() || null,
    'Цена продажи':    Number(document.getElementById('svc-sale')?.value) || 0,
    'Себестоимость':   Number(document.getElementById('svc-sebes')?.value) || 0,
  };
  Object.keys(fields).forEach(k => { if (fields[k] === null) delete fields[k]; });
  try {
    if (id) {
      await Airtable.update(CONFIG.TABLES.SERVICES, id, fields);
      const s = State.services.find(r => r.id === id);
      if (s) Object.assign(s.fields, fields);
      toast('Услуга обновлена ✓');
    } else {
      const res = await Airtable.create(CONFIG.TABLES.SERVICES, fields);
      if (res.records?.[0]) State.services.push(res.records[0]);
      toast('Услуга создана ✓');
    }
    closeServiceDrawer();
    renderServicesTable(State.services);
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

async function deleteService(id, name) {
  if (!confirm(`Удалить услугу "${name}"?`)) return;
  try {
    await Airtable.remove(CONFIG.TABLES.SERVICES, id);
    State.services = State.services.filter(r => r.id !== id);
    renderServicesTable(State.services);
    toast('Услуга удалена');
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}

window.openServiceDrawer = openServiceDrawer;
window.closeServiceDrawer = closeServiceDrawer;
window.saveService = saveService;
window.deleteService = deleteService;

// ════════════════════════════════════════════════════
// ─── Партнеры ───
// ════════════════════════════════════════════════════
async function loadAdminPartners() {
  const el = document.getElementById('partners-content');
  if (!el) return;
  if (typeof loadPartners === 'function') loadPartners();
  const partners = JSON.parse(localStorage.getItem('crm_partners') || '["Абдулла","Дарина","Сухраб"]');
  el.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
      <h2 style="margin:0; font-size:20px; font-weight:800;">🤝 Партнеры</h2>
    </div>
    <div class="card" style="max-width:480px;">
      <div id="admin-partners-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
        ${partners.map(p => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:rgba(255,255,255,0.04); border-radius:10px;">
            <span style="font-weight:600;">${escHtml(p)}</span>
            <button class="btn btn-danger btn-compact" onclick="adminDeletePartner('${escHtml(p)}')">Удалить</button>
          </div>`).join('')}
      </div>
      <div style="display:flex; gap:8px;">
        <input id="admin-new-partner" class="form-input compact-input" placeholder="Имя нового партнера" style="flex:1"/>
        <button class="btn btn-primary" onclick="adminAddPartner()">Добавить</button>
      </div>
    </div>`;
}

function adminAddPartner() {
  const input = document.getElementById('admin-new-partner');
  const name = (input?.value || '').trim();
  if (!name) return;
  const partners = JSON.parse(localStorage.getItem('crm_partners') || '["Абдулла","Дарина","Сухраб"]');
  if (!partners.includes(name)) { partners.push(name); localStorage.setItem('crm_partners', JSON.stringify(partners)); }
  if (typeof loadPartners === 'function') loadPartners();
  if (typeof populatePartnersDropdown === 'function') populatePartnersDropdown();
  loadAdminPartners();
}
function adminDeletePartner(name) {
  let partners = JSON.parse(localStorage.getItem('crm_partners') || '["Абдулла","Дарина","Сухраб"]');
  partners = partners.filter(p => p !== name);
  localStorage.setItem('crm_partners', JSON.stringify(partners));
  if (typeof loadPartners === 'function') loadPartners();
  if (typeof populatePartnersDropdown === 'function') populatePartnersDropdown();
  loadAdminPartners();
}
window.adminAddPartner = adminAddPartner;
window.adminDeletePartner = adminDeletePartner;

// ════════════════════════════════════════════════════
// CHARTS — инициализация графиков аналитики
// ════════════════════════════════════════════════════

