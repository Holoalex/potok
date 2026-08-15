// Экран «План»: цели-копилки сверху, бюджеты с лимитами снизу.

import { formatMoney, formatPercent, toMinor } from '../core/money.js';
import { monthKeyOf, monthName, monthShort, rangeOf, recentMonths } from '../core/period.js';
import * as store from '../core/store.js';
import { confirmDialog, frag, h, openSheet, render, sheetHeader, toast } from './dom.js';
import { icon } from './icons.js';
import { iconBadge, pickCategory, pickTags } from './pickers.js';

export const view = { month: monthKeyOf(Date.now()) };

export function renderPlan(root, { refresh }) {
  const base = store.baseCurrency();
  const range = rangeOf({ kind: 'month', month: view.month }, store.state.settings.monthStartDay);

  render(root,
    h('header', { class: 'topbar' },
      h('div', { class: 'topbar__title' }, h('span', {}, 'План'))),

    sectionHead('Цели', () => openGoalEditor(null, refresh)),
    goalsBlock(base, refresh),

    sectionHead('Бюджеты', () => openBudgetEditor(null, refresh)),
    monthTabs(refresh),
    budgetsBlock(range, base, refresh)
  );
}

const sectionHead = (title, onAdd) =>
  h('div', { class: 'section-head' },
    h('span', {}, title),
    h('button', {
      class: 'round-btn', type: 'button', ariaLabel: `Добавить: ${title}`, onClick: onAdd,
    }, icon('plus', { size: 18 })));

function monthTabs(refresh) {
  const months = recentMonths(6);
  if (!months.includes(view.month)) months.push(view.month);

  const scroll = h('div', { class: 'period-bar__scroll' },
    months.map((key) => h('button', {
      class: 'period-item' + (view.month === key ? ' is-active' : ''),
      type: 'button',
      onClick: () => { view.month = key; refresh(); },
    }, monthShort(key))));

  setTimeout(() => {
    const active = scroll.querySelector('.period-item.is-active');
    if (active) scroll.scrollLeft = active.offsetLeft - scroll.clientWidth / 2 + active.clientWidth / 2;
  }, 0);

  return h('div', { class: 'period-bar' }, scroll);
}

// -------------------------------------------------------------------- цели

function goalsBlock(base, refresh) {
  const goals = store.goalAccounts();
  if (!goals.length) {
    return h('div', { class: 'plan-empty' },
      'Цель помогает удобно отслеживать прогресс накопления денег.');
  }

  return h('div', { class: 'plan-list' }, goals.map((goal) => {
    const p = store.goalProgress(goal);
    return h('button', {
      class: 'plan-row', type: 'button', onClick: () => openGoalEditor(goal, refresh),
    },
      h('span', { class: 'plan-row__icon' }, iconBadge(goal.icon, goal.color, 28)),
      h('span', { class: 'plan-row__name' }, goal.name),
      h('span', { class: 'plan-row__target' }, formatMoney(p.target, goal.currency)),
      h('span', { class: 'plan-row__meta' },
        h('b', { class: 'is-positive' }, formatMoney(p.saved, goal.currency)),
        p.monthsLeft !== null && h('span', {}, `Остаётся ${p.monthsLeft} мес`),
        h('span', { class: 'plan-row__left' }, formatMoney(p.left, goal.currency))),
      h('span', { class: 'plan-row__track' }, h('i', { style: { width: `${p.share * 100}%` } })));
  }));
}

// ----------------------------------------------------------------- бюджеты

function budgetsBlock(range, base, refresh) {
  const budgets = store.state.budgets;
  if (!budgets.length) {
    return h('div', { class: 'plan-empty' },
      'Бюджет позволяет устанавливать ограничения на траты за период.');
  }

  return h('div', { class: 'plan-list' }, budgets.map((budget) => {
    const p = store.budgetProgress(budget, range);
    const glyph = budget.scope === 'all' ? null
      : budget.scope === 'tags' ? 'tag'
      : store.categoryById(budget.categoryIds[0])?.icon ?? 'package';
    const color = budget.scope === 'categories'
      ? store.categoryById(budget.categoryIds[0])?.color ?? 'var(--text-2)'
      : 'var(--text-2)';

    return h('button', {
      class: 'plan-row', type: 'button',
      onClick: () => openBudgetEditor(budget, refresh),
    },
      h('span', { class: 'plan-row__icon' },
        glyph ? iconBadge(glyph, color, 28) : h('span', { class: 'share-row__sigma' }, 'Σ')),
      h('span', { class: 'plan-row__name' }, budget.name || 'Бюджет'),
      h('span', { class: 'plan-row__target' },
        h('b', { class: p.over ? 'is-over' : '' }, formatMoney(p.spent, base, { symbol: false })),
        ` / ${formatMoney(p.limit, base)}`),
      h('span', { class: 'plan-row__track' },
        h('i', {
          class: p.over ? 'is-over' : '',
          style: { width: `${Math.min(p.share, 1) * 100}%` },
        })),
      h('span', { class: 'plan-row__percent' }, formatPercent(Math.min(p.share, 9.99), 0)));
  }));
}

// ------------------------------------------------------------ редактор цели

function openGoalEditor(goal, refresh) {
  const draft = {
    id: goal?.id ?? null,
    name: goal?.name ?? '',
    icon: goal?.icon ?? 'piggy-bank',
    color: goal?.color ?? '#7737e6',
    currency: goal?.currency ?? store.baseCurrency(),
    kind: 'goal',
    groupId: goal?.groupId ?? store.state.accountGroups.find((g) => g.name.includes('Копилк'))?.id ?? null,
    target: goal?.goalTargetMinor ? String(goal.goalTargetMinor / 100) : '',
    date: goal?.goalDate ?? '',
    initialBalanceMinor: goal?.initialBalanceMinor ?? 0,
  };

  const sheet = openSheet({
    size: 'tall',
    build: (handle) => {
      const preview = draft.id ? store.goalProgress(store.accountById(draft.id)) : null;

      return frag(
        sheetHeader({
          title: goal ? 'Цель' : 'Новая цель',
          onClose: () => sheet.close(null),
          right: h('button', {
            class: 'round-btn round-btn--accent', type: 'button', ariaLabel: 'Сохранить',
            onClick: save,
          }, icon('check', { size: 18 })),
        }),
        h('p', { class: 'muted', style: { margin: '0 16px 12px' } },
          'Цель помогает удобно отслеживать прогресс накопления денег.'),
        h('div', { class: 'fields' },
          textRow('Название', draft.name, (v) => { draft.name = v; }, 'Например, Домик у моря'),
          iconRow('Иконка', draft.icon, draft.color, () => openIconPicker(draft, handle)),
          colorRow('Цвет', draft.color, (v) => { draft.color = v; handle.rebuild(); }),
          textRow('Сколько хотите накопить', draft.target, (v) => { draft.target = v; }, '0', 'decimal'),
          dateRow('Дата достижения', draft.date, (v) => { draft.date = v; handle.rebuild(); })),

        preview && h('div', { class: 'fields', style: { marginTop: '12px' } },
          infoRow('Накоплено', formatMoney(preview.saved, draft.currency)),
          preview.monthsLeft !== null && infoRow('Остаётся', `${preview.monthsLeft} мес`),
          preview.perMonth && infoRow('В месяц', formatMoney(preview.perMonth, draft.currency))),

        goal && h('div', { class: 'stack' },
          h('button', {
            class: 'btn btn--ghost', type: 'button',
            onClick: async () => {
              const ok = await confirmDialog({
                title: `Удалить «${goal.name}»?`,
                message: 'Счёт-копилка и его операции останутся, исчезнет только цель.',
                confirmText: 'Удалить цель',
              });
              if (!ok) return;
              await store.saveAccount({ ...goal, kind: 'regular', goalTargetMinor: null, goalDate: null });
              toast('Цель удалена');
              sheet.close('deleted');
              refresh();
            },
          }, 'Удалить цель')),
        h('div', { style: { height: '20px' } })
      );

      async function save() {
        if (!draft.name.trim()) return toast('Введите название', { type: 'error' });
        const target = toMinor(String(draft.target).replace(',', '.'), draft.currency);
        if (!target) return toast('Укажите сумму цели', { type: 'error' });

        await store.saveAccount({
          id: draft.id, name: draft.name, icon: draft.icon, color: draft.color,
          currency: draft.currency, kind: 'goal', groupId: draft.groupId,
          initialBalanceMinor: draft.initialBalanceMinor,
          goalTargetMinor: target, goalDate: draft.date || null,
        });
        toast(goal ? 'Цель сохранена' : 'Цель создана');
        sheet.close('saved');
        refresh();
      }
    },
  });
}

// --------------------------------------------------------- редактор бюджета

const SCOPES = [
  { id: 'all', label: 'Все расходы' },
  { id: 'categories', label: 'Категории' },
  { id: 'tags', label: 'Метки' },
];

function openBudgetEditor(budget, refresh) {
  const draft = {
    id: budget?.id ?? null,
    name: budget?.name ?? '',
    period: budget?.period ?? 'month',
    scope: budget?.scope ?? 'all',
    categoryIds: budget ? [...budget.categoryIds] : [],
    tagIds: budget ? [...budget.tagIds] : [],
    limit: budget?.limitMinor ? String(budget.limitMinor / 100) : '',
  };
  const base = store.baseCurrency();

  const sheet = openSheet({
    size: 'tall',
    build: (handle) => frag(
      sheetHeader({
        title: budget ? 'Бюджет' : 'Новый бюджет',
        onClose: () => sheet.close(null),
        right: h('button', {
          class: 'round-btn round-btn--accent', type: 'button', ariaLabel: 'Сохранить',
          onClick: save,
        }, icon('check', { size: 18 })),
      }),
      h('p', { class: 'muted', style: { margin: '0 16px 12px' } },
        'Бюджет позволяет устанавливать ограничения на траты за период.'),
      h('div', { class: 'fields' },
        infoRow('Период повтора', 'Месяц'),
        textRow('Сколько планируете потратить', draft.limit, (v) => { draft.limit = v; }, '0', 'decimal'),
        textRow('Название', draft.name, (v) => { draft.name = v; }, 'Например, На еду')),

      h('div', { class: 'section-head' }, h('span', {}, 'Какие расходы учитывать')),
      h('ul', { class: 'list' }, SCOPES.map((scope) =>
        h('li', {},
          h('button', {
            class: 'list__row' + (draft.scope === scope.id ? ' is-active' : ''),
            type: 'button',
            onClick: async () => {
              draft.scope = scope.id;
              if (scope.id === 'categories') {
                const picked = await pickCategory({ type: 'expense', currentId: draft.categoryIds[0] });
                if (picked) draft.categoryIds = [picked];
              } else if (scope.id === 'tags') {
                const picked = await pickTags(draft.tagIds);
                if (picked) draft.tagIds = picked;
              }
              handle.rebuild();
            },
          },
            h('span', { class: 'list__title' }, scope.label),
            draft.scope === scope.id && h('span', { class: 'list__check' }, icon('check', { size: 18 })))))),

      draft.scope === 'categories' && draft.categoryIds.length
        ? h('p', { class: 'muted', style: { padding: '0 16px' } },
            'Категория: ' + store.categoryById(draft.categoryIds[0])?.name)
        : null,
      draft.scope === 'tags' && draft.tagIds.length
        ? h('p', { class: 'muted', style: { padding: '0 16px' } },
            'Метки: ' + draft.tagIds.map((id) => store.tagById(id)?.name).filter(Boolean).join(', '))
        : null,

      budget && h('div', { class: 'stack' },
        h('button', {
          class: 'btn btn--ghost', type: 'button',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'Удалить бюджет?' });
            if (!ok) return;
            await store.deleteBudget(budget.id);
            toast('Бюджет удалён');
            sheet.close('deleted');
            refresh();
          },
        }, 'Удалить бюджет')),
      h('div', { style: { height: '20px' } })
    ),
  });

  async function save() {
    const limit = toMinor(String(draft.limit).replace(',', '.'), base);
    if (!limit) return toast('Укажите лимит', { type: 'error' });
    if (draft.scope === 'categories' && !draft.categoryIds.length) {
      return toast('Выберите категорию', { type: 'error' });
    }
    if (draft.scope === 'tags' && !draft.tagIds.length) {
      return toast('Выберите метки', { type: 'error' });
    }

    const fallbackName = draft.scope === 'all' ? 'Все расходы'
      : draft.scope === 'categories' ? store.categoryById(draft.categoryIds[0])?.name ?? 'Бюджет'
      : draft.tagIds.map((id) => store.tagById(id)?.name).filter(Boolean).join(', ');

    await store.saveBudget({
      id: draft.id, name: draft.name.trim() || fallbackName,
      period: draft.period, scope: draft.scope,
      categoryIds: draft.categoryIds, tagIds: draft.tagIds,
      limitMinor: limit,
    });
    toast(budget ? 'Бюджет сохранён' : 'Бюджет создан');
    sheet.close('saved');
    refresh();
  }
}

// ------------------------------------------------------------ строки формы

const textRow = (label, value, onInput, placeholder = '', mode = 'text') =>
  h('label', { class: 'field-row' },
    h('span', { class: 'field-row__label' }, label),
    h('span', { class: 'field-row__value is-set' },
      h('input', {
        type: 'text', value, placeholder, inputMode: mode,
        onInput: (e) => onInput(e.target.value),
      })));

const infoRow = (label, value) =>
  h('div', { class: 'field-row' },
    h('span', { class: 'field-row__label' }, label),
    h('span', { class: 'field-row__value is-set' }, value));

const dateRow = (label, value, onChange) =>
  h('label', { class: 'field-row', style: { position: 'relative' } },
    h('span', { class: 'field-row__label' }, label),
    h('span', { class: 'field-row__value' + (value ? ' is-set' : '') },
      value ? new Date(value).toLocaleDateString('ru-RU') : 'Не задана'),
    h('input', {
      type: 'date', value: value || '',
      style: { position: 'absolute', inset: '0', opacity: '0', width: '100%', height: '100%' },
      onChange: (e) => onChange(e.target.value),
    }));

const iconRow = (label, glyph, color, onClick) =>
  h('button', { class: 'field-row', type: 'button', onClick },
    h('span', { class: 'field-row__label' }, label),
    h('span', { class: 'field-row__value is-set' }, iconBadge(glyph, color, 26)));

const PALETTE = ['#7737e6', '#1793df', '#30a044', '#1cb786', '#fd492d',
  '#fc1037', '#f45f8e', '#b15db6', '#ffc463', '#d8a67b'];

const colorRow = (label, current, onPick) =>
  h('div', { class: 'field-row' },
    h('span', { class: 'field-row__label' }, label),
    h('span', { class: 'swatches' }, PALETTE.map((color) =>
      h('button', {
        class: 'swatch' + (color === current ? ' is-active' : ''),
        type: 'button', ariaLabel: color,
        style: { background: color },
        onClick: () => onPick(color),
      }))));

const GOAL_ICONS = ['piggy-bank', 'house', 'plane', 'car', 'bed', 'gift',
  'luggage', 'ticket', 'gamepad', 'book', 'dumbbell', 'sparkles'];

function openIconPicker(draft, parent) {
  const sheet = openSheet({
    size: 'auto',
    build: () => frag(
      sheetHeader({ title: 'Иконка', onClose: () => sheet.close(null) }),
      h('div', { class: 'icon-grid' }, GOAL_ICONS.map((name) =>
        h('button', {
          class: 'icon-grid__item' + (draft.icon === name ? ' is-active' : ''),
          type: 'button',
          style: { color: draft.color },
          onClick: () => { draft.icon = name; sheet.close(name); parent.rebuild(); },
        }, icon(name, { size: 24 })))),
      h('div', { style: { height: '20px' } })
    ),
  });
}
