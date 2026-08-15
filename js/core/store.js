// Доменный слой: состояние, справочники, расчёты. Без единого обращения к DOM —
// этот файл переезжает в нативное приложение без правок.

import * as db from './db.js';
import { STORES } from './db.js';
import { convert, decimalsOf, toMinor } from './money.js';
import { DEFAULT_SETTINGS, makeAccount, makeBudget, makeTransaction } from './schema.js';

export const state = {
  accountGroups: [],
  accounts: [],
  categories: [],
  payees: [],
  tags: [],
  places: [],
  transactions: [],
  budgets: [],
  settings: { ...DEFAULT_SETTINGS },
  ready: false,
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (event) => listeners.forEach((fn) => fn(event));

// ------------------------------------------------------------ инициализация

export async function init() {
  const [groups, accounts, categories, payees, tags, places, transactions, budgets, settings] =
    await Promise.all([
      db.getAll(STORES.accountGroups), db.getAll(STORES.accounts),
      db.getAll(STORES.categories), db.getAll(STORES.payees),
      db.getAll(STORES.tags), db.getAll(STORES.places),
      db.getAll(STORES.transactions), db.getAll(STORES.budgets),
      db.getAll(STORES.settings),
    ]);

  state.accountGroups = groups;
  state.accounts = accounts;
  state.categories = categories;
  state.payees = payees;
  state.tags = tags;
  state.places = places;
  state.transactions = transactions;
  state.budgets = budgets;
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...Object.fromEntries(settings.map((r) => [r.key, r.value])),
  };

  sortTransactions();
  state.ready = true;
  emit('init');
}

const sortTransactions = () =>
  state.transactions.sort((a, b) => b.at - a.at || b.createdAt - a.createdAt);

// ----------------------------------------------------------------- справки

const byId = (list, id) => list.find((x) => x.id === id) || null;

export const accountById = (id) => byId(state.accounts, id);
export const categoryById = (id) => byId(state.categories, id);
export const payeeById = (id) => byId(state.payees, id);
export const tagById = (id) => byId(state.tags, id);
export const placeById = (id) => byId(state.places, id);
export const groupById = (id) => byId(state.accountGroups, id);

export const baseCurrency = () => state.settings.baseCurrency;

/** Дети категории. Верхний уровень — parentId === null. */
export const childrenOf = (parentId) =>
  state.categories.filter((c) => c.parentId === parentId).sort(byOrder);

export const topCategories = (type) =>
  state.categories.filter((c) => c.parentId === null && c.type === type).sort(byOrder);

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'ru');

/** Категория верхнего уровня для любой категории — по ней группируется отчёт. */
export function rootCategoryOf(categoryId) {
  const category = categoryById(categoryId);
  if (!category) return null;
  return category.parentId ? categoryById(category.parentId) || category : category;
}

export const activeAccounts = ({ includeArchived = false } = {}) =>
  state.accounts.filter((a) => includeArchived || !a.archived).sort(byOrder);

export const accountsOfGroup = (groupId) =>
  state.accounts.filter((a) => a.groupId === groupId && !a.archived).sort(byOrder);

// ------------------------------------------------------------------ баланс

/** Баланс счёта в его собственной валюте. */
export function accountBalance(accountId) {
  const account = accountById(accountId);
  if (!account) return 0;

  let sum = account.initialBalanceMinor || 0;
  for (const t of state.transactions) {
    if (t.type === 'transfer') {
      if (t.accountId === accountId) sum -= t.amountMinor;
      if (t.toAccountId === accountId) sum += t.toAmountMinor ?? t.amountMinor;
      continue;
    }
    if (t.accountId !== accountId) continue;
    if (t.type === 'expense') sum -= t.amountMinor;
    else sum += t.amountMinor;            // income и refund увеличивают остаток
  }
  return sum;
}

/** Итог по списку счетов в базовой валюте. null — если не хватает курса. */
export function totalBalance(accounts = activeAccounts()) {
  const base = baseCurrency();
  let sum = 0;
  for (const account of accounts) {
    if (account.excludeFromTotal) continue;
    const converted = convert(accountBalance(account.id), account.currency, base, state.settings.rates);
    if (converted === null) return null;
    sum += converted;
  }
  return sum;
}

// ------------------------------------------------------------------ выборки

/** Операции за период с учётом настроек «переводы/корректировки как доходы». */
export function selectTransactions({ from, to, accountIds, includeTransfers, includeAdjustments } = {}) {
  const withTransfers = includeTransfers ?? state.settings.transfersAsIncomeExpense;
  const withAdjustments = includeAdjustments ?? state.settings.adjustmentsAsIncomeExpense;

  return state.transactions.filter((t) => {
    if (from != null && t.at < from) return false;
    if (to != null && t.at > to) return false;
    if (!withAdjustments && t.isAdjustment) return false;
    if (t.type === 'transfer' && !withTransfers) return false;
    if (accountIds && accountIds.length) {
      const hit = accountIds.includes(t.accountId) || accountIds.includes(t.toAccountId);
      if (!hit) return false;
    }
    return true;
  });
}

/** Сумма операции в базовой валюте. */
export function inBase(transaction) {
  return convert(transaction.amountMinor, transaction.currency, baseCurrency(), state.settings.rates);
}

/**
 * Доходы и расходы за период. Возврат средств уменьшает расход,
 * а не увеличивает доход — так же, как в оригинале.
 */
export function totals(options = {}) {
  const rows = selectTransactions(options);
  let income = 0;
  let expense = 0;
  let unconverted = 0;

  for (const t of rows) {
    if (t.type === 'transfer') continue;
    const value = inBase(t);
    if (value === null) { unconverted++; continue; }
    if (t.type === 'income') income += value;
    else if (t.type === 'expense') expense += value;
    else if (t.type === 'refund') expense -= value;
  }
  return { income, expense, balance: income - expense, unconverted };
}

/**
 * Разрез отчёта. dimension: category | payee | tag | place.
 * Категории сворачиваются до верхнего уровня — оригинал показывает именно так,
 * а провал внутрь даёт подкатегории.
 */
export function breakdown(dimension, { kind = 'expense', collapseToRoot = true, ...options } = {}) {
  const rows = selectTransactions(options);
  const sums = new Map();

  const add = (key, value) => sums.set(key, (sums.get(key) || 0) + value);

  for (const t of rows) {
    if (t.type === 'transfer') continue;
    const isExpenseSide = t.type === 'expense' || t.type === 'refund';
    if (kind === 'expense' && !isExpenseSide) continue;
    if (kind === 'income' && t.type !== 'income') continue;

    const value = inBase(t);
    if (value === null) continue;
    const signed = t.type === 'refund' ? -value : value;

    if (dimension === 'tag') {
      // Операция с несколькими метками попадает в каждую — сумма по меткам
      // намеренно не сходится с общей, как и предупреждает оригинал.
      if (!t.tagIds.length) add(null, signed);
      else t.tagIds.forEach((tagId) => add(tagId, signed));
      continue;
    }

    const key =
      dimension === 'category'
        ? (collapseToRoot ? rootCategoryOf(t.categoryId)?.id ?? null : t.categoryId)
        : dimension === 'payee' ? t.payeeId
        : dimension === 'place' ? t.placeId
        : null;
    add(key, signed);
  }

  const total = [...sums.values()].reduce((a, b) => a + Math.max(b, 0), 0);
  return [...sums.entries()]
    .map(([key, amount]) => ({ key, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Разрез внутри одной категории верхнего уровня — для проваливания в отчёте. */
export function breakdownWithin(rootId, { kind = 'expense', ...options } = {}) {
  const rows = selectTransactions(options);
  const sums = new Map();

  for (const t of rows) {
    if (t.type === 'transfer') continue;
    const isExpenseSide = t.type === 'expense' || t.type === 'refund';
    if (kind === 'expense' && !isExpenseSide) continue;
    if (kind === 'income' && t.type !== 'income') continue;
    if (rootCategoryOf(t.categoryId)?.id !== rootId) continue;

    const value = inBase(t);
    if (value === null) continue;
    const signed = t.type === 'refund' ? -value : value;
    sums.set(t.categoryId, (sums.get(t.categoryId) || 0) + signed);
  }

  const total = [...sums.values()].reduce((a, b) => a + Math.max(b, 0), 0);
  return [...sums.entries()]
    .map(([key, amount]) => ({ key, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Ряд по времени для столбчатой диаграммы: суммы, разложенные по корзинам
 * и по категориям внутри корзины — столбцы в оригинале сегментированы цветами.
 */
export function timeSeries({ from, to, bucket = 'day', kind = 'expense', ...options }) {
  const rows = selectTransactions({ from, to, ...options });
  const buckets = new Map();

  const keyOf = (ms) => {
    const d = new Date(ms);
    if (bucket === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (bucket === 'week') {
      const monday = new Date(d);
      monday.setHours(0, 0, 0, 0);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      return `w${monday.getTime()}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  for (const t of rows) {
    if (t.type === 'transfer') continue;
    const isExpenseSide = t.type === 'expense' || t.type === 'refund';
    if (kind === 'expense' && !isExpenseSide) continue;
    if (kind === 'income' && t.type !== 'income') continue;

    const value = inBase(t);
    if (value === null) continue;
    const signed = t.type === 'refund' ? -value : value;

    const key = keyOf(t.at);
    if (!buckets.has(key)) buckets.set(key, { key, at: t.at, total: 0, parts: new Map() });
    const cell = buckets.get(key);
    cell.total += signed;
    cell.at = Math.min(cell.at, t.at);

    const rootId = rootCategoryOf(t.categoryId)?.id ?? null;
    cell.parts.set(rootId, (cell.parts.get(rootId) || 0) + signed);
  }

  return [...buckets.values()].sort((a, b) => a.at - b.at);
}

// ------------------------------------------------------- бюджеты и цели

/** Потрачено по бюджету за отрезок. Возвраты уменьшают трату. */
export function budgetSpent(budget, { from, to } = {}) {
  const rows = selectTransactions({
    from, to,
    accountIds: budget.accountIds?.length ? budget.accountIds : null,
  });

  let spent = 0;
  for (const t of rows) {
    if (t.type === 'transfer') continue;
    if (t.type !== 'expense' && t.type !== 'refund') continue;

    if (budget.scope === 'categories') {
      const rootId = rootCategoryOf(t.categoryId)?.id ?? null;
      if (!budget.categoryIds.includes(t.categoryId) && !budget.categoryIds.includes(rootId)) continue;
    } else if (budget.scope === 'tags') {
      if (!t.tagIds.some((id) => budget.tagIds.includes(id))) continue;
    }

    const value = inBase(t);
    if (value === null) continue;
    spent += t.type === 'refund' ? -value : value;
  }
  return spent;
}

export const budgetProgress = (budget, range) => {
  const spent = budgetSpent(budget, range);
  const limit = budget.limitMinor || 0;
  return {
    spent,
    limit,
    left: limit - spent,
    share: limit > 0 ? spent / limit : 0,
    over: limit > 0 && spent > limit,
  };
};

/**
 * Прогресс цели. Накопленное — это остаток на счёте-копилке,
 * так же как в оригинале: цель привязана к счёту, а не к отдельному счётчику.
 */
export function goalProgress(account) {
  const saved = accountBalance(account.id);
  const target = account.goalTargetMinor ?? 0;
  const left = Math.max(target - saved, 0);

  let monthsLeft = null;
  let perMonth = null;
  if (account.goalDate) {
    const now = new Date();
    const due = new Date(account.goalDate);
    monthsLeft = Math.max(
      (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth()),
      0
    );
    if (monthsLeft > 0 && left > 0) perMonth = Math.round(left / monthsLeft);
  }

  return {
    saved, target, left, monthsLeft, perMonth,
    share: target > 0 ? Math.min(saved / target, 1) : 0,
    done: target > 0 && saved >= target,
  };
}

export const goalAccounts = () =>
  state.accounts.filter((a) => a.kind === 'goal' && !a.archived).sort(byOrder);

export async function saveBudget(data) {
  const record = makeBudget({ ...data, order: data.order ?? state.budgets.length });
  await db.put(STORES.budgets, record);
  const index = state.budgets.findIndex((b) => b.id === record.id);
  if (index === -1) state.budgets.push(record);
  else state.budgets[index] = record;
  emit('budgets');
  return record;
}

export async function deleteBudget(id) {
  await db.remove(STORES.budgets, id);
  state.budgets = state.budgets.filter((b) => b.id !== id);
  emit('budgets');
}

export async function saveAccount(data) {
  const existing = data.id ? accountById(data.id) : null;
  const record = makeAccount({ ...existing, ...data });
  await db.put(STORES.accounts, record);
  const index = state.accounts.findIndex((a) => a.id === record.id);
  if (index === -1) state.accounts.push(record);
  else state.accounts[index] = record;
  emit('accounts');
  return record;
}

// ------------------------------------------------------------------- запись

export async function addTransaction(data) {
  const record = makeTransaction(data);
  await db.put(STORES.transactions, record);
  state.transactions.push(record);
  sortTransactions();
  emit('transactions');
  return record;
}

export async function updateTransaction(id, patch) {
  const index = state.transactions.findIndex((t) => t.id === id);
  if (index === -1) return null;
  const record = makeTransaction({ ...state.transactions[index], ...patch, updatedAt: Date.now() });
  await db.put(STORES.transactions, record);
  state.transactions[index] = record;
  sortTransactions();
  emit('transactions');
  return record;
}

export async function deleteTransaction(id) {
  await db.remove(STORES.transactions, id);
  state.transactions = state.transactions.filter((t) => t.id !== id);
  emit('transactions');
}

/** Корректировка остатка: доводим баланс счёта до указанного значения. */
export async function adjustBalance(accountId, targetMinor, at = Date.now()) {
  const account = accountById(accountId);
  if (!account) throw new Error('Счёт не найден');

  const delta = targetMinor - accountBalance(accountId);
  if (delta === 0) return null;

  return addTransaction({
    type: delta > 0 ? 'income' : 'expense',
    isAdjustment: true,
    at,
    accountId,
    amountMinor: Math.abs(delta),
    currency: account.currency,
    note: 'Корректировка остатка',
  });
}

export async function setSetting(key, value) {
  state.settings[key] = value;
  await db.put(STORES.settings, { key, value });
  emit('settings');
}

/** Курс валюты к базовой. */
export async function setRate(code, rate) {
  const rates = { ...state.settings.rates, [code]: rate };
  await setSetting('rates', rates);
}

export const missingRates = () => {
  const base = baseCurrency();
  const used = new Set(state.accounts.map((a) => a.currency));
  return [...used].filter((code) => code !== base && !state.settings.rates[code]);
};

// ------------------------------------------------------------------ хранение

/** Массовая запись справочников и операций одним заходом — импорт. */
export async function bulkLoad(payload) {
  await db.writeBulk({
    [STORES.accountGroups]: payload.accountGroups || [],
    [STORES.accounts]: payload.accounts || [],
    [STORES.categories]: payload.categories || [],
    [STORES.payees]: payload.payees || [],
    [STORES.tags]: payload.tags || [],
    [STORES.places]: payload.places || [],
    [STORES.transactions]: payload.transactions || [],
    [STORES.budgets]: payload.budgets || [],
    [STORES.settings]: Object.entries(payload.settings || {}).map(([key, value]) => ({ key, value })),
  });
  await init();
}

export async function wipe() {
  await db.clearAll();
  Object.assign(state, {
    accountGroups: [], accounts: [], categories: [], payees: [], tags: [],
    places: [], transactions: [], budgets: [], settings: { ...DEFAULT_SETTINGS },
  });
  await init();
}

export { toMinor, decimalsOf };
