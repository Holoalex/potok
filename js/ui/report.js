// Экран «Отчёт»: кольцо или столбцы, четыре разреза, вкладки месяцев
// и проваливание в категорию с подкатегориями.

import { formatMoney } from '../core/money.js';
import {
  dayTitle, monthKeyOf, monthName, monthShort, rangeOf, recentMonths, weekNumber,
} from '../core/period.js';
import * as store from '../core/store.js';
import { openAccounts } from './accounts.js';
import { barChart, donutChart, shareRow } from './charts.js';
import { frag, h, openSheet, render, sheetHeader } from './dom.js';
import { icon } from './icons.js';
import { iconBadge } from './pickers.js';

const DIMENSIONS = [
  { id: 'category', label: 'Категории' },
  { id: 'payee', label: 'Контрагенты' },
  { id: 'place', label: 'Места' },
  { id: 'tag', label: 'Метки' },
];

const KINDS = [
  { id: 'expense', label: 'Расходы' },
  { id: 'income', label: 'Доходы' },
];

export const view = {
  chart: 'donut',                 // donut | bars
  kind: 'expense',
  dimension: 'category',
  month: monthKeyOf(Date.now()),
  bucket: 'day',                  // day | week — подвкладки столбцов
  accountIds: null,
};

export function renderReport(root, { refresh }) {
  const base = store.baseCurrency();
  const period = { kind: 'month', month: view.month };
  const { from, to } = rangeOf(period, store.state.settings.monthStartDay);
  const filter = { from, to, accountIds: view.accountIds };

  const rows = store.breakdown(view.dimension, { kind: view.kind, ...filter });
  const total = rows.reduce((sum, r) => sum + Math.max(r.amount, 0), 0);

  const scopeName = view.accountIds
    ? store.accountById(view.accountIds[0])?.name ?? 'Счёт'
    : 'Все счета';

  render(root,
    topbar(scopeName, refresh),
    monthTabs(refresh),
    controls(refresh),
    view.chart === 'donut'
      ? donutBlock(rows, refresh)
      : barsBlock(filter, refresh),
    totalsList(rows, total, base, refresh)
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
    h('button', { class: 'round-btn', type: 'button', ariaLabel: 'Фильтр' },
      icon('sliders-horizontal', { size: 18 })),
    h('button', { class: 'round-btn', type: 'button', ariaLabel: 'Ещё' },
      icon('ellipsis', { size: 18 })));
}

function monthTabs(refresh) {
  const months = recentMonths(6);
  if (!months.includes(view.month)) months.push(view.month);

  const scroll = h('div', { class: 'period-bar__scroll' },
    months.map((key) => h('button', {
      class: 'period-item' + (view.month === key ? ' is-active' : ''),
      type: 'button',
      onClick: () => { view.month = key; refresh(); },
    }, monthShort(key))));

  // Активный месяц держим в поле зрения: их шесть, все не влезают.
  // scrollIntoView здесь промахивается — считаем смещение сами, после раскладки.
  setTimeout(() => {
    const active = scroll.querySelector('.period-item.is-active');
    if (!active) return;
    scroll.scrollLeft = active.offsetLeft - scroll.clientWidth / 2 + active.clientWidth / 2;
  }, 0);

  return h('div', { class: 'period-bar' },
    h('button', { class: 'period-chip', type: 'button' },
      h('span', {}, 'Период'), icon('chevron-right', { size: 14 })),
    scroll);
}

function controls(refresh) {
  const toggle = h('div', { class: 'chart-toggle' },
    [['donut', 'chart-pie'], ['bars', 'chart-column']].map(([id, glyph]) =>
      h('button', {
        class: 'chart-toggle__item' + (view.chart === id ? ' is-active' : ''),
        type: 'button',
        ariaLabel: id === 'donut' ? 'Кольцо' : 'Столбцы',
        onClick: () => { view.chart = id; refresh(); },
      }, icon(glyph, { size: 18 }))));

  const dropdown = (items, currentId, onPick) => {
    const current = items.find((i) => i.id === currentId);
    return h('button', {
      class: 'dropdown', type: 'button',
      onClick: () => openChoice(items, currentId, onPick),
    },
      h('span', {}, current?.label ?? ''),
      icon('chevron-down', { size: 14 }));
  };

  const dimensions = view.kind === 'income'
    ? DIMENSIONS.map((d) => (d.id === 'payee' ? { ...d, label: 'Плательщики' } : d))
    : DIMENSIONS;

  return h('div', { class: 'report-controls' },
    toggle,
    dropdown(KINDS, view.kind, (id) => { view.kind = id; refresh(); }),
    dropdown(dimensions, view.dimension, (id) => { view.dimension = id; refresh(); }));
}

function openChoice(items, currentId, onPick) {
  const sheet = openSheet({
    size: 'auto',
    build: () => frag(
      h('ul', { class: 'list', style: { marginTop: '12px' } }, items.map((item) =>
        h('li', {},
          h('button', {
            class: 'list__row' + (item.id === currentId ? ' is-active' : ''),
            type: 'button',
            onClick: () => { sheet.close(item.id); onPick(item.id); },
          },
            h('span', { class: 'list__title' }, item.label),
            item.id === currentId && h('span', { class: 'list__check' }, icon('check', { size: 18 })))))),
      h('div', { style: { height: '20px' } })
    ),
  });
}

// --------------------------------------------------------------- диаграммы

function labelOf(dimension, key) {
  if (dimension === 'category') return store.categoryById(key)?.name ?? 'Без категории';
  if (dimension === 'payee') return store.payeeById(key)?.name ?? 'Без контрагента';
  if (dimension === 'place') return store.placeById(key)?.name ?? 'Без места';
  return store.tagById(key)?.name ?? 'Без метки';
}

function colorOf(dimension, key, index) {
  const entity = dimension === 'category' ? store.categoryById(key)
    : dimension === 'tag' ? store.tagById(key) : null;
  if (entity?.color) return entity.color;
  const palette = ['#1793df', '#30a044', '#1cb786', '#fd492d', '#fc1037',
    '#f45f8e', '#b15db6', '#ffc463', '#d8a67b', '#c5bfa1'];
  return key === null ? 'var(--text-3)' : palette[index % palette.length];
}

function glyphOf(dimension, key) {
  if (dimension === 'category') return store.categoryById(key)?.icon ?? 'package';
  if (dimension === 'payee') return 'user';
  if (dimension === 'place') return 'map-pin';
  return 'tag';
}

function donutBlock(rows, refresh) {
  const slices = rows.map((row, index) => ({
    amount: row.amount,
    color: colorOf(view.dimension, row.key, index),
    label: labelOf(view.dimension, row.key),
    key: row.key,
  }));

  return h('div', { class: 'chart-card' },
    donutChart(slices, {
      mergeBelow: store.state.settings.mergeSmallSlices ? 0.03 : 0,
      onSlice: (slice) => openDrilldown(slice.key, refresh),
    }));
}

function barsBlock(filter, refresh) {
  const series = store.timeSeries({ ...filter, bucket: view.bucket, kind: view.kind });
  const base = store.baseCurrency();

  const toPoint = (cell) => {
    const parts = [...cell.parts.entries()]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([categoryId, amount], index) => ({
        amount, color: colorOf('category', categoryId, index),
      }));
    return {
      label: view.bucket === 'week'
        ? `Неделя ${weekNumber(cell.at)}`
        : dayTitle(cell.at),
      tick: view.bucket === 'week'
        ? String(weekNumber(cell.at))
        : String(new Date(cell.at).getDate()),
      total: cell.total,
      parts,
      at: cell.at,
    };
  };

  // Пустые дни оставляем в оси: иначе столбцы съезжаются и график врёт
  // про плотность трат. В оригинале ось непрерывная.
  const points = fillGaps(series, filter, view.bucket).map(toPoint);

  const subtabs = h('div', { class: 'subtabs' },
    [['day', 'Дни'], ['week', 'Недели']].map(([id, label]) =>
      h('button', {
        class: 'subtabs__item' + (view.bucket === id ? ' is-active' : ''),
        type: 'button',
        onClick: () => { view.bucket = id; refresh(); },
      }, label)));

  return h('div', { class: 'chart-card' },
    subtabs,
    barChart(points, { currency: base }));
}

/** Достраивает пустые корзины между from и to, чтобы ось была непрерывной. */
function fillGaps(series, { from, to }, bucket) {
  if (from == null || to == null) return series;

  const byKey = new Map(series.map((cell) => [cell.key, cell]));
  const out = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  if (bucket === 'week') cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));

  const stepDays = bucket === 'week' ? 7 : 1;
  const guard = bucket === 'week' ? 80 : 400;

  for (let i = 0; cursor.getTime() <= to && i < guard; i++) {
    const at = cursor.getTime();
    const key = bucket === 'week'
      ? `w${at}`
      : `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    out.push(byKey.get(key) ?? { key, at, total: 0, parts: new Map() });
    cursor.setDate(cursor.getDate() + stepDays);
  }
  return out;
}

// ------------------------------------------------------------------ список

function totalsList(rows, total, base, refresh) {
  const canDrill = view.dimension === 'category';

  return h('div', { class: 'share-list' },
    shareRow({
      icon: h('span', { class: 'share-row__sigma' }, 'Σ'),
      name: view.kind === 'income' ? 'Все доходы' : 'Все расходы',
      amount: total,
      share: 1,
      currency: base,
      strong: true,
    }),
    rows.map((row, index) => {
      const color = colorOf(view.dimension, row.key, index);
      return shareRow({
        icon: iconBadge(glyphOf(view.dimension, row.key), color, 28),
        name: labelOf(view.dimension, row.key),
        amount: row.amount,
        share: row.share,
        currency: base,
        onClick: canDrill && row.key ? () => openDrilldown(row.key, refresh) : null,
      });
    }),
    view.dimension === 'tag' && h('p', { class: 'muted', style: { padding: '10px 16px' } },
      'Сумма по меткам может отличаться от общей: одна операция может иметь несколько меток.')
  );
}

// -------------------------------------------------------- проваливание

function openDrilldown(categoryId, refresh) {
  const category = store.categoryById(categoryId);
  if (!category) return;

  const period = { kind: 'month', month: view.month };
  const { from, to } = rangeOf(period, store.state.settings.monthStartDay);
  const filter = { from, to, accountIds: view.accountIds };
  const base = store.baseCurrency();

  let bucket = 'week';

  const sheet = openSheet({
    size: 'tall',
    build: (handle) => {
      const children = store.breakdownWithin(category.id, { kind: view.kind, ...filter });
      const total = children.reduce((sum, r) => sum + Math.max(r.amount, 0), 0);

      // Динамика внутри категории — за весь год, а не только за выбранный месяц.
      const year = Number(view.month.split('-')[0]);
      const wide = {
        from: new Date(year, 0, 1).getTime(),
        to: new Date(year, 11, 31, 23, 59, 59).getTime(),
        accountIds: view.accountIds,
      };
      const series = store.timeSeries({ ...wide, bucket, kind: view.kind })
        .filter((cell) => cell.parts.has(category.id))
        .map((cell) => {
          const amount = cell.parts.get(category.id) ?? 0;
          return {
            label: bucket === 'month'
              ? monthName(monthKeyOf(cell.at))
              : `Неделя ${weekNumber(cell.at)}`,
            tick: bucket === 'month'
              ? monthShort(monthKeyOf(cell.at)).slice(0, 3)
              : String(weekNumber(cell.at)),
            total: amount,
            parts: [{ amount, color: category.color }],
            at: cell.at,
          };
        });

      return frag(
        sheetHeader({
          title: category.name,
          subtitle: `${view.accountIds ? 'Счёт' : 'Все счета'} · ${monthName(view.month)}`,
          onClose: () => sheet.close(null),
        }),
        h('div', { class: 'chart-card' },
          h('div', { class: 'subtabs' },
            [['week', 'Недели'], ['month', 'Месяцы']].map(([id, label]) =>
              h('button', {
                class: 'subtabs__item' + (bucket === id ? ' is-active' : ''),
                type: 'button',
                onClick: () => { bucket = id; handle.rebuild(); },
              }, label))),
          barChart(series, { currency: base, height: 150 })),
        h('div', { class: 'share-list' },
          shareRow({
            icon: h('span', { class: 'share-row__sigma' }, 'Σ'),
            name: 'Итого',
            amount: total,
            share: 1,
            currency: base,
            strong: true,
          }),
          children.map((row) => {
            const child = store.categoryById(row.key);
            return shareRow({
              icon: iconBadge(child?.icon ?? 'package', child?.color ?? 'var(--text-2)', 28),
              name: child?.name ?? 'Без категории',
              amount: row.amount,
              share: row.share,
              currency: base,
            });
          })),
        h('div', { style: { height: '20px' } })
      );
    },
    onClose: () => refresh(),
  });
}
