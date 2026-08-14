// Микро-хелперы для DOM. Экраны перерисовывают свой контейнер целиком —
// состояние живёт в core/store.js, а не в разметке.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') applyStyle(el, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value);
  }

  append(el, children);
  return el;
}

/** Object.assign по el.style теряет кастомные свойства — их ставим отдельно. */
function applyStyle(el, styles) {
  for (const [prop, value] of Object.entries(styles)) {
    if (value === null || value === undefined) continue;
    if (prop.startsWith('--')) el.style.setProperty(prop, value);
    else el.style[prop] = value;
  }
}

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
};

export function render(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// ------------------------------------------------------------------ шторки

/**
 * Модальный экран снизу. Оригинал показывает их почти на весь экран
 * с закруглением сверху, поэтому по умолчанию — крупная шторка.
 */
export function openSheet({ title, build, size = 'full', onClose } = {}) {
  const body = h('div', { class: 'sheet__body' });

  const sheet = h('section', {
    class: `sheet sheet--${size}`, role: 'dialog', ariaModal: 'true',
  }, body);

  const backdrop = h('div', {
    class: 'backdrop',
    onClick: (e) => { if (e.target === backdrop) close(null); },
  }, sheet);

  let settle;
  const result = new Promise((resolve) => { settle = resolve; });
  let closed = false;

  function close(value) {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('backdrop--open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      backdrop.remove();
      if (!document.querySelector('.backdrop')) document.body.classList.remove('is-locked');
    }, 200);
    onClose?.(value);
    settle(value);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(null); }
  }

  const handle = { el: sheet, body, close, result, rebuild: () => {} };
  handle.rebuild = () => render(body, build?.(handle) ?? '');
  handle.rebuild();

  document.body.append(backdrop);
  document.body.classList.add('is-locked');
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => backdrop.classList.add('backdrop--open'));

  if (title) sheet.setAttribute('aria-label', title);
  return handle;
}

/** Шапка модального экрана: слева крестик, по центру заголовок, справа действие. */
export function sheetHeader({ onClose, title, subtitle, right }) {
  return h('header', { class: 'sheet__head' },
    h('button', {
      class: 'round-btn', type: 'button', ariaLabel: 'Закрыть', onClick: onClose,
    }, '✕'),
    h('div', { class: 'sheet__titles' },
      h('div', { class: 'sheet__title' }, title),
      subtitle && h('div', { class: 'sheet__subtitle' }, subtitle)),
    right || h('span', { class: 'round-btn round-btn--ghost' }));
}

// ------------------------------------------------------------------ диалоги

export function confirmDialog({ title, message, confirmText = 'Удалить', danger = true }) {
  return new Promise((resolve) => {
    const sheet = openSheet({
      size: 'auto',
      build: () => frag(
        h('h2', { class: 'dialog__title' }, title),
        message && h('p', { class: 'dialog__text' }, message),
        h('div', { class: 'dialog__actions' },
          h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => sheet.close(false) },
            'Отмена'),
          h('button', {
            class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary'),
            type: 'button', onClick: () => sheet.close(true),
          }, confirmText))
      ),
      onClose: (value) => resolve(value === true),
    });
  });
}

// -------------------------------------------------------------------- тосты

let toastTimer;

export function toast(message, { type = 'info', duration = 2400 } = {}) {
  let host = $('.toast-host');
  if (!host) {
    host = h('div', { class: 'toast-host' });
    document.body.append(host);
  }
  const node = h('div', { class: `toast toast--${type}` }, message);
  render(host, node);
  requestAnimationFrame(() => node.classList.add('is-visible'));

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), 200);
  }, duration);
}

export function haptic(ms = 8) {
  if (navigator.vibrate) navigator.vibrate(ms);
}
