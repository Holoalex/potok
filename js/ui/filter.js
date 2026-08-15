// Поиск и фильтр. Общие для «Операций» и «Отчёта» — в оригинале фильтр
// применяется к обоим экранам сразу.

import * as store from '../core/store.js';
import { frag, h, openSheet, sheetHeader } from './dom.js';
import { icon } from './icons.js';
import { pickMany } from './pickers.js';

export const filter = {
  query: '',
  mode: 'include',        // include — оставить только выбранное, exclude — убрать
  categoryIds: [],
  tagIds: [],
  payeeIds: [],
};

export const hasFilter = () =>
  filter.categoryIds.length > 0 || filter.tagIds.length > 0 || filter.payeeIds.length > 0;

export const isActive = () => hasFilter() || filter.query.trim().length > 0;

export function reset() {
  filter.query = '';
  filter.mode = 'include';
  filter.categoryIds = [];
  filter.tagIds = [];
  filter.payeeIds = [];
}

/** Подходит ли операция под текущие поиск и фильтр. */
export function matches(transaction) {
  const query = filter.query.trim().toLowerCase();
  if (query) {
    const parts = [
      transaction.note,
      store.categoryById(transaction.categoryId)?.name,
      store.payeeById(transaction.payeeId)?.name,
      store.accountById(transaction.accountId)?.name,
      store.placeById(transaction.placeId)?.name,
      ...transaction.tagIds.map((id) => store.tagById(id)?.name),
    ];
    if (!parts.some((part) => part && part.toLowerCase().includes(query))) return false;
  }

  if (!hasFilter()) return true;

  // Пусто в разделе — значит по нему не фильтруем вовсе.
  const hitCategory = filter.categoryIds.length
    ? filter.categoryIds.includes(transaction.categoryId)
      || filter.categoryIds.includes(store.rootCategoryOf(transaction.categoryId)?.id)
    : null;
  const hitTag = filter.tagIds.length
    ? transaction.tagIds.some((id) => filter.tagIds.includes(id))
    : null;
  const hitPayee = filter.payeeIds.length
    ? filter.payeeIds.includes(transaction.payeeId)
    : null;

  const hits = [hitCategory, hitTag, hitPayee].filter((v) => v !== null);
  const hit = hits.some(Boolean);
  return filter.mode === 'include' ? hit : !hit;
}

export const apply = (rows) => (isActive() ? rows.filter(matches) : rows);

// ------------------------------------------------------------------ шторка

export function openFilterSheet(refresh) {
  const sheet = openSheet({
    size: 'tall',
    build: (handle) => {
      const section = (label, ids, items, onPick) => {
        const chosen = ids.map((id) => items.find((i) => i.id === id)?.name).filter(Boolean);
        return h('button', { class: 'field-row', type: 'button', onClick: onPick },
          h('span', { class: 'field-row__label' }, label),
          h('span', { class: 'field-row__value' + (chosen.length ? ' is-set' : '') },
            h('span', {}, chosen.length ? chosen.join(', ') : 'Все'),
            icon('chevron-right', { size: 16 })));
      };

      return frag(
        sheetHeader({
          title: 'Фильтр',
          onClose: () => sheet.close(null),
          right: hasFilter() ? h('button', {
            class: 'round-btn', type: 'button', ariaLabel: 'Сбросить',
            onClick: () => { reset(); handle.rebuild(); refresh(); },
          }, icon('x', { size: 18 })) : null,
        }),

        h('div', { class: 'section-head' }, h('span', {}, 'Режим фильтрации')),
        h('ul', { class: 'list' },
          [['include', 'Включить'], ['exclude', 'Исключить']].map(([id, label]) =>
            h('li', {},
              h('button', {
                class: 'list__row' + (filter.mode === id ? ' is-active' : ''),
                type: 'button',
                onClick: () => { filter.mode = id; handle.rebuild(); refresh(); },
              },
                h('span', { class: 'list__title' }, label),
                filter.mode === id && h('span', { class: 'list__check' }, icon('check', { size: 18 })))))),

        h('div', { class: 'section-head' }, h('span', {}, 'Что учитывать')),
        h('div', { class: 'fields' },
          section('Категории', filter.categoryIds, store.state.categories, async () => {
            const picked = await pickMany({
              title: 'Категории',
              items: store.state.categories.filter((c) => !c.archived),
              selectedIds: filter.categoryIds,
            });
            if (picked) { filter.categoryIds = picked; handle.rebuild(); refresh(); }
          }),
          section('Метки', filter.tagIds, store.state.tags, async () => {
            const picked = await pickMany({
              title: 'Метки', items: store.state.tags, selectedIds: filter.tagIds,
            });
            if (picked) { filter.tagIds = picked; handle.rebuild(); refresh(); }
          }),
          section('Контрагенты', filter.payeeIds, store.state.payees, async () => {
            const picked = await pickMany({
              title: 'Контрагенты', items: store.state.payees,
              selectedIds: filter.payeeIds, iconName: 'user',
            });
            if (picked) { filter.payeeIds = picked; handle.rebuild(); refresh(); }
          })),

        h('p', { class: 'muted', style: { padding: '12px 16px' } },
          filter.mode === 'include'
            ? 'Останутся только операции, попавшие хотя бы в один из выбранных списков.'
            : 'Операции из выбранных списков будут скрыты.'),

        h('div', { class: 'stack' },
          h('button', {
            class: 'btn btn--primary', type: 'button', onClick: () => sheet.close('applied'),
          }, 'Применить фильтр'))
      );
    },
  });
  return sheet.result;
}

/** Строка поиска в шапке. */
export function searchBar(refresh, onCancel) {
  const input = h('input', {
    type: 'search', value: filter.query, placeholder: 'Поиск операций',
    onInput: (e) => {
      filter.query = e.target.value;
      const caret = e.target.selectionStart;
      refresh();
      const next = document.querySelector('.topbar .search-field input');
      if (next) { next.focus(); next.setSelectionRange(caret, caret); }
    },
  });

  setTimeout(() => input.focus(), 60);

  return h('header', { class: 'topbar' },
    h('div', { class: 'search-field', style: { flex: '1', margin: '0' } },
      icon('search', { size: 18 }), input),
    h('button', {
      class: 'round-btn round-btn--ghost', type: 'button',
      onClick: () => { filter.query = ''; onCancel(); },
    }, 'Отмена'));
}
