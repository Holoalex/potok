// Редакторы справочников: счета, группы счетов и дерево категорий.

import { CURRENCIES, formatMoney, toMinor, toMajor } from '../core/money.js';
import * as store from '../core/store.js';
import { makeAccountGroup, makeCategory } from '../core/schema.js';
import { confirmDialog, frag, h, openSheet, sheetHeader, toast } from './dom.js';
import { icon } from './icons.js';
import { iconBadge } from './pickers.js';

const PALETTE = ['#7737e6', '#1793df', '#30a044', '#1cb786', '#fd492d',
  '#fc1037', '#f45f8e', '#b15db6', '#ffc463', '#d8a67b', '#c5bfa1', '#8b8b8b'];

const ACCOUNT_ICONS = ['wallet', 'banknote', 'credit-card', 'piggy-bank', 'building',
  'coins', 'briefcase', 'house', 'percent', 'sparkles'];

const CATEGORY_ICONS = ['basket', 'utensils', 'house', 'bus', 'health', 'shirt',
  'movie', 'plane', 'package', 'coffee', 'car', 'gift', 'book', 'dumbbell',
  'gamepad', 'music', 'pill', 'phone', 'zap', 'ticket', 'briefcase', 'percent',
  'wine', 'candy', 'apple', 'scissors', 'hammer', 'landmark', 'tag', 'sparkles'];

// ------------------------------------------------------------ общие строки

const textRow = (label, value, onInput, placeholder = '', mode = 'text') =>
  h('label', { class: 'field-row' },
    h('span', { class: 'field-row__label' }, label),
    h('span', { class: 'field-row__value is-set' },
      h('input', {
        type: 'text', value, placeholder, inputMode: mode,
        onInput: (e) => onInput(e.target.value),
      })));

const colorRow = (current, onPick) =>
  h('div', { class: 'field-row' },
    h('span', { class: 'field-row__label' }, 'Цвет'),
    h('span', { class: 'swatches' }, PALETTE.map((color) =>
      h('button', {
        class: 'swatch' + (color === current ? ' is-active' : ''),
        type: 'button', ariaLabel: color, style: { background: color },
        onClick: () => onPick(color),
      }))));

const switchRow = (label, checked, onToggle, hint) =>
  h('button', { class: 'field-row', type: 'button', onClick: onToggle },
    h('span', { class: 'field-row__label', style: { flex: '1' } },
      h('span', {}, label),
      hint && h('span', { class: 'field-row__hint' }, hint)),
    h('span', { class: 'switch' + (checked ? ' is-on' : '') }));

function openIconGrid(icons, current, color) {
  return new Promise((resolve) => {
    const sheet = openSheet({
      size: 'auto',
      build: () => frag(
        sheetHeader({ title: 'Иконка', onClose: () => sheet.close(null) }),
        h('div', { class: 'icon-grid' }, icons.map((name) =>
          h('button', {
            class: 'icon-grid__item' + (name === current ? ' is-active' : ''),
            type: 'button', style: { color },
            onClick: () => sheet.close(name),
          }, icon(name, { size: 24 })))),
        h('div', { style: { height: '20px' } })
      ),
      onClose: resolve,
    });
  });
}

// ------------------------------------------------------------ редактор счёта

export function openAccountEditor(account, refresh) {
  const groups = store.state.accountGroups;
  const draft = {
    id: account?.id ?? null,
    name: account?.name ?? '',
    icon: account?.icon ?? 'wallet',
    color: account?.color ?? '#7737e6',
    currency: account?.currency ?? store.baseCurrency(),
    groupId: account?.groupId ?? groups[0]?.id ?? null,
    kind: account?.kind ?? 'regular',
    goalTargetMinor: account?.goalTargetMinor ?? null,
    goalDate: account?.goalDate ?? null,
    excludeFromTotal: account?.excludeFromTotal ?? false,
    archived: account?.archived ?? false,
    initial: account ? String(toMajor(account.initialBalanceMinor, account.currency)) : '0',
  };

  const sheet = openSheet({
    size: 'tall',
    build: (handle) => frag(
      sheetHeader({
        title: account ? 'Счёт' : 'Новый счёт',
        onClose: () => sheet.close(null),
        right: h('button', {
          class: 'round-btn round-btn--accent', type: 'button', ariaLabel: 'Сохранить',
          onClick: save,
        }, icon('check', { size: 18 })),
      }),
      h('div', { class: 'fields' },
        textRow('Название', draft.name, (v) => { draft.name = v; }, 'Например, Зарплатная'),
        h('button', {
          class: 'field-row', type: 'button',
          onClick: async () => {
            const picked = await openIconGrid(ACCOUNT_ICONS, draft.icon, draft.color);
            if (picked) { draft.icon = picked; handle.rebuild(); }
          },
        },
          h('span', { class: 'field-row__label' }, 'Иконка'),
          h('span', { class: 'field-row__value is-set' }, iconBadge(draft.icon, draft.color, 26))),
        colorRow(draft.color, (v) => { draft.color = v; handle.rebuild(); }),
        h('label', { class: 'field-row' },
          h('span', { class: 'field-row__label' }, 'Валюта'),
          h('span', { class: 'field-row__value is-set' },
            h('select', {
              onChange: (e) => { draft.currency = e.target.value; handle.rebuild(); },
            }, Object.entries(CURRENCIES).map(([code, info]) =>
              h('option', { value: code, selected: code === draft.currency },
                `${code} ${info.symbol}`))))),
        h('label', { class: 'field-row' },
          h('span', { class: 'field-row__label' }, 'Группа'),
          h('span', { class: 'field-row__value is-set' },
            h('select', {
              onChange: (e) => { draft.groupId = e.target.value || null; },
            }, [
              h('option', { value: '' }, 'Без группы'),
              ...groups.map((group) =>
                h('option', { value: group.id, selected: group.id === draft.groupId }, group.name)),
            ]))),
        textRow('Начальный остаток', draft.initial, (v) => { draft.initial = v; }, '0', 'decimal'),
        switchRow('Не учитывать в общем балансе', draft.excludeFromTotal,
          () => { draft.excludeFromTotal = !draft.excludeFromTotal; handle.rebuild(); },
          'Счёт останется в списке, но выпадет из итога «Все счета»'),
        account && switchRow('В архиве', draft.archived,
          () => { draft.archived = !draft.archived; handle.rebuild(); },
          'Скрыть из выбора, историю оставить')),

      account && h('div', { class: 'stack' },
        h('button', {
          class: 'btn btn--ghost', type: 'button',
          onClick: () => removeAccount(account, sheet, refresh),
        }, 'Удалить счёт')),
      h('div', { style: { height: '20px' } })
    ),
  });

  async function save() {
    if (!draft.name.trim()) return toast('Введите название', { type: 'error' });
    await store.saveAccount({
      ...draft,
      name: draft.name.trim(),
      initialBalanceMinor: toMinor(String(draft.initial).replace(',', '.'), draft.currency),
    });
    toast(account ? 'Счёт сохранён' : 'Счёт создан');
    sheet.close('saved');
    refresh();
  }

  return sheet.result;
}

async function removeAccount(account, sheet, refresh) {
  const used = store.state.transactions.filter(
    (t) => t.accountId === account.id || t.toAccountId === account.id
  );
  const ok = await confirmDialog({
    title: `Удалить «${account.name}»?`,
    message: used.length
      ? `На счёте ${used.length} операций. Переводы будут удалены, остальные останутся без счёта.`
      : 'Счёт не используется.',
  });
  if (!ok) return;

  const transfers = used.filter((t) => t.type === 'transfer').map((t) => t.id);
  for (const id of transfers) await store.deleteTransaction(id);
  for (const t of used.filter((t) => t.type !== 'transfer')) {
    await store.updateTransaction(t.id, { accountId: null });
  }
  await store.deleteAccount(account.id);
  toast('Счёт удалён');
  sheet.close('deleted');
  refresh();
}

// ---------------------------------------------------------- группы счетов

export function openGroupsEditor(refresh) {
  const sheet = openSheet({
    size: 'tall',
    build: (handle) => frag(
      sheetHeader({ title: 'Группы счетов', onClose: () => sheet.close(null) }),
      h('ul', { class: 'list' }, store.state.accountGroups.map((group) =>
        h('li', {},
          h('div', { class: 'list__row' },
            h('span', { class: 'list__icon', style: { color: 'var(--text-2)' } },
              icon('wallet', { size: 20 })),
            h('input', {
              class: 'list__title', type: 'text', value: group.name,
              style: { border: 'none', background: 'none', outline: 'none' },
              onChange: async (e) => {
                await store.saveAccountGroup({ ...group, name: e.target.value.trim() || group.name });
                refresh();
              },
            }),
            h('button', {
              class: 'round-btn round-btn--ghost', type: 'button', ariaLabel: 'Удалить',
              onClick: async () => {
                const inGroup = store.accountsOfGroup(group.id);
                const ok = await confirmDialog({
                  title: `Удалить группу «${group.name}»?`,
                  message: inGroup.length
                    ? `${inGroup.length} счетов останутся без группы.`
                    : 'Группа пуста.',
                });
                if (!ok) return;
                await store.deleteAccountGroup(group.id);
                handle.rebuild();
                refresh();
              },
            }, icon('trash-2', { size: 16 })))))),
      h('div', { class: 'stack' },
        h('button', {
          class: 'btn btn--ghost', type: 'button',
          onClick: async () => {
            await store.saveAccountGroup(makeAccountGroup({
              name: 'Новая группа', order: store.state.accountGroups.length,
            }));
            handle.rebuild();
            refresh();
          },
        }, '+ Добавить группу')),
      h('div', { style: { height: '20px' } })
    ),
  });
  return sheet.result;
}

// ------------------------------------------------------- дерево категорий

export function openCategoriesEditor(refresh) {
  let type = 'expense';
  const expanded = new Set();

  const sheet = openSheet({
    size: 'full',
    build: (handle) => {
      const rows = [];

      for (const parent of store.topCategories(type)) {
        const children = store.childrenOf(parent.id);
        const isOpen = expanded.has(parent.id);

        rows.push(h('li', {},
          h('div', { class: 'list__row' },
            children.length
              ? h('button', {
                  class: 'tree-toggle', type: 'button',
                  onClick: () => {
                    isOpen ? expanded.delete(parent.id) : expanded.add(parent.id);
                    handle.rebuild();
                  },
                }, icon(isOpen ? 'chevron-down' : 'chevron-right', { size: 18 }))
              : h('span', { class: 'tree-toggle' }),
            h('button', {
              class: 'list__main', type: 'button',
              onClick: () => openCategoryEditor(parent, type, handle, refresh),
            },
              iconBadge(parent.icon, parent.color),
              h('span', { class: 'list__title' }, parent.name),
              h('span', { class: 'list__sub' }, `${children.length}`)),
            h('button', {
              class: 'round-btn round-btn--ghost', type: 'button', ariaLabel: 'Подкатегория',
              onClick: () => openCategoryEditor(null, type, handle, refresh, parent.id),
            }, icon('plus', { size: 16 })))));

        if (!isOpen) continue;
        for (const child of children) {
          rows.push(h('li', {},
            h('button', {
              class: 'list__row list__row--child', type: 'button',
              onClick: () => openCategoryEditor(child, type, handle, refresh),
            },
              iconBadge(child.icon, child.color),
              h('span', { class: 'list__title' }, child.name),
              h('span', { class: 'list__sub' }, `${store.state.transactions
                .filter((t) => t.categoryId === child.id).length}`))));
        }
      }

      return frag(
        sheetHeader({ title: 'Категории', onClose: () => sheet.close(null) }),
        h('div', { class: 'segmented', style: { margin: '0 auto 10px' } },
          [['expense', 'Расходы'], ['income', 'Доходы']].map(([id, label]) =>
            h('button', {
              class: 'segmented__item' + (type === id ? ' is-active' : ''),
              type: 'button',
              onClick: () => { type = id; handle.rebuild(); },
            }, label))),
        h('ul', { class: 'list' }, rows),
        h('div', { class: 'stack' },
          h('button', {
            class: 'btn btn--ghost', type: 'button',
            onClick: () => openCategoryEditor(null, type, handle, refresh, null),
          }, '+ Категория верхнего уровня')),
        h('div', { style: { height: '20px' } })
      );
    },
  });
  return sheet.result;
}

function openCategoryEditor(category, type, parentSheet, refresh, parentId = undefined) {
  const draft = {
    id: category?.id ?? null,
    name: category?.name ?? '',
    icon: category?.icon ?? 'package',
    color: category?.color ?? '#7737e6',
    type: category?.type ?? type,
    parentId: category ? category.parentId : parentId ?? null,
    archived: category?.archived ?? false,
  };

  const sheet = openSheet({
    size: 'tall',
    build: (handle) => frag(
      sheetHeader({
        title: category ? 'Категория' : draft.parentId ? 'Новая подкатегория' : 'Новая категория',
        onClose: () => sheet.close(null),
        right: h('button', {
          class: 'round-btn round-btn--accent', type: 'button', ariaLabel: 'Сохранить',
          onClick: save,
        }, icon('check', { size: 18 })),
      }),
      draft.parentId && h('p', { class: 'muted', style: { margin: '0 16px 10px' } },
        `Внутри «${store.categoryById(draft.parentId)?.name}»`),
      h('div', { class: 'fields' },
        textRow('Название', draft.name, (v) => { draft.name = v; }),
        h('button', {
          class: 'field-row', type: 'button',
          onClick: async () => {
            const picked = await openIconGrid(CATEGORY_ICONS, draft.icon, draft.color);
            if (picked) { draft.icon = picked; handle.rebuild(); }
          },
        },
          h('span', { class: 'field-row__label' }, 'Иконка'),
          h('span', { class: 'field-row__value is-set' }, iconBadge(draft.icon, draft.color, 26))),
        colorRow(draft.color, (v) => { draft.color = v; handle.rebuild(); }),
        category && switchRow('В архиве', draft.archived,
          () => { draft.archived = !draft.archived; handle.rebuild(); },
          'Скрыть из выбора, историю оставить')),

      category && h('div', { class: 'stack' },
        h('button', {
          class: 'btn btn--ghost', type: 'button',
          onClick: async () => {
            const used = store.state.transactions.filter((t) => t.categoryId === category.id).length;
            const children = store.childrenOf(category.id).length;
            const ok = await confirmDialog({
              title: `Удалить «${category.name}»?`,
              message: [
                used ? `${used} операций останутся без категории.` : null,
                children ? `${children} подкатегорий поднимутся на верхний уровень.` : null,
              ].filter(Boolean).join(' ') || 'Категория не используется.',
            });
            if (!ok) return;
            await store.deleteCategory(category.id);
            toast('Категория удалена');
            sheet.close('deleted');
            parentSheet.rebuild();
            refresh();
          },
        }, 'Удалить категорию')),
      h('div', { style: { height: '20px' } })
    ),
  });

  async function save() {
    if (!draft.name.trim()) return toast('Введите название', { type: 'error' });
    await store.saveCategory(makeCategory({ ...draft, name: draft.name.trim() }));
    toast(category ? 'Сохранено' : 'Категория создана');
    sheet.close('saved');
    parentSheet.rebuild();
    refresh();
  }
}
