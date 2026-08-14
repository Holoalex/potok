// Точка входа: инициализация, оболочка, роутинг по hash.

import * as store from './core/store.js';
import { h, render } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { renderOperations } from './ui/operations.js';
import { renderSettings } from './ui/settings.js';
import { applyTheme } from './ui/theme.js';

const TABS = [
  { path: '/', label: 'Операции', glyph: 'list', render: renderOperations },
  { path: '/report', label: 'Отчёт', glyph: 'chart-pie', render: stub('Отчёт') },
  { path: '/plan', label: 'План', glyph: 'chart-column', render: stub('План') },
  { path: '/settings', label: 'Настройки', glyph: 'settings', render: renderSettings },
];

function stub(name) {
  return (root) => render(root,
    h('header', { class: 'topbar' }, h('div', { class: 'topbar__title' }, h('span', {}, name))),
    h('div', { class: 'empty' },
      icon('chart-column', { size: 32 }),
      h('div', {}, `Экран «${name}» ещё не собран`),
      h('div', { class: 'muted' }, 'Следующий этап работы')));
}

const root = document.getElementById('app');
let screen;
let tabbar;

async function boot() {
  render(root, h('div', { class: 'splash' }, 'Загрузка…'));

  try {
    await store.init();
  } catch (error) {
    console.error(error);
    render(root, h('div', { class: 'empty' },
      h('div', {}, 'Не удалось открыть локальную базу данных'),
      h('p', { class: 'muted' }, String(error.message || error)),
      h('p', { class: 'muted' },
        'Проверьте, что приложение открыто не в приватном окне.')));
    return;
  }

  applyTheme(store.state.settings.theme);
  buildShell();
  window.addEventListener('hashchange', draw);
  draw();
}

function buildShell() {
  screen = h('main', { class: 'screen' });
  tabbar = h('nav', { class: 'tabbar' }, TABS.map((tab) =>
    h('a', {
      class: 'tabbar__item', href: '#' + tab.path, dataset: { path: tab.path },
    },
      icon(tab.glyph, { size: 22, stroke: 1.8 }),
      h('span', {}, tab.label))));

  render(root, screen, tabbar);
}

const currentTab = () => {
  const path = location.hash.replace(/^#/, '') || '/';
  return TABS.find((t) => t.path === path) || TABS[0];
};

function draw() {
  const tab = currentTab();
  document.title = tab.path === '/' ? 'Поток' : `Поток · ${tab.label}`;
  tabbar.querySelectorAll('.tabbar__item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.path === tab.path);
  });
  tab.render(screen, { refresh: draw });
}

boot();
