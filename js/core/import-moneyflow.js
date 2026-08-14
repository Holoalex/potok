// Импорт экспорта Money Flow.
//
// Формат снят с реального файла на 374 операции:
//   Дата,Счёт,Сумма,Валюта,Категория,Контрагент,Перевод: Счёт,Перевод: Сумма,
//   Перевод: Валюта,Метки,Место,Примечание
// Перевод — одна строка: источник в основных колонках со знаком минус,
// получатель в колонках «Перевод: …». Курс не хранится: обе суммы фактические.

import { toMinor } from './money.js';
import {
  CATEGORY_COLORS, EXPENSE_TREE, INCOME_TREE,
  makeAccount, makeAccountGroup, makeCategory, makePayee, makePlace, makeTag,
  makeTransaction, uid,
} from './schema.js';

const COLUMNS = ['Дата', 'Счёт', 'Сумма', 'Валюта', 'Категория', 'Контрагент',
  'Перевод: Счёт', 'Перевод: Сумма', 'Перевод: Валюта', 'Метки', 'Место', 'Примечание'];

// ------------------------------------------------------------------ разбор CSV

/** Разбор с учётом кавычек и переносов внутри полей. */
export function parseCSV(text, separator = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === separator) { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

export function toObjects(rows) {
  const [header, ...body] = rows;
  return body.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name.trim(), (cells[i] ?? '').trim()]))
  );
}

/** Быстрая проверка, что файл вообще от Money Flow. */
export function looksLikeMoneyFlow(text) {
  const first = text.replace(/^﻿/, '').split('\n')[0] || '';
  return COLUMNS.slice(0, 6).every((c) => first.includes(c));
}

// ------------------------------------------------------- вспомогательное

/** '2026-08-12 15:22:33' в локальной зоне -> миллисекунды. */
function parseDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!m) {
    const fallback = Date.parse(text);
    return Number.isFinite(fallback) ? fallback : Date.now();
  }
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

/** Группа счёта по названию — в экспорте групп нет, восстанавливаем по смыслу. */
function guessGroup(name) {
  const lower = name.toLowerCase();
  if (lower.includes('наличн')) return 'Наличные';
  if (lower.includes('карт')) return 'Банк. карты';
  return null;
}

/** Родитель листовой категории по дереву оригинала. */
function findParent(tree, leaf) {
  for (const [parent, children] of Object.entries(tree)) {
    if (parent === leaf) return null;             // сам верхний уровень
    if (children.includes(leaf)) return parent;
  }
  return undefined;                                // не нашли — вызывающий решит
}

// ---------------------------------------------------------------- импорт

/**
 * Собирает справочники и операции из строк CSV.
 * Ничего не пишет в базу — возвращает готовый набор и отчёт о разборе.
 */
export function buildImport(text, { baseCurrency = 'RUB' } = {}) {
  const objects = toObjects(parseCSV(text));
  const report = {
    rows: objects.length,
    expense: 0, income: 0, refund: 0, transfer: 0,
    unknownCategories: [],
    currencies: new Set(),
    warnings: [],
  };

  const groups = new Map();
  const accounts = new Map();
  const categories = new Map();   // 'type|name' -> запись
  const payees = new Map();
  const tags = new Map();
  const places = new Map();
  const transactions = [];

  let colorIndex = 0;
  const nextColor = () => CATEGORY_COLORS[colorIndex++ % CATEGORY_COLORS.length];

  const getGroup = (name) => {
    if (!name) return null;
    if (!groups.has(name)) {
      groups.set(name, makeAccountGroup({ name, order: groups.size }));
    }
    return groups.get(name).id;
  };

  const getAccount = (name, currency, kind = 'regular') => {
    if (!name) return null;
    if (!accounts.has(name)) {
      const groupName = kind === 'goal' ? 'Копилки (Цели)' : guessGroup(name);
      accounts.set(name, makeAccount({
        name,
        currency: currency || baseCurrency,
        groupId: getGroup(groupName),
        kind,
        color: nextColor(),
        order: accounts.size,
      }));
    }
    const account = accounts.get(name);
    // Валюта могла впервые встретиться в колонке перевода.
    if (currency && account.currency !== currency && !account.currencyLocked) {
      account.currency = currency;
      account.currencyLocked = true;
    }
    return account.id;
  };

  const getCategory = (name, type) => {
    if (!name) return null;
    const tree = type === 'income' ? INCOME_TREE : EXPENSE_TREE;
    const parentName = findParent(tree, name);

    let parentId = null;
    if (parentName) {
      parentId = ensureCategory(parentName, type, null);
    } else if (parentName === undefined) {
      // Лист не описан в дереве — кладём в «Другое», но сообщаем об этом.
      if (!report.unknownCategories.includes(name)) report.unknownCategories.push(name);
      parentId = ensureCategory('Другое', type, null);
    }
    return ensureCategory(name, type, parentId);
  };

  function ensureCategory(name, type, parentId) {
    const key = `${type}|${name}|${parentId ?? ''}`;
    const existing = [...categories.values()].find(
      (c) => c.name === name && c.type === type && c.parentId === parentId
    );
    if (existing) return existing.id;
    const record = makeCategory({
      name, type, parentId, color: nextColor(), order: categories.size,
    });
    categories.set(key, record);
    return record.id;
  }

  const getSimple = (map, name, factory) => {
    if (!name) return null;
    if (!map.has(name)) map.set(name, factory({ name, order: map.size }));
    return map.get(name).id;
  };

  for (const row of objects) {
    const at = parseDate(row['Дата']);
    const currency = row['Валюта'] || baseCurrency;
    const amount = parseFloat(row['Сумма']);
    if (!Number.isFinite(amount)) {
      report.warnings.push(`Пропущена строка без суммы: ${row['Дата']}`);
      continue;
    }
    report.currencies.add(currency);

    const tagIds = (row['Метки'] || '')
      .split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      .map((name) => getSimple(tags, name, makeTag));

    const common = {
      at,
      tagIds,
      placeId: getSimple(places, row['Место'], makePlace),
      note: row['Примечание'] || '',
      createdAt: at,
      updatedAt: at,
    };

    // ------------------------------------------------------------ перевод
    if (row['Перевод: Счёт']) {
      const toCurrency = row['Перевод: Валюта'] || currency;
      const toAmount = parseFloat(row['Перевод: Сумма']);
      transactions.push(makeTransaction({
        ...common,
        type: 'transfer',
        accountId: getAccount(row['Счёт'], currency),
        amountMinor: toMinor(Math.abs(amount), currency),
        currency,
        // Счёт-получатель мог быть целью: он не встречается в колонке «Счёт».
        toAccountId: getAccount(row['Перевод: Счёт'], toCurrency,
          /наличн|карт/i.test(row['Перевод: Счёт']) ? 'regular' : 'goal'),
        toAmountMinor: toMinor(Math.abs(toAmount), toCurrency),
        toCurrency,
      }));
      report.transfer++;
      continue;
    }

    // -------------------------------------------------- доход или расход
    const categoryName = row['Категория'];
    const positive = amount > 0;

    // Возврат средств: приход, но категория расходная. В экспорте он выглядит
    // как доход, отличаем по тому, что имя категории есть в дереве расходов.
    const isRefund = positive && categoryName && isExpenseName(categoryName);
    const type = isRefund ? 'refund' : positive ? 'income' : 'expense';
    const categoryType = type === 'income' ? 'income' : 'expense';

    transactions.push(makeTransaction({
      ...common,
      type,
      accountId: getAccount(row['Счёт'], currency),
      amountMinor: toMinor(Math.abs(amount), currency),
      currency,
      categoryId: getCategory(categoryName, categoryType),
      payeeId: getSimple(payees, row['Контрагент'], makePayee),
    }));
    report[type]++;
  }

  report.currencies = [...report.currencies];

  return {
    accountGroups: [...groups.values()],
    accounts: [...accounts.values()].map(({ currencyLocked, ...a }) => a),
    categories: [...categories.values()],
    payees: [...payees.values()],
    tags: [...tags.values()],
    places: [...places.values()],
    transactions,
    report,
  };
}

const EXPENSE_NAMES = new Set(
  Object.entries(EXPENSE_TREE).flatMap(([parent, children]) => [parent, ...children])
);
const INCOME_NAMES = new Set(
  Object.entries(INCOME_TREE).flatMap(([parent, children]) => [parent, ...children])
);

/** Имя однозначно расходное, если встречается в дереве расходов и не в доходах. */
const isExpenseName = (name) => EXPENSE_NAMES.has(name) && !INCOME_NAMES.has(name);

/**
 * Экспорт Money Flow не содержит начальных остатков: в файле только операции
 * за выбранный период. Поэтому у счёта, который существовал раньше первой
 * выгруженной операции, баланс получится заниженным ровно на то, что было до неё.
 *
 * Здесь мы решаем обратную задачу: зная сегодняшний остаток, выводим начальный.
 * targets — { 'Название счёта': остаток в минорных единицах его валюты }.
 */
export function deriveOpeningBalances(built, targets) {
  const delta = new Map();
  for (const account of built.accounts) delta.set(account.id, 0);

  for (const t of built.transactions) {
    if (t.type === 'transfer') {
      if (delta.has(t.accountId)) delta.set(t.accountId, delta.get(t.accountId) - t.amountMinor);
      if (delta.has(t.toAccountId)) {
        delta.set(t.toAccountId, delta.get(t.toAccountId) + (t.toAmountMinor ?? t.amountMinor));
      }
      continue;
    }
    if (!delta.has(t.accountId)) continue;
    const sign = t.type === 'expense' ? -1 : 1;
    delta.set(t.accountId, delta.get(t.accountId) + sign * t.amountMinor);
  }

  const applied = [];
  const accounts = built.accounts.map((account) => {
    const target = targets[account.name];
    if (target == null) return account;
    const opening = target - delta.get(account.id);
    applied.push({ name: account.name, opening });
    return { ...account, initialBalanceMinor: opening };
  });

  return { ...built, accounts, openingBalances: applied };
}

/** Порядок групп как в оригинале. */
export function orderGroups(groups) {
  const preferred = ['Наличные', 'Банк. карты', 'Копилки (Цели)'];
  return groups
    .slice()
    .sort((a, b) => {
      const ia = preferred.indexOf(a.name);
      const ib = preferred.indexOf(b.name);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map((group, order) => ({ ...group, order }));
}
