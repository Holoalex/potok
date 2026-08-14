// Пикеры справочников. Категории — дерево с раскрытием, метки — множественный
// выбор, остальные — обычный список с поиском, как в оригинале.

import { formatMoney } from '../core/money.js';
import * as store from '../core/store.js';
import { frag, h, openSheet, render, sheetHeader } from './dom.js';
import { icon } from './icons.js';

const matches = (name, query) => !query || name.toLowerCase().includes(query.toLowerCase());

function searchField(placeholder, onInput) {
  const input = h('input', {
    type: 'search', placeholder, onInput: (e) => onInput(e.target.value),
  });
  const field = h('div', { class: 'search-field' }, icon('search', { size: 18 }), input);
  setTimeout(() => input.focus(), 80);
  return { field, input };
}

/**
 * Иконка в цвете сущности. Без круглой подложки — в оригинале глифы лежат
 * прямо на белом, подложка сразу выдаёт чужой интерфейс.
 */
export const iconBadge = (name, color, size = 32) =>
  h('span', { class: 'list__icon', style: { color } },
    icon(name, { size: Math.round(size * 0.78), stroke: 1.9 }));

// -------------------------------------------------------------- категории

export function pickCategory({ type = 'expense', currentId = null } = {}) {
  return new Promise((resolve) => {
    let query = '';
    const expanded = new Set();

    // Раскрываем ветку, в которой лежит текущая категория.
    const current = store.categoryById(currentId);
    if (current?.parentId) expanded.add(current.parentId);

    const sheet = openSheet({
      size: 'tall',
      build: (handle) => {
        const rows = [];

        for (const parent of store.topCategories(type)) {
          const children = store.childrenOf(parent.id);
          const visibleChildren = children.filter((c) => matches(c.name, query));
          const parentHit = matches(parent.name, query);
          if (!parentHit && !visibleChildren.length) continue;

          const isOpen = expanded.has(parent.id) || (query && visibleChildren.length);

          rows.push(h('li', {},
            h('div', { class: 'list__row' + (parent.id === currentId ? ' is-active' : '') },
              children.length
                ? h('button', {
                    class: 'tree-toggle', type: 'button',
                    ariaLabel: isOpen ? 'Свернуть' : 'Развернуть',
                    onClick: () => {
                      expanded.has(parent.id) ? expanded.delete(parent.id) : expanded.add(parent.id);
                      handle.rebuild();
                    },
                  }, icon(isOpen ? 'chevron-down' : 'chevron-right', { size: 18 }))
                : h('span', { class: 'tree-toggle' }),
              h('button', {
                class: 'list__row', style: { padding: '0', minHeight: 'auto', flex: '1' },
                type: 'button', onClick: () => sheet.close(parent.id),
              },
                iconBadge(parent.icon, parent.color),
                h('span', { class: 'list__title' }, parent.name),
                parent.id === currentId && h('span', { class: 'list__check' }, icon('check', { size: 18 }))))));

          if (!isOpen) continue;
          for (const child of visibleChildren) {
            rows.push(h('li', {},
              h('button', {
                class: 'list__row list__row--child' + (child.id === currentId ? ' is-active' : ''),
                type: 'button', onClick: () => sheet.close(child.id),
              },
                iconBadge(child.icon, child.color),
                h('span', { class: 'list__title' }, child.name),
                child.id === currentId && h('span', { class: 'list__check' }, icon('check', { size: 18 })))));
          }
        }

        const { field } = searchField('Поиск', (value) => {
          query = value;
          render(list, rows.length ? rows : []);
          handle.rebuild();
        });

        const list = h('ul', { class: 'list' }, rows.length ? rows : emptyRow('Ничего не найдено'));

        return frag(
          sheetHeader({ title: 'Категория', onClose: () => sheet.close(null) }),
          field,
          list,
          h('div', { style: { height: '16px' } })
        );
      },
      onClose: resolve,
    });
  });
}

const emptyRow = (text) => h('li', {}, h('div', { class: 'list__row' },
  h('span', { class: 'list__title', style: { color: 'var(--text-2)' } }, text)));

// ----------------------------------------------------------------- счета

export function pickAccount({ currentId = null, excludeId = null, title = 'Счёт' } = {}) {
  return new Promise((resolve) => {
    const sheet = openSheet({
      size: 'tall',
      build: () => {
        const groups = store.state.accountGroups.length
          ? store.state.accountGroups
          : [{ id: null, name: '' }];

        const blocks = groups.map((group) => {
          const accounts = store.state.accounts
            .filter((a) => a.groupId === group.id && !a.archived && a.id !== excludeId);
          if (!accounts.length) return null;
          return frag(
            group.name && h('div', { class: 'group-head' },
              h('span', { class: 'group-head__name' }, group.name)),
            h('ul', { class: 'list' }, accounts.map((account) =>
              h('li', {},
                h('button', {
                  class: 'list__row' + (account.id === currentId ? ' is-active' : ''),
                  type: 'button', onClick: () => sheet.close(account.id),
                },
                  iconBadge(account.icon, account.color),
                  h('span', { class: 'list__title' }, account.name),
                  h('span', { class: 'list__value' },
                    formatMoney(store.accountBalance(account.id), account.currency, { sign: 'always' }))))))
          );
        });

        return frag(
          sheetHeader({ title, onClose: () => sheet.close(null) }),
          ...blocks.filter(Boolean),
          h('div', { style: { height: '16px' } })
        );
      },
      onClose: resolve,
    });
  });
}

// ------------------------------------------------------ простые справочники

function pickFromList({ title, items, currentId, iconName, allowEmpty = true }) {
  return new Promise((resolve) => {
    let query = '';
    const sheet = openSheet({
      size: 'tall',
      build: (handle) => {
        const visible = items.filter((item) => matches(item.name, query));
        const { field } = searchField('Поиск', (value) => { query = value; handle.rebuild(); });

        return frag(
          sheetHeader({ title, onClose: () => sheet.close(undefined) }),
          field,
          h('ul', { class: 'list' },
            allowEmpty && h('li', {},
              h('button', {
                class: 'list__row' + (currentId === null ? ' is-active' : ''),
                type: 'button', onClick: () => sheet.close(null),
              },
                h('span', { class: 'list__title', style: { color: 'var(--text-2)' } }, 'Не указан'))),
            visible.length
              ? visible.map((item) => h('li', {},
                  h('button', {
                    class: 'list__row' + (item.id === currentId ? ' is-active' : ''),
                    type: 'button', onClick: () => sheet.close(item.id),
                  },
                    iconBadge(iconName, item.color || 'var(--text-2)'),
                    h('span', { class: 'list__title' }, item.name),
                    item.id === currentId && h('span', { class: 'list__check' }, icon('check', { size: 18 })))))
              : emptyRow('Ничего не найдено')),
          h('div', { style: { height: '16px' } })
        );
      },
      onClose: resolve,
    });
  });
}

export const pickPayee = (currentId, title = 'Контрагент') =>
  pickFromList({ title, items: store.state.payees, currentId, iconName: 'user' });

export const pickPlace = (currentId) =>
  pickFromList({ title: 'Место', items: store.state.places, currentId, iconName: 'map-pin' });

// ------------------------------------------------------------------ метки

export function pickTags(currentIds = []) {
  return new Promise((resolve) => {
    const selected = new Set(currentIds);
    const sheet = openSheet({
      size: 'tall',
      build: (handle) => frag(
        sheetHeader({ title: 'Метки', onClose: () => sheet.close(undefined) }),
        h('p', { class: 'muted', style: { margin: '0 16px 10px' } },
          'Метки помечают операции поперёк категорий — одна операция может иметь несколько.'),
        h('ul', { class: 'list' }, store.state.tags.map((tag) =>
          h('li', {},
            h('button', {
              class: 'list__row' + (selected.has(tag.id) ? ' is-active' : ''),
              type: 'button',
              onClick: () => {
                selected.has(tag.id) ? selected.delete(tag.id) : selected.add(tag.id);
                handle.rebuild();
              },
            },
              iconBadge('tag', tag.color),
              h('span', { class: 'list__title' }, tag.name),
              selected.has(tag.id) && h('span', { class: 'list__check' }, icon('check', { size: 18 })))))),
        h('div', { class: 'stack' },
          h('button', {
            class: 'btn btn--primary', type: 'button',
            onClick: () => sheet.close([...selected]),
          }, 'Готово'))
      ),
      onClose: (value) => resolve(value),
    });
  });
}
