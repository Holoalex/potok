// Экран «Операции»: период, сводка за него и список по дням.

import { formatMoney } from '../core/money.js';
import { PRESETS, dayKey, dayTitle, labelOf, rangeOf } from '../core/period.js';
import * as store from '../core/store.js';
import { openAccounts } from './accounts.js';
import { frag, h, render } from './dom.js';
import { openEntry } from './entry.js';
import { icon } from './icons.js';
import { iconBadge } from './pickers.js';

/** Состояние экрана живёт здесь: период и фильтр по счетам общие для сеанса. */
export const view = {
  period: { kind: 'preset', preset: 'last30' },
  accountIds: null,     // null — все счета
  query: '',
};

export function renderOperations(root, { refresh }) {
  const base = store.baseCurrency();
  const { from, to } = rangeOf(view.period, store.state.settings.monthStartDay);
  const filter = { from, to, accountIds: view.accountIds };

  const rows = filterRows(store.selectTransactions(filter));
  const { income, expense } = store.totals(filter);

  const scopeName = view.accountIds
    ? store.accountById(view.accountIds[0])?.name ?? 'Счёт'
    : 'Все счета';

  const currentBalance = view.accountIds
    ? store.totalBalance(view.accountIds.map((id) => store.accountById(id)).filter(Boolean))
    : store.totalBalance();

  render(root,
    topbar(scopeName, refresh),
    periodBar(refresh),
    summary({ income, expense, balance: income - expense, currentBalance, base }),
    h('div', { class: 'section-head' },
      h('span', {}, 'Операции'),
      h('span', { class: 'section-head__hint' }, labelOf(view.period))),
    rows.length ? groupByDay(rows, refresh) : emptyState(),
    fab(refresh)
  );
}

// ------------------------------------------------------------------ шапка

function topbar(scopeName, refresh) {
  return h('header', { class: 'topbar' },
    h('button', {
      class: 'topbar__title', type: 'button',
      onClick: async () => {
        const picked = await openAccounts({ selectedIds: view.accountIds });
        if (picked !== undefined) { view.accountIds = picked; refresh(); }
      },
    },
      icon('wallet', { size: 18 }),
      h('span', {}, scopeName),
      icon('chevron-down', { size: 16 })),
    h('button', { class: 'round-btn', type: 'button', ariaLabel: 'Поиск' },
      icon('search', { size: 18 })),
    h('button', { class: 'round-btn', type: 'button', ariaLabel: 'Фильтр' },
      icon('sliders-horizontal', { size: 18 })),
    h('button', { class: 'round-btn', type: 'button', ariaLabel: 'Ещё' },
      icon('ellipsis', { size: 18 })));
}

function periodBar(refresh) {
  return h('div', { class: 'period-bar' },
    h('button', { class: 'period-chip', type: 'button' },
      h('span', {}, 'Период'),
      icon('chevron-right', { size: 14 })),
    h('div', { class: 'period-bar__scroll' },
      PRESETS.map((preset) => h('button', {
        class: 'period-item' + (view.period.preset === preset.id ? ' is-active' : ''),
        type: 'button',
        onClick: () => { view.period = { kind: 'preset', preset: preset.id }; refresh(); },
      }, preset.label))));
}

// ----------------------------------------------------------------- сводка

function summary({ income, expense, balance, currentBalance, base }) {
  const cell = (label, value, positive) =>
    h('div', { class: 'summary__cell' },
      h('span', { class: 'summary__label' }, icon('info', { size: 14 }), label),
      h('span', { class: `summary__value ${positive ? 'is-positive' : 'is-negative'}` }, value));

  // Плюсовое — акцентом, минусовое — обычным текстом. Так в оригинале.
  return h('div', { class: 'summary' },
    cell('Доходы', formatMoney(income, base), true),
    cell('Расходы', formatMoney(expense, base), false),
    cell('Баланс за период', formatMoney(balance, base, { sign: 'always' }), balance >= 0),
    cell('Текущий остаток',
      currentBalance === null ? 'нужен курс' : formatMoney(currentBalance, base, { sign: 'always' }),
      (currentBalance ?? 0) >= 0));
}

// ------------------------------------------------------------ список по дням

function filterRows(rows) {
  const query = view.query.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((t) => {
    const category = store.categoryById(t.categoryId)?.name ?? '';
    const payee = store.payeeById(t.payeeId)?.name ?? '';
    const account = store.accountById(t.accountId)?.name ?? '';
    return [t.note, category, payee, account].some((s) => s.toLowerCase().includes(query));
  });
}

function groupByDay(rows, refresh) {
  const days = new Map();
  for (const t of rows) {
    const key = dayKey(t.at);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(t);
  }

  const base = store.baseCurrency();

  return frag([...days.entries()].map(([, items]) => {
    const total = items.reduce((sum, t) => {
      if (t.type === 'transfer') return sum;
      const value = store.inBase(t) ?? 0;
      if (t.type === 'income') return sum + value;
      if (t.type === 'refund') return sum + value;
      return sum - value;
    }, 0);

    return h('section', { class: 'tx-group' },
      h('header', { class: 'tx-group__head' },
        h('span', {}, dayTitle(items[0].at)),
        h('span', { class: 'tx-group__total ' + (total >= 0 ? 'is-positive' : '') },
          formatMoney(total, base, { sign: 'always' }))),
      h('div', { class: 'tx-list' }, items.map((t) => txRow(t, refresh))));
  }));
}

function txRow(transaction, refresh) {
  const isTransfer = transaction.type === 'transfer';
  const category = store.categoryById(transaction.categoryId);
  const account = store.accountById(transaction.accountId);
  const toAccount = store.accountById(transaction.toAccountId);
  const payee = store.payeeById(transaction.payeeId);
  const place = store.placeById(transaction.placeId);
  const tags = transaction.tagIds.map((id) => store.tagById(id)).filter(Boolean);

  const title = isTransfer ? 'Перевод' : category?.name ?? 'Без категории';
  const glyph = isTransfer ? 'arrow-left-right' : category?.icon ?? 'package';
  const color = isTransfer ? 'var(--text-2)' : category?.color ?? 'var(--text-2)';

  const sign = transaction.type === 'expense' ? '−'
    : transaction.type === 'transfer' ? '' : '+';
  const amountClass = transaction.type === 'expense' ? 'is-negative'
    : transaction.type === 'transfer' ? '' : 'is-positive';

  const meta = h('div', { class: 'tx-row__meta' },
    account && chip(h('span', {
      class: 'meta-chip__dot', style: { background: account.color },
    }), isTransfer ? `${account.name} → ${toAccount?.name ?? '—'}` : account.name),
    payee && chip(icon('user', { size: 13 }), payee.name),
    tags.map((tag) => chip(icon('tag', { size: 13 }), tag.name)),
    place && chip(icon('map-pin', { size: 13 }), place.name),
    transaction.note && chip(null, transaction.note));

  return h('button', {
    class: 'tx-row', type: 'button',
    onClick: async () => {
      const result = await openEntry({ transaction });
      if (result) refresh();
    },
  },
    h('span', { class: 'tx-row__icon', style: { color } }, icon(glyph, { size: 20 })),
    h('span', { class: 'tx-row__title' }, title),
    h('span', { class: `tx-row__amount ${amountClass}` },
      `${sign ? sign + ' ' : ''}${formatMoney(transaction.amountMinor, transaction.currency, { symbol: true })}`),
    meta);
}

const chip = (glyph, text) => h('span', { class: 'meta-chip' }, glyph, h('span', {}, text));

const emptyState = () => h('div', { class: 'empty' },
  icon('list', { size: 32 }),
  h('div', {}, 'За этот период операций нет'));

function fab(refresh) {
  const side = store.state.settings.addButtonSide === 'left' ? ' fab--left' : '';
  return h('button', {
    class: 'fab' + side, type: 'button', ariaLabel: 'Добавить операцию',
    onClick: async () => {
      const result = await openEntry({ type: 'expense' });
      if (result) refresh();
    },
  }, icon('plus', { size: 26 }));
}
