// Диаграммы на голом SVG: кольцо с подписями долей внутри секторов
// и столбцы, сегментированные по категориям. Как в оригинале.

import { formatCompact, formatMoney, formatPercent } from '../core/money.js';
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    el.setAttribute(key, value);
  }
  children.flat(Infinity).filter(Boolean).forEach((c) => el.append(c));
  return el;
}

const polar = (cx, cy, r, angle) => [
  cx + r * Math.cos(angle - Math.PI / 2),
  cy + r * Math.sin(angle - Math.PI / 2),
];

/** Путь сектора кольца от start до end (радианы, 0 — сверху). */
function ringSlice(cx, cy, rOuter, rInner, start, end) {
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = polar(cx, cy, rOuter, start);
  const [x2, y2] = polar(cx, cy, rOuter, end);
  const [x3, y3] = polar(cx, cy, rInner, end);
  const [x4, y4] = polar(cx, cy, rInner, start);
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

/**
 * Кольцо. slices: [{ amount, color, label }].
 * Доли меньше mergeBelow сливаются в «Остальное» — так делает оригинал,
 * иначе кольцо превращается в частокол волосинок.
 */
export function donutChart(slices, { size = 300, mergeBelow = 0.03, onSlice } = {}) {
  const positive = slices.filter((s) => s.amount > 0);
  const total = positive.reduce((sum, s) => sum + s.amount, 0);

  if (!total) {
    return h('div', { class: 'empty' }, 'Нет данных за период');
  }

  let shown = positive;
  if (mergeBelow > 0) {
    const big = positive.filter((s) => s.amount / total >= mergeBelow);
    const small = positive.filter((s) => s.amount / total < mergeBelow);
    if (small.length > 1) {
      shown = [...big, {
        amount: small.reduce((sum, s) => sum + s.amount, 0),
        color: 'var(--text-3)',
        label: 'Остальное',
        merged: small,
      }];
    }
  }

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter * 0.56;
  const gap = shown.length > 1 ? 0.012 : 0;

  const chart = svg('svg', {
    viewBox: `0 0 ${size} ${size}`, class: 'donut', role: 'img',
    'aria-label': 'Распределение по категориям',
  });

  let angle = 0;
  for (const slice of shown) {
    const share = slice.amount / total;
    const start = angle + gap / 2;
    const end = angle + share * Math.PI * 2 - gap / 2;
    angle += share * Math.PI * 2;
    if (end <= start) continue;

    const path = svg('path', {
      d: ringSlice(cx, cy, rOuter, rInner, start, end),
      fill: slice.color,
      class: 'donut__slice',
    });
    path.append(svg('title', {}, document.createTextNode(
      `${slice.label} — ${formatPercent(share)}`)));
    if (onSlice && !slice.merged) {
      path.style.cursor = 'pointer';
      path.addEventListener('click', () => onSlice(slice));
    }
    chart.append(path);

    // Подпись доли — внутри сектора, как в оригинале. На узких не помещается.
    if (share >= 0.045) {
      const [tx, ty] = polar(cx, cy, (rOuter + rInner) / 2, (start + end) / 2);
      chart.append(svg('text', {
        x: tx, y: ty, class: 'donut__label',
        'text-anchor': 'middle', 'dominant-baseline': 'central',
      }, document.createTextNode(formatPercent(share))));
    }
  }

  return h('div', { class: 'donut-wrap' }, chart);
}

/**
 * Столбцы, сегментированные по категориям.
 * points: [{ label, total, parts: [{ amount, color }] }]
 */
export function barChart(points, { currency, height = 190, onBar } = {}) {
  if (!points.length) return h('div', { class: 'empty' }, 'Нет данных за период');

  const max = Math.max(...points.map((p) => p.total), 1);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;

  const grid = [];
  for (let value = step; value <= top + 0.5; value += step) {
    grid.push(h('div', { class: 'bars__grid-line', style: { bottom: `${(value / top) * 100}%` } },
      h('span', {}, formatCompact(value, currency))));
  }

  const columns = points.map((point) => {
    const stack = point.parts.map((part) =>
      h('i', {
        class: 'bars__seg',
        style: { height: `${(part.amount / point.total) * 100}%`, background: part.color },
      }));

    return h('button', {
      class: 'bars__col', type: 'button',
      title: `${point.label}: ${formatCompact(point.total, currency)}`,
      onClick: onBar ? () => onBar(point) : null,
    },
      h('span', { class: 'bars__stack', style: { height: `${(point.total / top) * 100}%` } }, stack),
      h('span', { class: 'bars__tick' }, point.tick ?? ''));
  });

  return h('div', { class: 'bars', style: { '--bars-height': height + 'px' } },
    h('div', { class: 'bars__grid' }, grid),
    h('div', { class: 'bars__cols' }, columns));
}

/** Круглый шаг сетки: 1, 2, 5 на порядок. */
function niceStep(max) {
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / power;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * power;
}

/** Строка разреза: иконка, название, сумма и полоса доли. */
export function shareRow({ icon: iconNode, name, amount, share, currency, onClick, strong = false }) {
  return h('button', {
    class: 'share-row' + (strong ? ' share-row--total' : ''),
    type: 'button', onClick, disabled: !onClick,
  },
    h('span', { class: 'share-row__icon' }, iconNode),
    h('span', { class: 'share-row__name' }, name),
    h('span', { class: 'share-row__amount' }, formatMoney(amount, currency)),
    h('span', { class: 'share-row__track' },
      h('i', { style: { width: `${Math.max(share * 100, 1)}%` } })));
}
