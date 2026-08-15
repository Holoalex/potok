// «Параметры экрана» из меню «…». Настройки общие для приложения,
// как в оригинале: часть влияет только на вид, часть — на расчёты.

import * as store from '../core/store.js';
import { frag, h, openSheet, sheetHeader } from './dom.js';
import { icon } from './icons.js';

const SWITCHES = [
  ['showBalance', 'Показывать остаток', null],
  ['showChart', 'Показывать диаграмму', null],
  ['mergeSmallSlices', 'Объединять маленькие значения',
    'Доли меньше 3 % на кольце соберутся в «Остальное»'],
  ['transfersAsIncomeExpense', 'Переводы как доходы и расходы',
    'Перевод между своими счетами попадёт в статистику'],
  ['adjustmentsAsIncomeExpense', 'Корректировки как доходы и расходы',
    'Корректировки остатка попадут в статистику'],
];

export function openScreenParams(refresh) {
  const sheet = openSheet({
    size: 'tall',
    build: (handle) => {
      const s = store.state.settings;

      const toggle = (key, label, hint) =>
        h('button', {
          class: 'field-row', type: 'button',
          onClick: async () => {
            await store.setSetting(key, !s[key]);
            handle.rebuild();
            refresh();
          },
        },
          h('span', { class: 'field-row__label', style: { flex: '1' } },
            h('span', {}, label),
            hint && h('span', { class: 'field-row__hint' }, hint)),
          h('span', { class: 'switch' + (s[key] ? ' is-on' : '') }));

      const choice = (key, options) =>
        h('div', { class: 'fields' }, options.map(([value, label]) =>
          h('button', {
            class: 'field-row', type: 'button',
            onClick: async () => {
              await store.setSetting(key, value);
              handle.rebuild();
              refresh();
            },
          },
            h('span', { class: 'field-row__label' }, label),
            s[key] === value && h('span', { class: 'list__check' }, icon('check', { size: 18 })))));

      return frag(
        sheetHeader({ title: 'Параметры экрана', onClose: () => sheet.close(null) }),
        h('div', { class: 'fields' }, SWITCHES.map(([key, label, hint]) => toggle(key, label, hint))),

        h('div', { class: 'section-head' }, h('span', {}, 'Сортировка результатов')),
        choice('reportSort', [['amount', 'По сумме'], ['standard', 'Стандартная']]),

        h('div', { class: 'section-head' }, h('span', {}, 'Кнопка добавления')),
        choice('addButtonSide', [['right', 'Справа'], ['left', 'Слева']]),

        h('div', { class: 'section-head' }, h('span', {}, 'Первый день месяца')),
        h('div', { class: 'fields' },
          h('label', { class: 'field-row' },
            h('span', { class: 'field-row__label' }, 'Число'),
            h('span', { class: 'field-row__value is-set' },
              h('input', {
                type: 'number', min: 1, max: 28, value: s.monthStartDay,
                onChange: async (e) => {
                  const day = Math.min(Math.max(Number(e.target.value) || 1, 1), 28);
                  await store.setSetting('monthStartDay', day);
                  handle.rebuild();
                  refresh();
                },
              })))),
        h('p', { class: 'muted', style: { padding: '8px 16px 20px' } },
          'Сдвигает границы месячных и годовых периодов — удобно, если считать бюджет от зарплаты.')
      );
    },
  });
  return sheet.result;
}
