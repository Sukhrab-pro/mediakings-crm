// === ERP FINANCE MODULE ===

// ─── Загрузка и инициализация модуля
async function loadFinance() {
  // Показываем спиннер
  const incomesTbody = document.getElementById('finance-incomes-tbody');
  const expensesTbody = document.getElementById('finance-expenses-tbody');
  if (incomesTbody) incomesTbody.innerHTML = `<tr><td colspan="7" class="an-empty"><span class="spinner"></span> Загрузка...</td></tr>`;
  if (expensesTbody) expensesTbody.innerHTML = `<tr><td colspan="7" class="an-empty"><span class="spinner"></span> Загрузка...</td></tr>`;

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

    renderFinanceDashboard();
  } catch (e) {
    toast('Ошибка загрузки финансов: ' + e.message, 'error');
  }
}

// ─── Рендеринг дашборда и таблиц транзакций
function renderFinanceDashboard() {
  // 1. Список счетов
  renderAccountsList();

  // 2. Фильтрация Доходов
  let filteredIncomes = State.financeIncomes.filter(i => {
    const f = i.fields;
    const dateOk = filterByPeriod(f['Дата транзакции'], State.financePeriod);
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
    const dateOk = filterByPeriod(f['Дата транзакции'], State.financePeriod);
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

  // Сортировка по дате по убыванию
  filteredIncomes.sort((a, b) => new Date(b.fields['Дата транзакции']) - new Date(a.fields['Дата транзакции']));
  filteredExpenses.sort((a, b) => new Date(b.fields['Дата транзакции']) - new Date(a.fields['Дата транзакции']));

  // 4. Подсчёт метрик
  // Общий баланс складывается из всех активных счетов (вне зависимости от фильтра периода)
  const totalBalance = State.financeAccounts
    .filter(a => a.fields['Вкл'])
    .reduce((sum, a) => sum + (Number(a.fields['Баланс счета']) || 0), 0);

  // Сводка по отфильтрованным периодом транзакциям
  const totalIncomeExpected = filteredIncomes.reduce((sum, i) => sum + (Number(i.fields['Цена тарифа']) || Number(i.fields['Сумма']) || 0), 0);
  const totalIncomeActual = filteredIncomes.reduce((sum, i) => sum + (Number(i.fields['Сумма']) || 0), 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Number(e.fields['Сумма']) || 0), 0);
  const netProfit = totalIncomeActual - totalExpenses;

  // Отрисовка метрик
  document.getElementById('fin-stat-balance').textContent = totalBalance.toLocaleString('ru-RU') + ' ₸';
  document.getElementById('fin-stat-income-expected').textContent = totalIncomeExpected.toLocaleString('ru-RU') + ' ₸';
  document.getElementById('fin-stat-income-actual').textContent = totalIncomeActual.toLocaleString('ru-RU') + ' ₸';
  document.getElementById('fin-stat-expenses').textContent = totalExpenses.toLocaleString('ru-RU') + ' ₸';
  
  const profitEl = document.getElementById('fin-stat-profit');
  profitEl.textContent = netProfit.toLocaleString('ru-RU') + ' ₸';
  profitEl.style.color = netProfit >= 0 ? 'var(--success)' : 'var(--danger)';

  // 5. Вывод таблицы
  if (State.financeTab === 'incomes') {
    renderIncomesTable(filteredIncomes.slice(0, 50));
  } else {
    renderExpensesTable(filteredExpenses.slice(0, 50));
  }
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

// ─── Переключатель фильтра по счету
function toggleAccountFilter(accountId) {
  if (State.financeSelectedAccount === accountId) {
    State.financeSelectedAccount = null;
  } else {
    State.financeSelectedAccount = accountId;
  }
  renderFinanceDashboard();
}

// ─── Фильтрация по периоду
function filterByPeriod(txDateStr, period) {
  if (period === 'all') return true;
  if (!txDateStr) return false;
  
  const txDate = new Date(txDateStr);
  if (isNaN(txDate)) return false;
  
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  if (period === 'today') {
    return txDate >= startOfToday;
  }
  if (period === 'week') {
    const oneWeekAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    return txDate >= oneWeekAgo;
  }
  if (period === 'month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return txDate >= startOfMonth;
  }
  return true;
}

// ─── Отрисовка таблицы Доходов
function renderIncomesTable(incomes) {
  const tbody = document.getElementById('finance-incomes-tbody');
  if (!tbody) return;

  if (incomes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="an-empty">Нет записей за выбранный период</td></tr>`;
    return;
  }

  tbody.innerHTML = incomes.map(item => {
    const f = item.fields;
    const amount = Number(f['Сумма']) || 0;
    const tariffPrice = Number(f['Цена тарифа']) || amount;
    
    const displayAmount = amount.toLocaleString('ru-RU') + ' ' + (f['Валюта'] || '₸');
    const displayTariffPrice = tariffPrice.toLocaleString('ru-RU') + ' ' + (f['Валюта'] || '₸');
    
    const accountName = f['Источник'] || '—';
    const categoryName = f['Категория'] || '—';
    const clientName = f['Клиент'] || '—';
    const dealName = f['Заказ'] || '—';
    const managerName = f['Менеджер'] || '—';
    const partner = f['Партнер'] || '';
    const note = f['Примечание'] || '';
    const dateStr = formatDate(f['Дата транзакции']);
    
    return `
      <tr>
        <td style="white-space:nowrap;">${dateStr}</td>
        <td>
          <div style="font-weight:800; color:var(--success);">${displayAmount}</div>
          <div style="font-size:11px; color:var(--text2);">Договор: ${displayTariffPrice}</div>
        </td>
        <td><span class="badge badge-gray">${escHtml(accountName)}</span></td>
        <td><span class="badge badge-blue">${escHtml(categoryName)}</span></td>
        <td>
          <div style="font-weight:600;">${escHtml(clientName)}</div>
          <div style="font-size:11px; color:var(--text2);">${escHtml(dealName)}</div>
        </td>
        <td>
          <div style="font-weight:600; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(note || '—')}</div>
          <div style="font-size:11px; color:var(--text2); margin-top:2px;">
            👤 ${escHtml(f['Кто добавил'] || '—')} ${managerName ? ' | Отв: ' + escHtml(managerName) : ''} ${partner ? ' | Партнер: ' + escHtml(partner) : ''}
          </div>
        </td>
        <td>
          <button onclick="deleteIncome('${item.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:14px; padding:4px;" title="Удалить запись">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Отрисовка таблицы Расходов
function renderExpensesTable(expenses) {
  const tbody = document.getElementById('finance-expenses-tbody');
  if (!tbody) return;

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="an-empty">Нет записей за выбранный период</td></tr>`;
    return;
  }

  tbody.innerHTML = expenses.map(item => {
    const f = item.fields;
    const amount = Number(f['Сумма']) || 0;
    const displayAmount = amount.toLocaleString('ru-RU') + ' ' + (f['Валюта'] || '₸');
    
    const accountName = f['Источник'] || '—';
    const categoryName = f['Категория'] || '—';
    const employeeName = f['Сотрудник'] || '—';
    const dealName = f['Заказ'] || '—';
    const budget = f['Бюджет'] || '';
    const note = f['Примечание'] || '';
    const dateStr = formatDate(f['Дата транзакции']);
    
    return `
      <tr>
        <td style="white-space:nowrap;">${dateStr}</td>
        <td style="font-weight:800; color:var(--danger);">${displayAmount}</td>
        <td><span class="badge badge-gray">${escHtml(accountName)}</span></td>
        <td><span class="badge badge-yellow">${escHtml(categoryName)}</span></td>
        <td>
          <div style="font-weight:600;">${escHtml(employeeName)}</div>
          <div style="font-size:11px; color:var(--text2);">${escHtml(dealName)}</div>
        </td>
        <td>
          <div style="font-weight:600; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(note || '—')}</div>
          <div style="font-size:11px; color:var(--text2); margin-top:2px;">
            👤 ${escHtml(f['Кто добавил'] || '—')} ${budget ? ' | Бюджет: ' + escHtml(budget) : ''}
          </div>
        </td>
        <td>
          <button onclick="deleteExpense('${item.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:14px; padding:4px;" title="Удалить запись">🗑️</button>
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
  }

  if (filterFn) {
    list = list.filter(filterFn);
  }

  sel.innerHTML = `<option value="">${placeholderText}</option>` + 
    list.map(item => `<option value="${item.id}">${escHtml(item.fields[displayFieldName] || '')}${tableId === CONFIG.TABLES.FINANCE_ACCOUNTS ? ' (' + escHtml(item.fields['Валюта'] || '₸') + ')' : ''}</option>`).join('');
}

// ─── Помощник для выпадающего списка счетов в CRM
async function populateFinanceAccountsSelect(selectId) {
  await populateDropdown(selectId, CONFIG.TABLES.FINANCE_ACCOUNTS, 'Выберите счет', 'Наименование', a => a.fields['Вкл']);
  // Выбираем основной счет по умолчанию
  const mainAcc = State.financeAccounts.find(a => a.fields['Основной'] && a.fields['Вкл']);
  const sel = document.getElementById(selectId);
  if (mainAcc && sel) {
    sel.value = mainAcc.id;
  }
}
window.populateFinanceAccountsSelect = populateFinanceAccountsSelect;

// ─── Подготовка формы добавления Дохода
async function prepareIncomeDrawer() {
  document.getElementById('inc-amount').value = '';
  document.getElementById('inc-tariff-price').value = '';
  document.getElementById('inc-date').value = new Date().toISOString().substring(0, 10);
  document.getElementById('inc-partner').value = '';
  document.getElementById('inc-note').value = '';
  
  await populateDropdown('inc-account', CONFIG.TABLES.FINANCE_ACCOUNTS, 'Выберите счет', 'Наименование', a => a.fields['Вкл']);
  const mainAcc = State.financeAccounts.find(a => a.fields['Основной'] && a.fields['Вкл']);
  if (mainAcc) {
    document.getElementById('inc-account').value = mainAcc.id;
  }

  await populateDropdown('inc-category', CONFIG.TABLES.FINANCE_CATEGORIES, 'Выберите категорию', 'Наименование', c => c.fields['Отображать в доходах']);
  await populateDropdown('inc-client', CONFIG.TABLES.CLIENTS, 'Выберите клиента', 'Имя');
  await populateDropdown('inc-deal', CONFIG.TABLES.DEALS, 'Выберите сделку', 'Название сделки');
  await populateDropdown('inc-manager', CONFIG.TABLES.EMPLOYEES, 'Выберите сотрудника', 'Имя');
}

// ─── Фильтрация сделок при выборе клиента в форме Дохода
async function onIncomeClientChange(clientId) {
  const dealSel = document.getElementById('inc-deal');
  if (!dealSel) return;
  if (!clientId) {
    await populateDropdown('inc-deal', CONFIG.TABLES.DEALS, 'Выберите сделку', 'Название сделки');
    return;
  }
  
  if (State.deals.length === 0) {
    State.deals = await Airtable.getAll(CONFIG.TABLES.DEALS);
  }
  
  const clientDeals = State.deals.filter(d => {
    const clientIds = String(d.fields['Клиент ID'] || '').split(',').map(id => id.trim());
    return clientIds.includes(String(clientId));
  });
  
  dealSel.innerHTML = `<option value="">Выберите сделку</option>` +
    clientDeals.map(d => `<option value="${d.id}">${escHtml(d.fields['Название сделки'] || 'Без названия')}</option>`).join('');
}

// ─── Подготовка формы добавления Расхода
async function prepareExpenseDrawer() {
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-date').value = new Date().toISOString().substring(0, 10);
  document.getElementById('exp-budget').value = '';
  document.getElementById('exp-note').value = '';

  await populateDropdown('exp-account', CONFIG.TABLES.FINANCE_ACCOUNTS, 'Выберите счет', 'Наименование', a => a.fields['Вкл']);
  const mainAcc = State.financeAccounts.find(a => a.fields['Основной'] && a.fields['Вкл']);
  if (mainAcc) {
    document.getElementById('exp-account').value = mainAcc.id;
  }

  await populateDropdown('exp-category', CONFIG.TABLES.FINANCE_CATEGORIES, 'Выберите категорию', 'Наименование', c => c.fields['Отображать в расходах']);
  await populateDropdown('exp-employee', CONFIG.TABLES.EMPLOYEES, 'Выберите сотрудника', 'Имя');
  await populateDropdown('exp-deal', CONFIG.TABLES.DEALS, 'Выберите сделку', 'Название сделки');
}

// ─── Сохранение Дохода
async function saveIncome() {
  const btn = document.getElementById('save-income-btn');
  const amount = Number(document.getElementById('inc-amount').value) || 0;
  const tariffPrice = Number(document.getElementById('inc-tariff-price').value) || amount;
  const date = document.getElementById('inc-date').value;
  const accountId = document.getElementById('inc-account').value;
  const categoryId = document.getElementById('inc-category').value;
  const clientId = document.getElementById('inc-client').value;
  const dealId = document.getElementById('inc-deal').value;
  const managerId = document.getElementById('inc-manager').value;
  const partner = document.getElementById('inc-partner').value.trim();
  const note = document.getElementById('inc-note').value.trim();

  if (!amount) { toast('Введите сумму дохода', 'error'); return; }
  if (!date) { toast('Выберите дату транзакции', 'error'); return; }
  if (!accountId) { toast('Выберите счет', 'error'); return; }
  if (!categoryId) { toast('Выберите категорию', 'error'); return; }

  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
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
      'Менеджер ID': managerId ? [managerId] : [],
      'Заказ ID': dealId ? [dealId] : [],
      'Партнер': partner
    };
    await Airtable.create(CONFIG.TABLES.FINANCE_INCOMES, fields);
    await adjustAccountBalance(accountId, amount);
    toast('Доход сохранен ✓');
    closeDrawer('drawer-income');
    await loadFinance();
  } catch (e) {
    toast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    btn.innerHTML = 'Сохранить доход'; btn.disabled = false;
  }
}

// ─── Сохранение Расхода
async function saveExpense() {
  const btn = document.getElementById('save-expense-btn');
  const amount = Number(document.getElementById('exp-amount').value) || 0;
  const date = document.getElementById('exp-date').value;
  const accountId = document.getElementById('exp-account').value;
  const categoryId = document.getElementById('exp-category').value;
  const employeeId = document.getElementById('exp-employee').value;
  const dealId = document.getElementById('exp-deal').value;
  const budget = document.getElementById('exp-budget').value.trim();
  const note = document.getElementById('exp-note').value.trim();

  if (!amount) { toast('Введите сумму расхода', 'error'); return; }
  if (!date) { toast('Выберите дату транзакции', 'error'); return; }
  if (!accountId) { toast('Выберите счет', 'error'); return; }
  if (!categoryId) { toast('Выберите категорию', 'error'); return; }

  btn.innerHTML = `<span class="spinner"></span>`; btn.disabled = true;
  try {
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
    toast('Расход сохранен ✓');
    closeDrawer('drawer-expense');
    await loadFinance();
  } catch (e) {
    toast('Ошибка сохранения: ' + e.message, 'error');
  } finally {
    btn.innerHTML = 'Сохранить расход'; btn.disabled = false;
  }
}

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

// ─── Поиск соответствия между Тарифом и Категорией Дохода
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
  // Поиск категории по умолчанию "Прочие поступления"
  const fallback = State.financeCategories.find(c => (c.fields['Наименование'] || '').includes('Прочие'));
  return fallback ? fallback.id : (State.financeCategories[0]?.id || null);
}
window.matchTariffToCategory = matchTariffToCategory;

// ─── Вкладки Доходов / Расходов
function switchFinanceTab(tab) {
  State.financeTab = tab;
  document.getElementById('tab-btn-fin-incomes').style.borderBottomColor = tab === 'incomes' ? 'var(--accent)' : 'transparent';
  document.getElementById('tab-btn-fin-incomes').style.color = tab === 'incomes' ? '#fff' : 'var(--text2)';
  document.getElementById('tab-btn-fin-expenses').style.borderBottomColor = tab === 'expenses' ? 'var(--accent)' : 'transparent';
  document.getElementById('tab-btn-fin-expenses').style.color = tab === 'expenses' ? '#fff' : 'var(--text2)';

  document.getElementById('finance-incomes-container').style.display = tab === 'incomes' ? 'block' : 'none';
  document.getElementById('finance-expenses-container').style.display = tab === 'expenses' ? 'block' : 'none';
  
  renderFinanceDashboard();
}

// ─── Переключатель периода
function setFinancePeriod(period) {
  State.financePeriod = period;
  document.querySelectorAll('.an-period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-fperiod') === period);
  });
  renderFinanceDashboard();
}

// ─── Поиск в финансах
function onFinanceSearch() {
  State.financeSearch = document.getElementById('finance-search-input').value.trim().toLowerCase();
  renderFinanceDashboard();
}
