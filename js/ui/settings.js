// Экран «Настройки». Пока — то, без чего не прожить: тема, базовая валюта,
// курсы и импорт из Money Flow. Остальное появится вместе со своими экранами.

import { CURRENCIES, formatMoney } from '../core/money.js';
import { buildImport, deriveOpeningBalances, looksLikeMoneyFlow } from '../core/import-moneyflow.js';
import * as store from '../core/store.js';
import { DEFAULT_SETTINGS } from '../core/schema.js';
import { openAccounts } from './accounts.js';
import { confirmDialog, frag, h, openSheet, render, sheetHeader, toast } from './dom.js';
import { openCategoriesEditor } from './editors.js';
import { icon } from './icons.js';
import { openScreenParams } from './screen-params.js';
import { applyTheme } from './theme.js';

const THEMES = [
  ['system', 'Системное'],
  ['light', 'Светлая'],
  ['dark', 'Тёмная'],
  ['black', 'Чёрная'],
  ['pureBlack', 'Чистая чёрная'],
];

export function renderSettings(root, { refresh }) {
  const s = store.state.settings;

  const set = async (key, value) => {
    await store.setSetting(key, value);
    if (key === 'theme') applyTheme(value);
    refresh();
  };

  const navRow = (glyph, title, value, onClick) =>
    h('button', { class: 'list__row', type: 'button', onClick },
      h('span', { class: 'list__icon', style: { color: 'var(--accent)' } }, icon(glyph, { size: 18 })),
      h('span', { class: 'list__title' }, title),
      value && h('span', { class: 'list__sub' }, value),
      icon('chevron-right', { size: 16 }));

  render(root,
    h('header', { class: 'topbar' }, h('div', { class: 'topbar__title' }, h('span', {}, 'Настройки'))),

    h('div', { class: 'section-head' }, h('span', {}, 'Общее')),
    h('ul', { class: 'list list--flush' },
      h('li', {}, navRow('banknote', 'Основная валюта', s.baseCurrency,
        () => openCurrencyPicker(set))),
      h('li', {}, navRow('percent', 'Курсы валют',
        `${Object.keys(s.rates).length - 1} задано`, () => openRates(refresh))),
      h('li', {}, navRow('settings', 'Тема',
        THEMES.find(([id]) => id === s.theme)?.[1] ?? '', () => openThemePicker(set)))),

    h('div', { class: 'section-head' }, h('span', {}, 'Справочники')),
    h('ul', { class: 'list list--flush' },
      h('li', {}, navRow('tag', 'Категории',
        `${store.topCategories('expense').length} расходных, ${store.topCategories('income').length} доходных`,
        () => openCategoriesEditor(refresh))),
      h('li', {}, navRow('wallet', 'Счета',
        `${store.activeAccounts().length} активных`,
        () => openAccounts().then(refresh))),
      h('li', {}, navRow('sliders-horizontal', 'Параметры экрана', '',
        () => openScreenParams(refresh)))),

    h('div', { class: 'section-head' }, h('span', {}, 'Данные')),
    h('ul', { class: 'list list--flush' },
      h('li', {}, navRow('copy', 'Импорт из Money Flow',
        `${store.state.transactions.length} операций`, () => openImport(refresh))),
      h('li', {}, navRow('trash-2', 'Удалить все данные', '', async () => {
        const ok = await confirmDialog({
          title: 'Удалить все данные?',
          message: 'Операции, счета и справочники будут стёрты безвозвратно.',
          confirmText: 'Удалить всё',
        });
        if (!ok) return;
        await store.wipe();
        toast('Данные удалены');
        refresh();
      }))),

    h('p', { class: 'muted', style: { padding: '18px 16px', textAlign: 'center' } },
      'Поток · данные хранятся только на устройстве')
  );
}

// ------------------------------------------------------------------ валюта

function openCurrencyPicker(set) {
  const sheet = openSheet({
    size: 'tall',
    build: () => frag(
      sheetHeader({ title: 'Основная валюта', onClose: () => sheet.close(null) }),
      h('ul', { class: 'list' }, Object.entries(CURRENCIES).map(([code, info]) =>
        h('li', {},
          h('button', {
            class: 'list__row' + (store.state.settings.baseCurrency === code ? ' is-active' : ''),
            type: 'button',
            onClick: async () => { await set('baseCurrency', code); sheet.close(code); },
          },
            h('span', { class: 'list__icon' }, info.symbol),
            h('span', { class: 'list__title' }, `${code} — ${info.name}`),
            store.state.settings.baseCurrency === code
              && h('span', { class: 'list__check' }, icon('check', { size: 18 })))))),
      h('div', { style: { height: '20px' } })
    ),
  });
}

function openThemePicker(set) {
  const sheet = openSheet({
    size: 'auto',
    build: () => frag(
      sheetHeader({ title: 'Тема оформления', onClose: () => sheet.close(null) }),
      h('ul', { class: 'list' }, THEMES.map(([id, label]) =>
        h('li', {},
          h('button', {
            class: 'list__row' + (store.state.settings.theme === id ? ' is-active' : ''),
            type: 'button',
            onClick: async () => { await set('theme', id); sheet.close(id); },
          },
            h('span', { class: 'list__title' }, label),
            store.state.settings.theme === id
              && h('span', { class: 'list__check' }, icon('check', { size: 18 })))))),
      h('div', { style: { height: '20px' } })
    ),
  });
}

// ------------------------------------------------------------------- курсы

function openRates(refresh) {
  const sheet = openSheet({
    size: 'tall',
    build: (handle) => {
      const base = store.baseCurrency();
      const used = [...new Set(store.state.accounts.map((a) => a.currency))].filter((c) => c !== base);

      return frag(
        sheetHeader({ title: 'Курсы валют', subtitle: `к ${base}`, onClose: () => sheet.close(null) }),
        h('p', { class: 'muted', style: { margin: '0 16px 12px' } },
          'Сколько стоит одна единица валюты в основной. Курс нужен только для общего ' +
          'итога — суммы переводов хранятся фактические и не пересчитываются.'),
        h('div', { class: 'fields' }, used.length ? used.map((code) =>
          h('label', { class: 'field-row' },
            h('span', { class: 'field-row__label' }, `1 ${code}`),
            h('span', { class: 'field-row__value is-set' },
              h('input', {
                type: 'text', inputMode: 'decimal',
                value: store.state.settings.rates[code] ?? '',
                placeholder: 'не задан',
                onChange: async (e) => {
                  const rate = parseFloat(String(e.target.value).replace(',', '.'));
                  if (Number.isFinite(rate) && rate > 0) {
                    await store.setRate(code, rate);
                    refresh();
                    handle.rebuild();
                  }
                },
              }))))
          : h('div', { class: 'field-row' },
              h('span', { class: 'field-row__label' }, 'Все счета в основной валюте'))),
        h('div', { style: { height: '20px' } })
      );
    },
  });
}

// ------------------------------------------------------------------ импорт

function openImport(refresh) {
  const sheet = openSheet({
    size: 'tall',
    build: (handle) => {
      let built = null;
      const body = h('div', {});

      const pickFile = () => {
        const input = h('input', { type: 'file', accept: '.csv,text/csv' });
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          const text = await file.text();
          if (!looksLikeMoneyFlow(text)) {
            return toast('Это не похоже на экспорт Money Flow', { type: 'error' });
          }
          built = buildImport(text, { baseCurrency: store.baseCurrency() });
          render(body, preview(built));
        });
        input.click();
      };

      const preview = (data) => {
        const r = data.report;
        const line = (label, value) => h('div', { class: 'field-row' },
          h('span', { class: 'field-row__label' }, label),
          h('span', { class: 'field-row__value is-set' }, value));

        return frag(
          h('div', { class: 'fields' },
            line('Операций', String(r.rows)),
            line('Расходы / доходы / переводы', `${r.expense} / ${r.income} / ${r.transfer}`),
            line('Счетов', String(data.accounts.length)),
            line('Категорий', String(data.categories.length)),
            line('Валюты', r.currencies.join(', '))),
          r.unknownCategories.length
            ? h('p', { class: 'muted', style: { margin: '10px 16px' } },
                `Не нашлись в дереве и попали в «Другое»: ${r.unknownCategories.join(', ')}`)
            : null,
          h('p', { class: 'muted', style: { margin: '10px 16px' } },
            'В экспорте нет начальных остатков — балансы будут посчитаны только по этим ' +
            'операциям. Поправить их можно корректировкой остатка на экране счёта.'),
          h('div', { class: 'stack' },
            h('button', {
              class: 'btn btn--primary', type: 'button',
              onClick: async () => {
                const ok = await confirmDialog({
                  title: 'Заменить текущие данные?',
                  message: 'Всё, что сейчас в приложении, будет стёрто.',
                  confirmText: 'Импортировать', danger: false,
                });
                if (!ok) return;
                await store.wipe();
                await store.bulkLoad({
                  ...data,
                  settings: { ...DEFAULT_SETTINGS, ...store.state.settings },
                });
                toast(`Импортировано ${data.transactions.length} операций`);
                sheet.close('imported');
                refresh();
              },
            }, 'Импортировать'))
        );
      };

      return frag(
        sheetHeader({ title: 'Импорт из Money Flow', onClose: () => sheet.close(null) }),
        h('p', { class: 'muted', style: { margin: '0 16px 12px' } },
          'Выгрузите данные в оригинале: Настройки → Экспорт → Экспортировать в CSV, ' +
          'затем выберите файл здесь.'),
        h('div', { class: 'stack' },
          h('button', { class: 'btn btn--ghost', type: 'button', onClick: pickFile },
            'Выбрать файл CSV')),
        body
      );
    },
  });
}
