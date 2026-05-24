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
// CHARTS — инициализация графиков аналитики
// ════════════════════════════════════════════════════

