// Экран добавления и правки операции.
// Повторяет оригинал: сегмент типа в шапке, крупная сумма, поля списком,
// кнопка сохранения и клавиатура с калькулятором внизу.

import { createCalc } from '../core/calc.js';
import { formatMoney, toMajor, toMinor, currency as currencyOf } from '../core/money.js';
import { dateTimeTitle, fromInputValue, toInputValue } from '../core/period.js';
import * as store from '../core/store.js';
import { confirmDialog, frag, h, haptic, openSheet, render, sheetHeader, toast } from './dom.js';
import { icon } from './icons.js';
import { iconBadge, pickAccount, pickCategory, pickPayee, pickPlace, pickTags } from './pickers.js';

const TYPES = [
  { id: 'income', label: 'Доход' },
  { id: 'expense', label: 'Расход' },
  { id: 'transfer', label: 'Перевод' },
];

export function openEntry({ type = 'expense', transaction = null } = {}) {
  const editing = Boolean(transaction);
  const accounts = store.activeAccounts().filter((a) => a.kind !== 'goal');
  const fallbackAccount = accounts[0] || store.activeAccounts()[0];

  const draft = {
    type: transaction?.type ?? type,
    at: transaction?.at ?? Date.now(),
    accountId: transaction?.accountId ?? fallbackAccount?.id ?? null,
    toAccountId: transaction?.toAccountId ?? null,
    categoryId: transaction?.categoryId ?? null,
    payeeId: transaction?.payeeId ?? null,
    tagIds: transaction ? [...transaction.tagIds] : [],
    placeId: transaction?.placeId ?? null,
    note: transaction?.note ?? '',
  };

  const accountCurrency = () => store.accountById(draft.accountId)?.currency ?? store.baseCurrency();

  const calc = createCalc({ maxDecimals: currencyOf(accountCurrency()).decimals });
  if (transaction) calc.setValue(toMajor(transaction.amountMinor, transaction.currency));

  // У перевода вторая сумма своя: счета могут быть в разных валютах.
  const toCalc = createCalc({ maxDecimals: 2 });
  if (transaction?.toAmountMinor != null) {
    toCalc.setValue(toMajor(transaction.toAmountMinor, transaction.toCurrency));
  }
  let editingSide = 'from';

  const sheet = openSheet({
    size: 'full',
    build: (handle) => build(handle),
  });

  function build(handle) {
    const isTransfer = draft.type === 'transfer';
    const isIncome = draft.type === 'income';
    const code = accountCurrency();
    const toCode = store.accountById(draft.toAccountId)?.currency ?? code;
    const activeCalc = editingSide === 'to' ? toCalc : calc;

    // ------------------------------------------------------------- шапка
    const header = sheetHeader({
      onClose: () => sheet.close(null),
      title: '',
      right: h('button', {
        class: 'round-btn round-btn--accent', type: 'button', ariaLabel: 'Сохранить',
        onClick: save,
      }, icon('check', { size: 18 })),
    });
    render(header.querySelector('.sheet__titles'),
      h('div', { class: 'segmented' }, TYPES.map((t) => h('button', {
        class: 'segmented__item' + (draft.type === t.id ? ' is-active' : ''),
        type: 'button',
        onClick: () => {
          if (draft.type === t.id) return;
          draft.type = t.id;
          if (t.id === 'transfer') {
            draft.categoryId = null;
            draft.payeeId = null;
            if (!draft.toAccountId) {
              draft.toAccountId = accounts.find((a) => a.id !== draft.accountId)?.id
                ?? store.activeAccounts().find((a) => a.id !== draft.accountId)?.id ?? null;
            }
            if (toCalc.isEmpty) toCalc.setValue(calc.value());
          } else {
            draft.toAccountId = null;
            draft.categoryId = null;
          }
          editingSide = 'from';
          handle.rebuild();
        },
      }, t.label))));

    // -------------------------------------------------------------- сумма
    const amountText = (c, cur) => `${draft.type === 'expense' ? '− ' : draft.type === 'income' ? '+ ' : ''}` +
      `${c.display()} ${currencyOf(cur).symbol}`;

    const amountBlock = isTransfer
      ? frag(
          h('button', {
            class: 'entry__amount' + (editingSide === 'from' ? '' : ' entry__amount--muted'),
            type: 'button',
            style: { opacity: editingSide === 'from' ? '1' : '0.45' },
            onClick: () => { editingSide = 'from'; handle.rebuild(); },
          }, `− ${calc.display()} ${currencyOf(code).symbol}`),
          h('button', {
            class: 'entry__amount entry__amount--income',
            type: 'button',
            style: { opacity: editingSide === 'to' ? '1' : '0.45', paddingTop: '0' },
            onClick: () => { editingSide = 'to'; handle.rebuild(); },
          }, `+ ${toCalc.display()} ${currencyOf(toCode).symbol}`))
      : h('div', { class: 'entry__amount' + (isIncome ? ' entry__amount--income' : '') },
          amountText(calc, code));

    // -------------------------------------------------------------- поля
    const category = store.categoryById(draft.categoryId);
    const account = store.accountById(draft.accountId);
    const toAccount = store.accountById(draft.toAccountId);
    const payee = store.payeeById(draft.payeeId);
    const place = store.placeById(draft.placeId);
    const tags = draft.tagIds.map((id) => store.tagById(id)).filter(Boolean);

    const fieldRow = (label, valueNode, onClick, isSet) =>
      h('button', { class: 'field-row', type: 'button', onClick },
        h('span', { class: 'field-row__label' }, label),
        h('span', { class: 'field-row__value' + (isSet ? ' is-set' : '') }, valueNode));

    const withIcon = (name, color, text) =>
      frag(h('span', { style: { color, display: 'inline-flex' } }, icon(name, { size: 17 })),
        h('span', {}, text));

    const noteInput = h('input', {
      type: 'text', value: draft.note, placeholder: 'Не указано', maxLength: 200,
      onInput: (e) => { draft.note = e.target.value; },
    });

    const dateInput = h('input', {
      type: 'datetime-local', value: toInputValue(draft.at),
      style: { position: 'absolute', inset: '0', opacity: '0', width: '100%', height: '100%' },
      onChange: (e) => { if (e.target.value) { draft.at = fromInputValue(e.target.value); handle.rebuild(); } },
    });

    const fields = h('div', { class: 'fields' },
      !isTransfer && fieldRow('Категория',
        category ? withIcon(category.icon, category.color, category.name) : 'Без категории',
        async () => {
          const picked = await pickCategory({
            type: draft.type === 'income' ? 'income' : 'expense',
            currentId: draft.categoryId,
          });
          if (picked !== null && picked !== undefined) { draft.categoryId = picked; handle.rebuild(); }
        }, Boolean(category)),

      fieldRow(isTransfer ? 'Со счёта' : 'Счёт',
        account ? withIcon(account.icon, account.color, account.name) : 'Не выбран',
        async () => {
          const picked = await pickAccount({ currentId: draft.accountId, excludeId: draft.toAccountId });
          if (picked) {
            draft.accountId = picked;
            calc.setMaxDecimals?.(currencyOf(accountCurrency()).decimals);
            handle.rebuild();
          }
        }, Boolean(account)),

      isTransfer && fieldRow('На счёт',
        toAccount ? withIcon(toAccount.icon, toAccount.color, toAccount.name) : 'Не выбран',
        async () => {
          const picked = await pickAccount({
            currentId: draft.toAccountId, excludeId: draft.accountId, title: 'Счёт получателя',
          });
          if (picked) { draft.toAccountId = picked; handle.rebuild(); }
        }, Boolean(toAccount)),

      h('label', { class: 'field-row', style: { position: 'relative' } },
        h('span', { class: 'field-row__label' }, 'Дата'),
        h('span', { class: 'field-row__value is-set' }, dateTimeTitle(draft.at)),
        dateInput),

      fieldRow('Метки',
        tags.length ? tags.map((t) => t.name).join(', ') : 'Не указаны',
        async () => {
          const picked = await pickTags(draft.tagIds);
          if (picked) { draft.tagIds = picked; handle.rebuild(); }
        }, tags.length > 0),

      !isTransfer && fieldRow(isIncome ? 'Плательщик' : 'Получатель',
        payee ? withIcon('user', 'var(--text-2)', payee.name) : 'Не указан',
        async () => {
          const picked = await pickPayee(draft.payeeId, isIncome ? 'Плательщик' : 'Получатель');
          if (picked !== undefined) { draft.payeeId = picked; handle.rebuild(); }
        }, Boolean(payee)),

      fieldRow('Место',
        place ? withIcon('map-pin', 'var(--text-2)', place.name) : 'Не указано',
        async () => {
          const picked = await pickPlace(draft.placeId);
          if (picked !== undefined) { draft.placeId = picked; handle.rebuild(); }
        }, Boolean(place)),

      h('label', { class: 'field-row' },
        h('span', { class: 'field-row__label' }, 'Примечание'),
        h('span', { class: 'field-row__value is-set' }, noteInput)));

    // -------------------------------------------------------- клавиатура
    const refresh = () => {
      const target = sheet.body.querySelector('.entry__amount');
      if (!isTransfer && target) target.textContent = amountText(calc, code);
      else handle.rebuild();
    };

    const press = (fn) => () => { haptic(); fn(); refresh(); };
    const keys = [
      ['7', () => activeCalc.digit(7)], ['8', () => activeCalc.digit(8)], ['9', () => activeCalc.digit(9)],
      ['÷', () => activeCalc.operator('÷')],
      ['4', () => activeCalc.digit(4)], ['5', () => activeCalc.digit(5)], ['6', () => activeCalc.digit(6)],
      ['×', () => activeCalc.operator('×')],
      ['1', () => activeCalc.digit(1)], ['2', () => activeCalc.digit(2)], ['3', () => activeCalc.digit(3)],
      ['−', () => activeCalc.operator('−')],
      [',', () => activeCalc.decimal()], ['0', () => activeCalc.digit(0)],
      ['⌫', () => activeCalc.backspace()], ['+', () => activeCalc.operator('+')],
    ];

    const keypad = h('div', { class: 'keypad' }, keys.map(([label, action]) =>
      h('button', {
        class: 'key' + (['÷', '×', '−', '+'].includes(label) ? ' key--op' : ''),
        type: 'button', onClick: press(action),
      }, label)));

    const saveButton = h('button', {
      class: 'btn btn--primary entry__save', type: 'button', onClick: save,
    }, activeCalc.hasExpression ? '=' : editing ? 'Сохранить' : 'Сохранить операцию');

    // Клавиатура прибита к низу, прокручивается только середина —
    // иначе на телефоне цифры уезжают за экран.
    return frag(
      header,
      h('div', { class: 'entry__scroll' },
        amountBlock,
        fields,
        editing && h('div', { class: 'stack' },
          h('button', {
            class: 'btn btn--ghost', type: 'button',
            onClick: async () => {
              const ok = await confirmDialog({
                title: 'Удалить операцию?', message: 'Действие нельзя отменить.',
              });
              if (!ok) return;
              await store.deleteTransaction(transaction.id);
              toast('Операция удалена');
              sheet.close('deleted');
            },
          }, 'Удалить операцию'))),
      h('div', { class: 'entry__footer' }, saveButton, keypad));

    // ------------------------------------------------------------ сохранение
    async function save() {
      haptic(12);
      if (activeCalc.hasExpression) { activeCalc.resolve(); handle.rebuild(); return; }

      const amountMinor = toMinor(calc.value(), code);
      if (amountMinor <= 0) return toast('Введите сумму больше нуля', { type: 'error' });
      if (!draft.accountId) return toast('Выберите счёт', { type: 'error' });

      const payload = {
        type: draft.type,
        at: draft.at,
        accountId: draft.accountId,
        amountMinor,
        currency: code,
        tagIds: draft.tagIds,
        placeId: draft.placeId,
        note: draft.note,
      };

      if (isTransfer) {
        if (!draft.toAccountId) return toast('Выберите счёт получателя', { type: 'error' });
        const toAmount = toMinor(toCalc.value(), toCode);
        if (toAmount <= 0) return toast('Введите сумму зачисления', { type: 'error' });
        Object.assign(payload, {
          toAccountId: draft.toAccountId, toAmountMinor: toAmount, toCurrency: toCode,
        });
      } else {
        Object.assign(payload, { categoryId: draft.categoryId, payeeId: draft.payeeId });
      }

      if (transaction) await store.updateTransaction(transaction.id, payload);
      else await store.addTransaction(payload);

      toast(transaction ? 'Сохранено' : formatMoney(amountMinor, code, { sign: 'always' }));
      sheet.close('saved');
    }
  }

  return sheet.result;
}
