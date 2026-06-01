// === ERP FINANCE MODULE ===

// ─── Загрузка и инициализация модуля
async function loadFinance() {
  // Показываем спиннер в единой таблице
  const tbody = document.getElementById('finance-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="an-empty"><span class="spinner"></span> Загрузка...</td></tr>`;

  try {
    const [incomes, expenses, accounts, categories] = await Promise.all([
      Airtable.getAll(CONFIG.TABLES.FINANCE_INCOMES),
      Airtable.getAll(CONFIG.TABLES.FINANCE_EXPENSES),
      Airtable.getAll(CONFIG.TABLES.FINANCE_ACCOUNTS),
      Airtable.getAll(CONFIG.TABLES.FINANCE_CATEGORIES)
    ]);
    
    State.financeIncomes = incomes;
    State.financeExpenses = expenses;
    State.financeAccounts = accounts;
    State.financeCategories = categories;

    // Обеспечиваем фоновую или ленивую загрузку зависимостей CRM, если они пусты
    if (State.clients.length === 0) State.clients = await Airtable.getAll(CONFIG.TABLES.CLIENTS);
    if (State.deals.length === 0) State.deals = await Airtable.getAll(CONFIG.TABLES.DEALS);
    if (State.employees.length === 0) State.employees = await Airtable.getAll(CONFIG.TABLES.EMPLOYEES);
    if (State.tariffs.length === 0) State.tariffs = await Airtable.getAll(CONFIG.TABLES.TARIFFS);

    renderFinanceDashboard();
  } catch (e) {
    toast('Ошибка загрузки финансов: ' + e.message, 'error');
  }
}

// ─── Вспомогательные функции для работы с датами и категориями
function getTransactionCategoryType(txFields) {
  const catId = Array.isArray(txFields['Категория ID']) ? txFields['Категория ID'][0] : txFields['Категория ID'];
  const catName = txFields['Категория'];
  
  if (catId) {
    const cat = State.financeCategories.find(c => String(c.id) === String(catId));
    if (cat) return cat.fields['Тип'] || '';
  }
  if (catName) {
    const cat = State.financeCategories.find(c => (c.fields['Наименование'] || '').trim().toLowerCase() === String(catName).trim().toLowerCase());
    if (cat) return cat.fields['Тип'] || '';
  }
  return '';
}

function formatLocalDateToYMD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getYYYYMMDD(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  
  // Case 1: YYYY-MM-DD
  const mYmd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mYmd) return `${mYmd[1]}-${mYmd[2]}-${mYmd[3]}`;
  
  // Case 2: DD.MM.YYYY
  const mDmy = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (mDmy) return `${mDmy[3]}-${mDmy[2]}-${mDmy[1]}`;
  
  // Fallback: local components
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function initFinancePeriod() {
  const startEl = document.getElementById('fin-date-start');
  const endEl = document.getElementById('fin-date-end');
  
  if (startEl && endEl && !startEl.value && !endEl.value) {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    startEl.value = formatLocalDateToYMD(firstDay);
    endEl.value = formatLocalDateToYMD(lastDay);
  }
}

function filterByPeriod(txDateStr) {
  const txYmd = getYYYYMMDD(txDateStr);
  if (!txYmd) return false;
  
  const startVal = document.getElementById('fin-date-start')?.value;
  const endVal = document.getElementById('fin-date-end')?.value;
  
  if (startVal && txYmd < startVal) return false;
  if (endVal && txYmd > endVal) return false;
  return true;
}

// ─── Рендеринг дашборда и реестра транзакций
function renderFinanceDashboard() {
  // Инициализация периода
  initFinancePeriod();

  // 1. Отрисовка счетов
  renderAccountsList();

  // 2. Фильтрация Доходов
  let filteredIncomes = State.financeIncomes.filter(i => {
    const f = i.fields;
    const dateOk = filterByPeriod(f['Дата транзакции']);
    const accountOk = !State.financeSelectedAccount || 
                      String(f['Источник ID'] || '').split(',').map(x=>x.trim()).includes(String(State.financeSelectedAccount));
    
    let searchOk = true;
    if (State.financeSearch) {
      const q = State.financeSearch;
      const note = (f['Примечание'] || '').toLowerCase();
      const client = (f['Клиент'] || '').toLowerCase();
      const manager = (f['Менеджер'] || '').toLowerCase();
      const partner = (f['Партнер'] || '').toLowerCase();
      searchOk = note.includes(q) || client.includes(q) || manager.includes(q) || partner.includes(q);
    }
    return dateOk && accountOk && searchOk;
  });

  // 3. Фильтрация Расходов
  let filteredExpenses = State.financeExpenses.filter(e => {
    const f = e.fields;
    const dateOk = filterByPeriod(f['Дата транзакции']);
    const accountOk = !State.financeSelectedAccount || 
                      String(f['Источник ID'] || '').split(',').map(x=>x.trim()).includes(String(State.financeSelectedAccount));
    
    let searchOk = true;
    if (State.financeSearch) {
      const q = State.financeSearch;
      const note = (f['Примечание'] || '').toLowerCase();
      const employee = (f['Сотрудник'] || '').toLowerCase();
      const budget = (f['Бюджет'] || '').toLowerCase();
      searchOk = note.includes(q) || employee.includes(q) || budget.includes(q);
    }
    return dateOk && accountOk && searchOk;
  });

  // 4. Расчет метрик
  const totalBalance = State.financeAccounts
    .filter(a => a.fields['Вкл'])
    .reduce((sum, a) => sum + (Number(a.fields['Баланс счета']) || 0), 0);

  const totalIncomeExpected = filteredIncomes
    .filter(i => getTransactionCategoryType(i.fields) === 'Доходы')
    .reduce((sum, i) => sum + (Number(i.fields['Цена тарифа']) || Number(i.fields['Сумма']) || 0), 0);

  const totalIncomeActual = filteredIncomes
    .filter(i => getTransactionCategoryType(i.fields) === 'Доходы')
    .reduce((sum, i) => sum + (Number(i.fields['Сумма']) || 0), 0);

  const totalInflowsActual = filteredIncomes
    .filter(i => getTransactionCategoryType(i.fields) === 'Приходы')
    .reduce((sum, i) => sum + (Number(i.fields['Сумма']) || 0), 0);

  const totalExpenses = filteredExpenses
    .filter(e => getTransactionCategoryType(e.fields) === 'Расходы')
    .reduce((sum, e) => sum + (Number(e.fields['Сумма']) || 0), 0);

  const totalOutflows = filteredExpenses
    .filter(e => getTransactionCategoryType(e.fields) === 'Затраты')
    .reduce((sum, e) => sum + (Number(e.fields['Сумма']) || 0), 0);

  const netProfit = totalIncomeActual - totalExpenses;

  // Отрисовка метрик
  document.getElementById('fin-stat-balance').textContent = totalBalance.toLocaleString('ru-RU') + ' ₸';
  document.getElementById('fin-stat-income-expected').textContent = totalIncomeExpected.toLocaleString('ru-RU') + ' ₸';
  document.getElementById('fin-stat-income-actual').textContent = totalIncomeActual.toLocaleString('ru-RU') + ' ₸';
  
  const inflowStatEl = document.getElementById('fin-stat-inflows-actual');
  if (inflowStatEl) inflowStatEl.textContent = totalInflowsActual.toLocaleString('ru-RU') + ' ₸';

  document.getElementById('fin-stat-expenses').textContent = totalExpenses.toLocaleString('ru-RU') + ' ₸';

  const outflowStatEl = document.getElementById('fin-stat-outflows');
  if (outflowStatEl) outflowStatEl.textContent = totalOutflows.toLocaleString('ru-RU') + ' ₸';
  
  const profitEl = document.getElementById('fin-stat-profit');
  if (profitEl) {
    profitEl.textContent = netProfit.toLocaleString('ru-RU') + ' ₸';
    profitEl.style.color = netProfit >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  // 5. Фильтрация чекбоксами для единой таблицы
  const showIncomes = document.getElementById('filter-type-incomes')?.checked ?? true;
  const showInflows = document.getElementById('filter-type-inflows')?.checked ?? true;
  const showExpenses = document.getElementById('filter-type-expenses')?.checked ?? true;
  const showOutflows = document.getElementById('filter-type-outflows')?.checked ?? true;

  const incomesWithMeta = filteredIncomes.map(i => ({
    ...i,
    _table: 'incomes',
    _type: getTransactionCategoryType(i.fields)
  }));
  const expensesWithMeta = filteredExpenses.map(e => ({
    ...e,
    _table: 'expenses',
    _type: getTransactionCategoryType(e.fields)
  }));

  let merged = [...incomesWithMeta, ...expensesWithMeta];

  // Сортировка по убыванию даты
  merged.sort((a, b) => {
    const dateA = a.fields['Дата транзакции'] || '';
    const dateB = b.fields['Дата транзакции'] || '';
    return dateB.localeCompare(dateA);
  });

  // Фильтр по типам
  merged = merged.filter(tx => {
    const type = tx._type;
    if (type === 'Доходы') return showIncomes;
    if (type === 'Приходы') return showInflows;
    if (type === 'Расходы') return showExpenses;
    if (type === 'Затраты') return showOutflows;
    return true;
  });

  renderUnifiedTransactionsTable(merged.slice(0, 100));
}

// ─── Отрисовка счетов
function renderAccountsList() {
  const listEl = document.getElementById('finance-accounts-list');
  if (!listEl) return;
  
  const activeAccs = State.financeAccounts.filter(a => a.fields['Вкл']);
  if (activeAccs.length === 0) {
    listEl.innerHTML = `<div style="color:var(--text2); font-size:12px; padding:8px 0;">Нет доступных счетов</div>`;
    return;
  }
  
  listEl.innerHTML = activeAccs.map(acc => {
    const isSelected = String(State.financeSelectedAccount) === String(acc.id);
    const balance = Number(acc.fields['Баланс счета']) || 0;
    const formattedBalance = balance.toLocaleString('ru-RU') + ' ' + (acc.fields['Валюта'] || '₸');
    const pillStyle = isSelected
      ? `background:var(--accent-gradient); border-color:transparent; color:#fff;`
      : `background:var(--surface2); border:1px solid rgba(255,255,255,0.08); color:var(--text);`;
    
    return `
      <div onclick="toggleAccountFilter('${acc.id}')" style="cursor:pointer; display:flex; flex-direction:column; gap:4px; padding:10px 14px; border-radius:12px; min-width:110px; transition:all 0.2s; ${pillStyle}">
        <div style="font-size:11px; font-weight:700; opacity:0.8; white-space:nowrap;">${escHtml(acc.fields['Наименование'])}</div>
        <div style="font-size:14px; font-weight:800;">${formattedBalance}</div>
      </div>
    `;
  }).join('');
}

function toggleAccountFilter(accountId) {
  if (State.financeSelectedAccount === accountId) {
    State.financeSelectedAccount = null;
  } else {
    State.financeSelectedAccount = accountId;
  }
  renderFinanceDashboard();
}

// ─── Отрисовка единой таблицы транзакций
function renderUnifiedTransactionsTable(transactions) {
  const tbody = document.getElementById('finance-tbody');
  if (!tbody) return;

  if (transactions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="an-empty">Нет записей за выбранный период</td></tr>`;
    return;
  }

  tbody.innerHTML = transactions.map(item => {
    const f = item.fields;
    const amount = Number(f['Сумма']) || 0;
    const type = item._type;
    const isIncome = (type === 'Доходы');
    const isInflow = (type === 'Приходы');
    const isExpense = (type === 'Расходы');
    const isOutflow = (type === 'Затраты');
    
    let amountHtml = '';
    if (isIncome) {
      const tariffPrice = Number(f['Цена тарифа']) || amount;
      const displayAmount = amount.toLocaleString('ru-RU') + ' ' + (f['Валюта'] || '₸');
      const displayTariffPrice = tariffPrice.toLocaleString('ru-RU') + ' ' + (f['Валюта'] || '₸');
      amountHtml = `
        <div style="font-weight:800; color:var(--success);">${displayAmount}</div>
        <div style="font-size:11px; color:var(--text2);">Договор: ${displayTariffPrice}</div>
      `;
    } else {
      let colorClass = 'var(--text)';
      if (isInflow) colorClass = '#06b6d4';
      else if (isExpense) colorClass = 'var(--danger)';
      else if (isOutflow) colorClass = '#f97316';
      
      const displayAmount = amount.toLocaleString('ru-RU') + ' ' + (f['Валюта'] || '₸');
      amountHtml = `<div style="font-weight:800; color:${colorClass};">${displayAmount}</div>`;
    }
    
    let typeHtml = '';
    if (isIncome) typeHtml = `<span class="badge badge-green" style="white-space:nowrap;">💰 Доход</span>`;
    else if (isInflow) typeHtml = `<span class="badge" style="white-space:nowrap; background:#06b6d4; color:#fff;">📥 Приход</span>`;
    else if (isExpense) typeHtml = `<span class="badge badge-red" style="white-space:nowrap;">💸 Расход</span>`;
    else if (isOutflow) typeHtml = `<span class="badge" style="white-space:nowrap; background:#f97316; color:#fff;">📉 Затраты</span>`;
    
    const accountName = f['Источник'] || '—';
    const categoryName = f['Категория'] || '—';
    
    let clientDealHtml = '';
    if (isIncome || isInflow) {
      const clientName = f['Клиент'] || '—';
      const dealName = f['Заказ'] || '—';
      clientDealHtml = `
        <div style="font-weight:600;">${escHtml(clientName)}</div>
        <div style="font-size:11px; color:var(--text2);">${escHtml(dealName)}</div>
      `;
    } else {
      const employeeName = f['Сотрудник'] || '—';
      const dealName = f['Заказ'] || '—';
      clientDealHtml = `
        <div style="font-weight:600;">${escHtml(employeeName)}</div>
        <div style="font-size:11px; color:var(--text2);">${escHtml(dealName)}</div>
      `;
    }
    
    const note = f['Примечание'] || '';
    let metaDetails = `👤 ${escHtml(f['Кто добавил'] || '—')}`;
    if (isIncome) {
      const managerName = f['Менеджер'] || '';
      const partner = f['Партнер'] || '';
      if (managerName) metaDetails += ' | Отв: ' + escHtml(managerName);
      if (partner) metaDetails += ' | Партнер: ' + escHtml(partner);
    } else if (isExpense) {
      const budget = f['Бюджет'] || '';
      if (budget) metaDetails += ' | Бюджет: ' + escHtml(budget);
    }
    
    const noteHtml = `
      <div style="font-weight:600; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(note)}">${escHtml(note || '—')}</div>
      <div style="font-size:11px; color:var(--text2); margin-top:2px;">${metaDetails}</div>
    `;
    
    const dateStr = formatDate(f['Дата транзакции']);
    const deleteFnCall = item._table === 'incomes' ? `deleteIncome('${item.id}')` : `deleteExpense('${item.id}')`;
    
    return `
      <tr>
        <td style="white-space:nowrap;">${dateStr}</td>
        <td>${typeHtml}</td>
        <td>${amountHtml}</td>
        <td><span class="badge badge-gray">${escHtml(accountName)}</span></td>
        <td><span class="badge badge-gray" style="background:rgba(255,255,255,0.06); color:#fff;">${escHtml(categoryName)}</span></td>
        <td>${clientDealHtml}</td>
        <td>${noteHtml}</td>
        <td>
          <button onclick="${deleteFnCall}" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:14px; padding:4px;" title="Удалить запись">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Заполнение выпадающих списков
async function populateDropdown(selectId, tableId, placeholderText, displayFieldName, filterFn = null) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  
  let list = [];
  if (tableId === CONFIG.TABLES.FINANCE_ACCOUNTS) {
    if (State.financeAccounts.length === 0) State.financeAccounts = await Airtable.getAll(tableId);
    list = State.financeAccounts;
  } else if (tableId === CONFIG.TABLES.FINANCE_CATEGORIES) {
    if (State.financeCategories.length === 0) State.financeCategories = await Airtable.getAll(tableId);
    list = State.financeCategories;
  } else if (tableId === CONFIG.TABLES.CLIENTS) {
    if (State.clients.length === 0) State.clients = await Airtable.getAll(tableId);
    list = State.clients;
  } else if (tableId === CONFIG.TABLES.DEALS) {
    if (State.deals.length === 0) State.deals = await Airtable.getAll(tableId);
    list = State.deals;
  } else if (tableId === CONFIG.TABLES.EMPLOYEES) {
    if (State.employees.length === 0) State.employees = await Airtable.getAll(tableId);
    list = State.employees;
  } else if (tableId === CONFIG.TABLES.TARIFFS) {
    if (State.tariffs.length === 0) State.tariffs = await Airtable.getAll(tableId);
    list = State.tariffs;
  }

  if (filterFn) {
    list = list.filter(filterFn);
  }

  let extraOptions = '';
  if (selectId === 'uni-client') {
    extraOptions = `<option value="new_client" style="font-weight:700; color:#3b82f6;">➕ Добавить нового клиента...</option>`;
  } else if (selectId === 'uni-deal') {
    extraOptions = `<option value="new_deal" style="font-weight:700; color:#3b82f6;">➕ Добавить новый проект...</option>`;
  }

  sel.innerHTML = `<option value="">${placeholderText}</option>` + extraOptions +
    list.map(item => `<option value="${item.id}">${escHtml(item.fields[displayFieldName] || '')}${tableId === CONFIG.TABLES.FINANCE_ACCOUNTS ? ' (' + escHtml(item.fields['Валюта'] || '₸') + ')' : ''}</option>`).join('');
}

// ─── Помощник для выпадающего списка счетов в CRM
async function populateFinanceAccountsSelect(selectId) {
  await populateDropdown(selectId, CONFIG.TABLES.FINANCE_ACCOUNTS, 'Выберите счет', 'Наименование', a => a.fields['Вкл']);
  const mainAcc = State.financeAccounts.find(a => a.fields['Основной'] && a.fields['Вкл']);
  const sel = document.getElementById(selectId);
  if (mainAcc && sel) {
    sel.value = mainAcc.id;
  }
}
window.populateFinanceAccountsSelect = populateFinanceAccountsSelect;

// ─── Изменение баланса счета в Baserow
async function adjustAccountBalance(accountId, amountChange) {
  if (!accountId) return;
  try {
    if (State.financeAccounts.length === 0) {
      State.financeAccounts = await Airtable.getAll(CONFIG.TABLES.FINANCE_ACCOUNTS);
    }
    const acc = State.financeAccounts.find(a => String(a.id) === String(accountId));
    if (acc) {
      const currentBalance = Number(acc.fields['Баланс счета']) || 0;
      const newBalance = currentBalance + amountChange;
      await Airtable.update(CONFIG.TABLES.FINANCE_ACCOUNTS, accountId, {
        'Баланс счета': newBalance
      });
      acc.fields['Баланс счета'] = newBalance;
      renderAccountsList();
    }
  } catch (e) {
    console.error('Ошибка изменения баланса счета:', e);
  }
}
window.adjustAccountBalance = adjustAccountBalance;

// ─── Удаление Дохода
async function deleteIncome(id) {
  if (!confirm('Вы действительно хотите удалить эту запись о доходе?')) return;
  try {
    const income = State.financeIncomes.find(i => i.id === id);
    if (!income) return;
    const amount = Number(income.fields['Сумма']) || 0;
    const accountIds = income.fields['Источник ID'] || '';
    await Airtable.remove(CONFIG.TABLES.FINANCE_INCOMES, id);
    if (accountIds) {
      const firstAccId = String(accountIds).split(',')[0].trim();
      await adjustAccountBalance(firstAccId, -amount);
    }
    toast('Запись дохода удалена ✓');
    await loadFinance();
  } catch (e) {
    toast('Ошибка удаления: ' + e.message, 'error');
  }
}

// ─── Удаление Расхода
async function deleteExpense(id) {
  if (!confirm('Вы действительно хотите удалить эту запись о расходе?')) return;
  try {
    const expense = State.financeExpenses.find(e => e.id === id);
    if (!expense) return;
    const amount = Number(expense.fields['Сумма']) || 0;
    const accountIds = expense.fields['Источник ID'] || '';
    await Airtable.remove(CONFIG.TABLES.FINANCE_EXPENSES, id);
    if (accountIds) {
      const firstAccId = String(accountIds).split(',')[0].trim();
      await adjustAccountBalance(firstAccId, amount);
    }
    toast('Запись расхода удалена ✓');
    await loadFinance();
  } catch (e) {
    toast('Ошибка удаления: ' + e.message, 'error');
  }
}

// ─── Соответствие тарифа и категории
function matchTariffToCategory(tariffName) {
  if (!tariffName) return null;
  const cleanTariff = tariffName.trim().toLowerCase().replace(/^тариф\s+/i, '');
  if (State.financeCategories.length === 0) return null;
  
  for (const cat of State.financeCategories) {
    if (!cat.fields['Отображать в доходах']) continue;
    const cleanCat = (cat.fields['Наименование'] || '').trim().toLowerCase().replace(/^тариф\s+/i, '');
    const syns = (cat.fields['Синонимы'] || '').split(',').map(s => s.trim().toLowerCase().replace(/^тариф\s+/i, ''));
    if (cleanCat === cleanTariff || syns.includes(cleanTariff) || cleanCat.includes(cleanTariff) || cleanTariff.includes(cleanCat)) {
      return cat.id;
    }
  }
  const fallback = State.financeCategories.find(c => (c.fields['Наименование'] || '').includes('Прочие'));
  return fallback ? fallback.id : (State.financeCategories[0]?.id || null);
}
window.matchTariffToCategory = matchTariffToCategory;

// ─── События фильтров и кнопок сброса периода
function onFinanceDateRangeChange() {
  renderFinanceDashboard();
}
window.onFinanceDateRangeChange = onFinanceDateRangeChange;

function onFinanceSearch() {
  State.financeSearch = document.getElementById('finance-search-input').value.trim().toLowerCase();
  renderFinanceDashboard();
}
window.onFinanceSearch = onFinanceSearch;

function onFinanceTypeFilterChange() {
  renderFinanceDashboard();
}
window.onFinanceTypeFilterChange = onFinanceTypeFilterChange;

function resetFinancePeriodToCurrentMonth() {
  const startEl = document.getElementById('fin-date-start');
  const endEl = document.getElementById('fin-date-end');
  if (startEl && endEl) {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    startEl.value = formatLocalDateToYMD(firstDay);
    endEl.value = formatLocalDateToYMD(lastDay);
    renderFinanceDashboard();
  }
}
window.resetFinancePeriodToCurrentMonth = resetFinancePeriodToCurrentMonth;

function resetFinancePeriodToLastMonth() {
  const startEl = document.getElementById('fin-date-start');
  const endEl = document.getElementById('fin-date-end');
  if (startEl && endEl) {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth(), 0);
    startEl.value = formatLocalDateToYMD(firstDay);
    endEl.value   = formatLocalDateToYMD(lastDay);
    renderFinanceDashboard();
  }
}
window.resetFinancePeriodToLastMonth = resetFinancePeriodToLastMonth;

function resetFinancePeriodToCurrentYear() {
  const startEl = document.getElementById('fin-date-start');
  const endEl = document.getElementById('fin-date-end');
  if (startEl && endEl) {
    const now = new Date();
    startEl.value = `${now.getFullYear()}-01-01`;
    endEl.value   = `${now.getFullYear()}-12-31`;
    renderFinanceDashboard();
  }
}
window.resetFinancePeriodToCurrentYear = resetFinancePeriodToCurrentYear;

function resetFinancePeriodToAllTime() {
  const startEl = document.getElementById('fin-date-start');
  const endEl = document.getElementById('fin-date-end');
  if (startEl && endEl) {
    startEl.value = '';
    endEl.value = '';
    renderFinanceDashboard();
  }
}
window.resetFinancePeriodToAllTime = resetFinancePeriodToAllTime;

// ─── Единая форма добавления операции (Unified Op Drawer)
async function openAddOperationMenu() {
  openDrawer('drawer-operation-unified');
  await prepareUnifiedOpDrawer();
}
window.openAddOperationMenu = openAddOperationMenu;

async function prepareUnifiedOpDrawer(type = 'Доходы') {
  document.getElementById('uni-amount').value = '';
  document.getElementById('uni-date').value = formatLocalDateToYMD(new Date());
  document.getElementById('uni-partner').value = '';
  document.getElementById('uni-budget').value = '';
  document.getElementById('uni-note').value = '';
  document.getElementById('uni-lead-id').value = ''; // сброс лида
  
  const typeSelect = document.getElementById('uni-op-type');
  if (typeSelect) typeSelect.value = type;
  setUnifiedOpTypeEnabled(true);
  
  await populateDropdown('uni-account', CONFIG.TABLES.FINANCE_ACCOUNTS, 'Выберите счет', 'Наименование', a => a.fields['Вкл']);
  const mainAcc = State.financeAccounts.find(a => a.fields['Основной'] && a.fields['Вкл']);
  if (mainAcc) {
    document.getElementById('uni-account').value = mainAcc.id;
  }
  
  await populateDropdown('uni-client', CONFIG.TABLES.CLIENTS, 'Выберите клиента', 'Имя');
  await populateDropdown('uni-deal', CONFIG.TABLES.DEALS, 'Выберите проект', 'Название сделки');
  await populateDropdown('uni-employee', CONFIG.TABLES.EMPLOYEES, 'Выберите сотрудника', 'Имя');
  
  // Загружаем и заполняем список партнеров
  loadPartners();
  populatePartnersDropdown();
  
  onUnifiedOpTypeChange(type);
}
window.prepareUnifiedOpDrawer = prepareUnifiedOpDrawer;

async function openUniNewClientForm() {
  closeDrawer('drawer-operation-unified');
  State.uniClientCallbackActive = true;
  if (typeof prepareClientDrawer === 'function') prepareClientDrawer();
  
  // Prefill from active lead details if available
  const leadId = document.getElementById('uni-lead-id')?.value;
  if (leadId) {
    const lead = State.leads.find(l => l.id === leadId);
    if (lead) {
      const f = lead.fields;
      const clientName = getField(f, CONFIG.LEAD_FIELDS.name) || '';
      document.getElementById('c-name').value = clientName;
      document.getElementById('c-phone').value = getField(f, CONFIG.LEAD_FIELDS.phone) || '';
      document.getElementById('c-niche').value = getField(f, CONFIG.LEAD_FIELDS.source) || '';
    }
  }
  openDrawer('drawer-client');
}
window.openUniNewClientForm = openUniNewClientForm;

async function openUniNewDealForm() {
  closeDrawer('drawer-operation-unified');
  State.uniDealCallbackActive = true;
  
  // Clear d-name, d-amount, d-comment, d-date-start
  ['d-name','d-amount','d-date-start','d-comment'].forEach(elId => {
    const el = document.getElementById(elId); if (el) el.value = '';
  });
  
  const selectedClientId = document.getElementById('uni-client')?.value || '';
  if (typeof populateClientSelect === 'function') populateClientSelect();
  
  setTimeout(() => {
    const dealClientEl = document.getElementById('d-client');
    if (dealClientEl && selectedClientId) {
      dealClientEl.value = selectedClientId;
    }
  }, 50);

  const leadId = document.getElementById('uni-lead-id')?.value;
  if (leadId) {
    const lead = State.leads.find(l => l.id === leadId);
    if (lead) {
      const f = lead.fields;
      const clientName = getField(f, CONFIG.LEAD_FIELDS.name) || '';
      document.getElementById('d-name').value = clientName;
      document.getElementById('d-amount').value = f['Бюджет'] || '';
      
      if (typeof populateTariffSelect === 'function') populateTariffSelect('d-tariff');
      if (typeof populateEmployeeSelect === 'function') populateEmployeeSelect('d-project');
      
      setTimeout(() => {
        const leadTariffId = f['Тариф ID']?.[0] || f['Тариф ID'] || '';
        if (leadTariffId) {
          const tariffEl = document.getElementById('d-tariff');
          if (tariffEl) tariffEl.value = leadTariffId;
        } else if (f['Тариф']) {
          const matchTariff = State.tariffs.find(t => t.fields['Название'] === f['Тариф']);
          const tariffEl = document.getElementById('d-tariff');
          if (tariffEl && matchTariff) tariffEl.value = matchTariff.id;
        }
        
        const managerName = f['Менеджер'];
        if (managerName) {
          const managerEmp = State.employees.find(e => e.fields['Имя'] === managerName);
          const empEl = document.getElementById('d-project');
          if (empEl && managerEmp) empEl.value = managerEmp.id;
        }
      }, 50);
    }
  }
  
  openDrawer('drawer-deal');
}
window.openUniNewDealForm = openUniNewDealForm;

// ─── Управление Партнерами
function loadPartners() {
  let partners = [];
  try {
    const stored = localStorage.getItem('crm_partners');
    if (stored) {
      partners = JSON.parse(stored);
    } else {
      partners = ['Абдулла', 'Дарина', 'Сухраб'];
      localStorage.setItem('crm_partners', JSON.stringify(partners));
    }
  } catch (e) {
    partners = ['Абдулла', 'Дарина', 'Сухраб'];
  }
  State.partnersList = partners;
}
window.loadPartners = loadPartners;

function populatePartnersDropdown() {
  const sel = document.getElementById('uni-partner');
  if (!sel) return;
  
  if (!State.partnersList) loadPartners();
  
  sel.innerHTML = '<option value="">Выберите партнера</option>' +
    State.partnersList.map(name => `<option value="${escHtml(name)}">${escHtml(name)}</option>`).join('');
}
window.populatePartnersDropdown = populatePartnersDropdown;

function openManagePartnersDrawer() {
  openDrawer('drawer-manage-partners');
  renderManagePartnersList();
}
window.openManagePartnersDrawer = openManagePartnersDrawer;

function renderManagePartnersList() {
  const container = document.getElementById('manage-partners-list');
  if (!container) return;
  
  if (!State.partnersList) loadPartners();
  
  if (State.partnersList.length === 0) {
    container.innerHTML = '<div style="color:var(--text2); font-size:13px; text-align:center; padding:10px;">Нет добавленных партнеров</div>';
    return;
  }
  
  container.innerHTML = State.partnersList.map(name => `
    <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;">
      <span style="font-weight:600; color:#fff;">${escHtml(name)}</span>
      <button class="btn btn-tool btn-tool-danger btn-compact" onclick="deletePartner('${escHtml(name)}')" style="padding:0 !important; width:30px; height:30px; display:inline-flex; align-items:center; justify-content:center;">🗑</button>
    </div>
  `).join('');
}
window.renderManagePartnersList = renderManagePartnersList;

function addNewPartner() {
  const input = document.getElementById('new-partner-name');
  if (!input) return;
  
  const name = input.value.trim();
  if (!name) { toast('Введите имя партнера', 'error'); return; }
  
  if (!State.partnersList) loadPartners();
  if (State.partnersList.includes(name)) { toast('Такой партнер уже есть в списке', 'error'); return; }
  
  State.partnersList.push(name);
  localStorage.setItem('crm_partners', JSON.stringify(State.partnersList));
  input.value = '';
  
  toast('Партнер добавлен ✓');
  renderManagePartnersList();
  populatePartnersDropdown();
}
window.addNewPartner = addNewPartner;

function deletePartner(name) {
  if (!confirm(`Удалить партнера "${name}" из списка?`)) return;
  
  if (!State.partnersList) loadPartners();
  State.partnersList = State.partnersList.filter(p => p !== name);
  localStorage.setItem('crm_partners', JSON.stringify(State.partnersList));
  
  toast('Партнер удален ✓');
  renderManagePartnersList();
  populatePartnersDropdown();
}
window.deletePartner = deletePartner;

function setUnifiedOpTypeEnabled(enabled) {
  const typeSelect = document.getElementById('uni-op-type');
  if (typeSelect) {
    typeSelect.disabled = !enabled;
  }
}
window.setUnifiedOpTypeEnabled = setUnifiedOpTypeEnabled;

function onUnifiedOpTypeChange(type) {
  const isIncome = (type === 'Доходы');
  const isInflow = (type === 'Приходы');
  const isExpense = (type === 'Расходы');
  const isOutflow = (type === 'Затраты');
  
  const amountLabel = document.getElementById('uni-amount-label');
  if (amountLabel) {
    if (isIncome) amountLabel.textContent = 'Сумма в кассу *';
    else if (isInflow) amountLabel.textContent = 'Сумма прихода *';
    else if (isExpense) amountLabel.textContent = 'Сумма расхода *';
    else if (isOutflow) amountLabel.textContent = 'Сумма затрат *';
  }
  
  const amountGrid = document.getElementById('uni-amount-grid');
  if (amountGrid) {
    amountGrid.style.gridTemplateColumns = isIncome ? '1fr 1fr' : '1fr';
  }
  
  const tariffPriceGroup = document.getElementById('uni-tariff-price-group');
  if (tariffPriceGroup) tariffPriceGroup.style.display = isIncome ? 'block' : 'none';
  
  const clientGroup = document.getElementById('uni-client-group');
  if (clientGroup) clientGroup.style.display = isIncome ? 'block' : 'none';
  
  const dealGroup = document.getElementById('uni-deal-group');
  if (dealGroup) dealGroup.style.display = (isIncome || isExpense) ? 'block' : 'none';
  
  const employeeGroup = document.getElementById('uni-employee-group');
  const employeeLabel = document.getElementById('uni-employee-label');
  if (employeeGroup) {
    employeeGroup.style.display = (isIncome || isExpense) ? 'block' : 'none';
    if (employeeLabel) {
      employeeLabel.textContent = isIncome ? 'Менеджер' : 'Сотрудник';
    }
  }
  
  const partnerGroup = document.getElementById('uni-partner-group');
  if (partnerGroup) partnerGroup.style.display = isIncome ? 'block' : 'none';
  
  const budgetGroup = document.getElementById('uni-budget-group');
  if (budgetGroup) budgetGroup.style.display = isExpense ? 'block' : 'none';
  
  populateDropdown('uni-category', CONFIG.TABLES.FINANCE_CATEGORIES, 'Выберите категорию', 'Наименование', c => c.fields['Тип'] === type && c.fields['Вкл']);
}
window.onUnifiedOpTypeChange = onUnifiedOpTypeChange;

async function onUnifiedClientChange(clientId) {
  const dealSel = document.getElementById('uni-deal');
  if (!dealSel) return;
  if (!clientId) {
    await populateDropdown('uni-deal', CONFIG.TABLES.DEALS, 'Выберите проект', 'Название сделки');
    return;
  }
  
  if (State.deals.length === 0) {
    State.deals = await Airtable.getAll(CONFIG.TABLES.DEALS);
  }
  
  const clientDeals = State.deals.filter(d => {
    const clientIds = String(d.fields['Клиент ID'] || '').split(',').map(id => id.trim());
    return clientIds.includes(String(clientId));
  });
  
  dealSel.innerHTML = `<option value="">Выберите проект</option>` +
    `<option value="new_deal" style="font-weight:700; color:#3b82f6;">➕ Добавить новый проект...</option>` +
    clientDeals.map(d => `<option value="${d.id}">${escHtml(d.fields['Название сделки'] || 'Без названия')}</option>`).join('');
}
window.onUnifiedClientChange = onUnifiedClientChange;

function onUnifiedAmountInput(val) {
}

async function saveUnifiedOperation() {
  const btn = document.getElementById('save-unified-op-btn');
  const type = document.getElementById('uni-op-type').value;
  const amount = Number(document.getElementById('uni-amount').value) || 0;
  const date = document.getElementById('uni-date').value;
  const accountId = document.getElementById('uni-account').value;
  const categoryId = document.getElementById('uni-category').value;
  
  if (!amount) { toast('Введите сумму операции', 'error'); return; }
  if (!date) { toast('Выберите дату транзакции', 'error'); return; }
  if (!accountId) { toast('Выберите счет', 'error'); return; }
  if (!categoryId) { toast('Выберите категорию', 'error'); return; }
  
  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
    let clientId = '';
    let dealId = '';

    if (type === 'Доходы' || type === 'Расходы') {
      clientId = document.getElementById('uni-client')?.value || '';
      dealId = document.getElementById('uni-deal')?.value || '';
    }

    // 3. Обработка перевода лида (конвертация продаж/возвратов), если привязано
    const leadId = document.getElementById('uni-lead-id')?.value;
    if (leadId) {
      const lead = State.leads.find(l => l.id === leadId);
      if (lead) {
        const todayStr = new Date().toLocaleDateString('ru-RU');
        const stageField = getStageFieldName(lead.fields);
        
        const currentStage = getField(lead.fields, CONFIG.LEAD_FIELDS.stage) || '';

        if (type === 'Доходы' || type === 'Приходы') {
          // Сначала обновляем дополнительные поля лида
          await Airtable.update(CONFIG.TABLES.LEADS, leadId, {
            'Бюджет': amount,
            'Оплата': amount,
            'Дата продажи': todayStr,
          });
          lead.fields['Бюджет'] = amount;
          lead.fields['Оплата'] = amount;
          lead.fields['Дата продажи'] = todayStr;

          // Перемещаем в "Продано" через проверенную функцию
          if (typeof updateLeadStageOptimistic === 'function') {
            await updateLeadStageOptimistic(leadId, 'Продано', currentStage);
          }

        } else if (type === 'Расходы' || type === 'Затраты') {
          await Airtable.update(CONFIG.TABLES.LEADS, leadId, {
            'Дата возврата': todayStr,
          });
          lead.fields['Дата возврата'] = todayStr;

          // Перемещаем в "Возвраты"
          if (typeof updateLeadStageOptimistic === 'function') {
            await updateLeadStageOptimistic(leadId, 'Возвраты', currentStage);
          }
          
          // Также отменяем связанную сделку, если она есть
          const leadName = getField(lead.fields, CONFIG.LEAD_FIELDS.name);
          const targetDealId = dealId || (State.deals.find(d => d.fields['Клиент'] === leadName)?.id);
          if (targetDealId) {
            await Airtable.update(CONFIG.TABLES.DEALS, targetDealId, { 'Статус работы': 'Отменён' });
            const dealObj = State.deals.find(d => d.id === targetDealId);
            if (dealObj) dealObj.fields['Статус работы'] = 'Отменён';
          }
        }
        
        renderKanban(State.leads);
        renderLeadsStats();
      }
    }

    // 4. Проведение финансовой записи
    if (type === 'Доходы' || type === 'Приходы') {
      const tariffPrice = amount;
      const employeeId = type === 'Доходы' ? document.getElementById('uni-employee').value : '';
      const partner = type === 'Доходы' ? document.getElementById('uni-partner').value : '';
      const note = document.getElementById('uni-note').value.trim();
      
      const fields = {
        'ID транзакции': 'INC_' + Date.now(),
        'Дата транзакции': date,
        'Источник ID': [accountId],
        'Категория ID': [categoryId],
        'Сумма': amount,
        'Цена тарифа': tariffPrice,
        'Примечание': note,
        'Кто добавил': 'Менеджер',
        'Дата добавления': new Date().toLocaleString('ru-RU'),
        'Валюта': '₸',
        'Клиент ID': clientId ? [clientId] : [],
        'Менеджер ID': employeeId ? [employeeId] : [],
        'Заказ ID': dealId ? [dealId] : [],
        'Партнер': partner
      };
      
      await Airtable.create(CONFIG.TABLES.FINANCE_INCOMES, fields);
      await adjustAccountBalance(accountId, amount);
    } else {
      const employeeId = type === 'Расходы' ? document.getElementById('uni-employee').value : '';
      const budget = type === 'Расходы' ? document.getElementById('uni-budget').value.trim() : '';
      const note = document.getElementById('uni-note').value.trim();
      
      const fields = {
        'ID транзакции': 'EXP_' + Date.now(),
        'Дата транзакции': date,
        'Источник ID': [accountId],
        'Категория ID': [categoryId],
        'Сумма': amount,
        'Примечание': note,
        'Кто добавил': 'Менеджер',
        'Дата добавления': new Date().toLocaleString('ru-RU'),
        'Валюта': '₸',
        'Сотрудник ID': employeeId ? [employeeId] : [],
        'Заказ ID': dealId ? [dealId] : [],
        'Бюджет': budget
      };
      
      await Airtable.create(CONFIG.TABLES.FINANCE_EXPENSES, fields);
      await adjustAccountBalance(accountId, -amount);
    }
    
    toast('Операция успешно добавлена ✓');
    closeDrawer('drawer-operation-unified');
    if (leadId) {
      closeDrawer('drawer-detail');
    }
    await loadFinance();
  } catch (e) {
    toast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    btn.innerHTML = 'Сохранить операцию'; btn.disabled = false;
  }
}
window.saveUnifiedOperation = saveUnifiedOperation;

// ─── Управление счетами (CRUD в Drawer)
function renderManageAccountsList() {
  const container = document.getElementById('manage-accounts-list');
  if (!container) return;

  if (State.financeAccounts.length === 0) {
    container.innerHTML = `<div style="color:var(--text2); font-size:12px; text-align:center; padding:12px;">Нет счетов</div>`;
    return;
  }

  container.innerHTML = State.financeAccounts.map(acc => {
    const f = acc.fields;
    const balance = Number(f['Баланс счета']) || 0;
    const isMain = f['Основной'] ? true : false;

    return `
      <div id="acc-row-${acc.id}" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:10px 14px; margin-bottom:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-weight:700; color:#fff; font-size:13px;">${escHtml(f['Наименование'] || '—')}</span>
              ${isMain ? `<span style="font-size:10px; background:rgba(99,102,241,0.2); color:#a5b4fc; border-radius:4px; padding:1px 6px; font-weight:700;">Основной</span>` : ''}
            </div>
            <div style="font-size:12px; color:var(--text2); margin-top:2px;">${balance.toLocaleString('ru-RU')} ${f['Валюта'] || '₸'}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="display:inline-flex; align-items:center; gap:4px; cursor:pointer; margin:0; font-size:11px; color:var(--text2);" title="Показывать на главной странице финансов">
              <input type="checkbox" ${f['Вкл'] ? 'checked' : ''} onchange="toggleAccountActive('${acc.id}', this.checked)" style="width:14px; height:14px; accent-color:var(--accent); cursor:pointer;"/>
              На главной
            </label>
            <button onclick="openEditAccountRow('${acc.id}')" style="background:none; border:none; color:#60a5fa; cursor:pointer; font-size:14px; padding:4px;" title="Редактировать">✏️</button>
            <button onclick="deleteAccount('${acc.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:14px; padding:4px;" title="Удалить">🗑️</button>
          </div>
        </div>
        <div id="acc-edit-${acc.id}" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06);">
          <div style="display:grid; grid-template-columns:1fr 80px; gap:8px; margin-bottom:8px;">
            <input id="acc-edit-name-${acc.id}" class="form-input compact-input" type="text" placeholder="Название" value="${escHtml(f['Наименование'] || '')}"/>
            <select id="acc-edit-currency-${acc.id}" class="form-select compact-input">
              <option value="₸" ${(f['Валюта']||'₸')==='₸'?'selected':''}>₸</option>
              <option value="$" ${f['Валюта']==='$'?'selected':''}>$</option>
              <option value="₽" ${f['Валюта']==='₽'?'selected':''}>₽</option>
              <option value="€" ${f['Валюта']==='€'?'selected':''}>€</option>
            </select>
          </div>
          <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-size:12px; color:var(--text2); margin-bottom:8px;">
            <input type="checkbox" id="acc-edit-main-${acc.id}" ${isMain ? 'checked' : ''} style="accent-color:var(--accent);"/>
            Основной счёт
          </label>
          <div style="display:flex; gap:8px;">
            <button onclick="saveAccountEdit('${acc.id}')" class="btn btn-primary btn-compact" style="flex:1; height:32px; font-size:12px;">💾 Сохранить</button>
            <button onclick="closeEditAccountRow('${acc.id}')" class="btn btn-secondary btn-compact" style="height:32px; font-size:12px; padding:0 12px;">Отмена</button>
          </div>
        </div>
      </div>`;
  }).join('');
}
window.renderManageAccountsList = renderManageAccountsList;

function openEditAccountRow(id) {
  document.querySelectorAll('[id^="acc-edit-"]').forEach(el => {
    if (!el.id.startsWith('acc-edit-name') && !el.id.startsWith('acc-edit-currency') && !el.id.startsWith('acc-edit-main')) {
      el.style.display = 'none';
    }
  });
  const el = document.getElementById(`acc-edit-${id}`);
  if (el) el.style.display = 'block';
}
window.openEditAccountRow = openEditAccountRow;

function closeEditAccountRow(id) {
  const el = document.getElementById(`acc-edit-${id}`);
  if (el) el.style.display = 'none';
}
window.closeEditAccountRow = closeEditAccountRow;

async function saveAccountEdit(id) {
  const name     = document.getElementById(`acc-edit-name-${id}`)?.value.trim();
  const currency = document.getElementById(`acc-edit-currency-${id}`)?.value;
  const isMain   = document.getElementById(`acc-edit-main-${id}`)?.checked;
  if (!name) { toast('Введите название счёта', 'error'); return; }

  try {
    const fields = { 'Наименование': name, 'Валюта': currency, 'Основной': isMain };
    await Airtable.update(CONFIG.TABLES.FINANCE_ACCOUNTS, id, fields);
    const acc = State.financeAccounts.find(a => String(a.id) === String(id));
    if (acc) Object.assign(acc.fields, fields);
    // Если помечен основным — снимаем флаг у остальных локально
    if (isMain) {
      State.financeAccounts.forEach(a => { if (String(a.id) !== String(id)) a.fields['Основной'] = false; });
    }
    toast('Счёт обновлён ✓');
    renderManageAccountsList();
    renderFinanceDashboard();
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  }
}
window.saveAccountEdit = saveAccountEdit;

async function toggleAccountActive(id, state) {
  try {
    await Airtable.update(CONFIG.TABLES.FINANCE_ACCOUNTS, id, { 'Вкл': state });
    const acc = State.financeAccounts.find(a => String(a.id) === String(id));
    if (acc) {
      acc.fields['Вкл'] = state;
    }
    toast(state ? 'Счет включен ✓' : 'Счет выключен ✓');
    renderManageAccountsList();
    renderFinanceDashboard();
  } catch (e) {
    toast('Ошибка изменения статуса счета: ' + e.message, 'error');
  }
}
window.toggleAccountActive = toggleAccountActive;

async function deleteAccount(id) {
  if (!confirm('Вы действительно хотите удалить этот счет? Изменения необратимы.')) return;
  try {
    await Airtable.remove(CONFIG.TABLES.FINANCE_ACCOUNTS, id);
    State.financeAccounts = State.financeAccounts.filter(a => String(a.id) !== String(id));
    toast('Счет удален ✓');
    renderManageAccountsList();
    renderFinanceDashboard();
  } catch (e) {
    toast('Ошибка удаления счета: ' + e.message, 'error');
  }
}
window.deleteAccount = deleteAccount;

async function addNewAccount() {
  const nameInput = document.getElementById('new-acc-name');
  const currencyInput = document.getElementById('new-acc-currency');
  const initialInput = document.getElementById('new-acc-initial');
  const btn = document.getElementById('add-acc-btn');
  
  const name = nameInput.value.trim();
  const currency = currencyInput.value;
  const initial = Number(initialInput.value) || 0;
  
  if (!name) { toast('Введите название счета', 'error'); return; }
  
  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
    const fields = {
      'Наименование': name,
      'Валюта': currency,
      'Начальное значение': initial,
      'Баланс счета': initial,
      'Вкл': true,
      'Основной': false
    };
    const res = await Airtable.create(CONFIG.TABLES.FINANCE_ACCOUNTS, fields);
    const newRecord = res.records[0];
    State.financeAccounts.push(newRecord);
    
    nameInput.value = '';
    initialInput.value = '';
    
    toast('Счет успешно добавлен ✓');
    renderManageAccountsList();
    renderFinanceDashboard();
  } catch (e) {
    toast('Ошибка добавления счета: ' + e.message, 'error');
  } finally {
    btn.innerHTML = 'Добавить счет'; btn.disabled = false;
  }
}
window.addNewAccount = addNewAccount;

// ─── Управление категориями
const CAT_TYPE_ICONS = { 'Доходы': '💰', 'Приходы': '📥', 'Расходы': '💸', 'Затраты': '📉' };

function openManageCategoriesDrawer() {
  if (State.financeCategories.length === 0) {
    Airtable.getAll(CONFIG.TABLES.FINANCE_CATEGORIES).then(rows => {
      State.financeCategories = rows;
      renderManageCategoriesList();
    });
  } else {
    renderManageCategoriesList();
  }
  openDrawer('drawer-manage-categories');
}
window.openManageCategoriesDrawer = openManageCategoriesDrawer;

function renderManageCategoriesList() {
  const container = document.getElementById('manage-categories-list');
  if (!container) return;

  const cats = State.financeCategories;
  if (!cats.length) {
    container.innerHTML = `<div style="color:var(--text2); font-size:13px; text-align:center; padding:16px;">Нет категорий</div>`;
    return;
  }

  const types = ['Доходы', 'Приходы', 'Расходы', 'Затраты'];
  let html = '';

  for (const type of types) {
    const group = cats.filter(c => (c.fields['Тип'] || '') === type);
    if (!group.length) continue;
    html += `
      <div style="font-size:11px; font-weight:800; color:var(--text2); text-transform:uppercase; letter-spacing:0.06em; padding:10px 0 6px; display:flex; align-items:center; gap:6px;">
        ${CAT_TYPE_ICONS[type] || ''} ${type}
      </div>`;
    for (const cat of group) {
      const f = cat.fields;
      html += `
        <div id="cat-row-${cat.id}" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:10px 14px; margin-bottom:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="flex:1;">
              <span style="font-weight:600; color:#fff; font-size:13px;">${escHtml(f['Наименование'] || '—')}</span>
              ${!f['Вкл'] ? `<span style="font-size:10px; color:var(--text2); margin-left:6px;">(выкл)</span>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="display:inline-flex; align-items:center; gap:4px; cursor:pointer; margin:0; font-size:11px; color:var(--text2);">
                <input type="checkbox" ${f['Вкл'] ? 'checked' : ''} onchange="toggleCategoryActive('${cat.id}', this.checked)" style="width:14px; height:14px; accent-color:var(--accent); cursor:pointer;"/>
                Вкл
              </label>
              <button onclick="openEditCategoryRow('${cat.id}')" style="background:none; border:none; color:#60a5fa; cursor:pointer; font-size:14px; padding:4px;">✏️</button>
              <button onclick="deleteCategory('${cat.id}','${escHtml(f['Наименование']||'')}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:14px; padding:4px;">🗑️</button>
            </div>
          </div>
          <div id="cat-edit-${cat.id}" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06);">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
              <input id="cat-edit-name-${cat.id}" class="form-input compact-input" type="text" value="${escHtml(f['Наименование'] || '')}"/>
              <select id="cat-edit-type-${cat.id}" class="form-select compact-input">
                ${types.map(t => `<option value="${t}" ${(f['Тип']||'')=== t ? 'selected':''}>${CAT_TYPE_ICONS[t]} ${t}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex; gap:8px;">
              <button onclick="saveCategoryEdit('${cat.id}')" class="btn btn-primary btn-compact" style="flex:1; height:32px; font-size:12px;">💾 Сохранить</button>
              <button onclick="closeEditCategoryRow('${cat.id}')" class="btn btn-secondary btn-compact" style="height:32px; font-size:12px; padding:0 12px;">Отмена</button>
            </div>
          </div>
        </div>`;
    }
  }

  // Категории без типа
  const noType = cats.filter(c => !types.includes(c.fields['Тип'] || ''));
  if (noType.length) {
    html += `<div style="font-size:11px; font-weight:800; color:var(--text2); text-transform:uppercase; letter-spacing:0.06em; padding:10px 0 6px;">❓ Без типа</div>`;
    for (const cat of noType) {
      const f = cat.fields;
      html += `<div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:8px; padding:8px 12px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:13px; color:var(--text2);">${escHtml(f['Наименование']||'—')}</span>
        <button onclick="openEditCategoryRow('${cat.id}')" style="background:none; border:none; color:#60a5fa; cursor:pointer; font-size:13px; padding:2px 6px;">✏️</button>
      </div>`;
    }
  }

  container.innerHTML = html;
}
window.renderManageCategoriesList = renderManageCategoriesList;

function openEditCategoryRow(id) {
  document.querySelectorAll('[id^="cat-edit-"]').forEach(el => {
    if (el.id.match(/^cat-edit-\d+$/) && el.id !== `cat-edit-${id}`) el.style.display = 'none';
  });
  const el = document.getElementById(`cat-edit-${id}`);
  if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}
window.openEditCategoryRow = openEditCategoryRow;

function closeEditCategoryRow(id) {
  const el = document.getElementById(`cat-edit-${id}`);
  if (el) el.style.display = 'none';
}
window.closeEditCategoryRow = closeEditCategoryRow;

async function saveCategoryEdit(id) {
  const name = document.getElementById(`cat-edit-name-${id}`)?.value.trim();
  const type = document.getElementById(`cat-edit-type-${id}`)?.value;
  if (!name) { toast('Введите название', 'error'); return; }
  try {
    await Airtable.update(CONFIG.TABLES.FINANCE_CATEGORIES, id, { 'Наименование': name, 'Тип': type });
    const cat = State.financeCategories.find(c => String(c.id) === String(id));
    if (cat) { cat.fields['Наименование'] = name; cat.fields['Тип'] = type; }
    toast('Категория обновлена ✓');
    renderManageCategoriesList();
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}
window.saveCategoryEdit = saveCategoryEdit;

async function toggleCategoryActive(id, state) {
  try {
    await Airtable.update(CONFIG.TABLES.FINANCE_CATEGORIES, id, { 'Вкл': state });
    const cat = State.financeCategories.find(c => String(c.id) === String(id));
    if (cat) cat.fields['Вкл'] = state;
    toast(state ? 'Категория включена ✓' : 'Категория выключена ✓');
    renderManageCategoriesList();
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}
window.toggleCategoryActive = toggleCategoryActive;

async function deleteCategory(id, name) {
  if (!confirm(`Удалить категорию "${name}"? Транзакции с ней не удалятся.`)) return;
  try {
    await Airtable.remove(CONFIG.TABLES.FINANCE_CATEGORIES, id);
    State.financeCategories = State.financeCategories.filter(c => String(c.id) !== String(id));
    toast('Категория удалена ✓');
    renderManageCategoriesList();
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
}
window.deleteCategory = deleteCategory;

async function addNewCategory() {
  const name = document.getElementById('new-cat-name')?.value.trim();
  const type = document.getElementById('new-cat-type')?.value;
  const btn  = document.getElementById('add-cat-btn');
  if (!name) { toast('Введите название категории', 'error'); return; }
  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
    const fields = { 'Наименование': name, 'Тип': type, 'Вкл': true };
    const res = await Airtable.create(CONFIG.TABLES.FINANCE_CATEGORIES, fields);
    if (res.records?.[0]) State.financeCategories.push(res.records[0]);
    document.getElementById('new-cat-name').value = '';
    toast('Категория добавлена ✓');
    renderManageCategoriesList();
  } catch(e) { toast('Ошибка: ' + e.message, 'error'); }
  finally { btn.innerHTML = 'Добавить категорию'; btn.disabled = false; }
}
window.addNewCategory = addNewCategory;

// ─── Импорт финансов из Excel (ФИНАНСЫ МК.xlsx)

async function syncFinanceFromExcel(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  const btn = document.getElementById('btn-sync-finance');
  if (btn) { btn.innerHTML = `<span class="spinner"></span> Импорт...`; btn.disabled = true; }

  try {
    // Грузим SheetJS если нет
    if (typeof XLSX === 'undefined') {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    // Читаем файл
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    // Парсим лист в массив объектов
    function sheetToRows(sheetName) {
      const ws = wb.Sheets[sheetName];
      if (!ws) return [];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (raw.length < 2) return [];
      const headers = raw[0].map(h => String(h).trim());
      return raw.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
        return obj;
      }).filter(r => r['ID'] && r['ID'] !== '');
    }

    const sheetsIncomes  = sheetToRows('Доходы');
    const sheetsExpenses = sheetToRows('Расходы');

    if (!sheetsIncomes.length && !sheetsExpenses.length) {
      throw new Error('Листы "Доходы" и "Расходы" не найдены в файле');
    }

    toast(`Файл прочитан: ${sheetsIncomes.length} доходов, ${sheetsExpenses.length} расходов. Синхронизирую...`);

    // Собираем существующие ID из Baserow
    const existingIncIds = new Set();
    const existingExpIds = new Set();

    let page = 1;
    while (true) {
      const d = await Airtable.getPage(CONFIG.TABLES.FINANCE_INCOMES, page, 200);
      d.results.forEach(r => existingIncIds.add(String(r.fields['ID транзакции'])));
      if (!d.next) break; page++;
    }
    page = 1;
    while (true) {
      const d = await Airtable.getPage(CONFIG.TABLES.FINANCE_EXPENSES, page, 200);
      d.results.forEach(r => existingExpIds.add(String(r.fields['ID транзакции'])));
      if (!d.next) break; page++;
    }

    // Lookup категорий и счетов
    if (State.financeCategories.length === 0) State.financeCategories = await Airtable.getAll(CONFIG.TABLES.FINANCE_CATEGORIES);
    if (State.financeAccounts.length === 0)   State.financeAccounts   = await Airtable.getAll(CONFIG.TABLES.FINANCE_ACCOUNTS);

    const catLookup = {};
    State.financeCategories.forEach(c => { catLookup[(c.fields['Наименование'] || '').trim().toLowerCase()] = c.id; });
    const accLookup = {};
    State.financeAccounts.forEach(a => { accLookup[(a.fields['Наименование'] || '').trim().toLowerCase()] = a.id; });

    function getCatId(name) {
      if (!name) return null;
      const key = String(name).trim().toLowerCase();
      if (catLookup[key]) return catLookup[key];
      for (const [k, id] of Object.entries(catLookup)) {
        if (k.includes(key) || key.includes(k)) return id;
      }
      return null;
    }
    function getAccId(name) {
      if (!name) return null;
      return accLookup[String(name).trim().toLowerCase()] || Object.values(accLookup)[0] || null;
    }
    function getTxId(row) {
      const n = parseFloat(row['ID']);
      return isNaN(n) ? null : String(Math.round(n));
    }
    function toDateStr(val) {
      if (!val) return '';
      if (val instanceof Date) {
        const y = val.getFullYear();
        const m = String(val.getMonth()+1).padStart(2,'0');
        const d = String(val.getDate()).padStart(2,'0');
        return `${y}-${m}-${d}`;
      }
      const s = String(val);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0,10);
      const mx = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (mx) return `${mx[3]}-${mx[2].padStart(2,'0')}-${mx[1].padStart(2,'0')}`;
      return s.substring(0,10);
    }
    function toAmount(val) {
      return Number(String(val).replace(/\s/g,'').replace(',','.')) || 0;
    }

    // Импорт доходов
    let addedInc = 0;
    for (const row of sheetsIncomes) {
      const txId = getTxId(row);
      if (!txId || existingIncIds.has(txId)) continue;
      const accId = getAccId(row['Источник']);
      const catId = getCatId(row['Категория']);
      const amount = toAmount(row['Сумма']);
      await Airtable.create(CONFIG.TABLES.FINANCE_INCOMES, {
        'ID транзакции':   txId,
        'Дата транзакции': toDateStr(row['Дата транзакции']),
        'Сумма':           amount,
        'Цена тарифа':     amount,
        'Примечание':      String(row['Примечание'] || ''),
        'Кто добавил':     String(row['Кто добавил'] || ''),
        'Дата добавления': String(row['Дата добавления'] || ''),
        'Валюта':          String(row['Валюта'] || '₸'),
        'Источник ID':     accId ? [accId] : [],
        'Категория ID':    catId ? [catId] : [],
      });
      addedInc++;
    }

    // Импорт расходов
    let addedExp = 0;
    for (const row of sheetsExpenses) {
      const txId = getTxId(row);
      if (!txId || existingExpIds.has(txId)) continue;
      const accId = getAccId(row['Источник']);
      const catId = getCatId(row['Категория']);
      const amount = toAmount(row['Сумма']);
      await Airtable.create(CONFIG.TABLES.FINANCE_EXPENSES, {
        'ID транзакции':   txId,
        'Дата транзакции': toDateStr(row['Дата транзакции']),
        'Сумма':           amount,
        'Бюджет':          String(row['Бюджет'] || ''),
        'Примечание':      String(row['Примечание'] || ''),
        'Кто добавил':     String(row['Кто добавил'] || ''),
        'Дата добавления': String(row['Дата добавления'] || ''),
        'Валюта':          String(row['Валюта'] || '₸'),
        'Источник ID':     accId ? [accId] : [],
        'Категория ID':    catId ? [catId] : [],
      });
      addedExp++;
    }

    if (addedInc === 0 && addedExp === 0) {
      toast('Всё актуально — новых записей не найдено ✓');
    } else {
      toast(`Импорт завершён ✓  +${addedInc} доходов, +${addedExp} расходов`);
    }
    await loadFinance();

  } catch(e) {
    toast('Ошибка импорта: ' + e.message, 'error');
    console.error(e);
  } finally {
    if (btn) { btn.innerHTML = '📥 Импорт из Excel'; btn.disabled = false; }
  }
}
window.syncFinanceFromExcel = syncFinanceFromExcel;

