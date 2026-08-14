// Экран «Счета»: сворачиваемые группы с итогами, счета в своих валютах,
// сверху общий итог в базовой валюте. Открывается по названию фильтра в шапке.

import { formatMoney } from '../core/money.js';
import * as store from '../core/store.js';
import { frag, h, openSheet, sheetHeader, toast } from './dom.js';
import { icon } from './icons.js';
import { iconBadge } from './pickers.js';

/**
 * Возвращает выбор фильтра: null — все счета, иначе массив id.
 * undefined означает «закрыл, ничего не выбрав».
 */
export function openAccounts({ selectedIds = null } = {}) {
  return new Promise((resolve) => {
    const collapsed = new Set(
      store.state.accountGroups.filter((g) => g.collapsed).map((g) => g.id)
    );

    const sheet = openSheet({
      size: 'tall',
      build: (handle) => {
        const base = store.baseCurrency();
        const total = store.totalBalance();

        const allRow = h('ul', { class: 'list' },
          h('li', {},
            h('button', {
              class: 'list__row' + (selectedIds === null ? ' is-active' : ''),
              type: 'button', onClick: () => sheet.close(null),
            },
              h('span', { class: 'tree-toggle' }, icon('chevron-down', { size: 18 })),
              h('span', { class: 'list__title', style: { fontWeight: '600' } }, 'Все счета'),
              h('span', { class: 'list__value' },
                total === null ? 'нужен курс' : formatMoney(total, base, { sign: 'always' })))));

        const groups = store.state.accountGroups.map((group) => {
          const accounts = store.accountsOfGroup(group.id);
          if (!accounts.length) return null;

          const isCollapsed = collapsed.has(group.id);
          const groupTotal = store.totalBalance(accounts);

          return frag(
            h('button', {
              class: 'group-head' + (isCollapsed ? ' is-collapsed' : ''),
              type: 'button',
              onClick: () => {
                isCollapsed ? collapsed.delete(group.id) : collapsed.add(group.id);
                handle.rebuild();
              },
            },
              icon('chevron-down', { size: 16 }),
              h('span', { class: 'group-head__name' }, group.name),
              h('span', { class: 'group-head__total' },
                groupTotal === null ? '—' : formatMoney(groupTotal, base, { sign: 'always' }))),

            !isCollapsed && h('ul', { class: 'list' }, accounts.map((account) => {
              const balance = store.accountBalance(account.id);
              const chosen = Array.isArray(selectedIds) && selectedIds.includes(account.id);
              return h('li', {},
                h('button', {
                  class: 'list__row' + (chosen ? ' is-active' : ''),
                  type: 'button', onClick: () => sheet.close([account.id]),
                },
                  iconBadge(account.icon, account.color),
                  h('span', { class: 'list__title' },
                    account.name,
                    account.kind === 'goal' && account.goalTargetMinor
                      ? h('span', { class: 'list__sub' },
                          ` из ${formatMoney(account.goalTargetMinor, account.currency)}`)
                      : null),
                  h('span', { class: 'list__value' },
                    formatMoney(balance, account.currency, { sign: 'always' }))));
            }))
          );
        });

        const missing = store.missingRates();

        return frag(
          sheetHeader({ title: 'Счета', onClose: () => sheet.close(undefined) }),
          missing.length ? h('p', { class: 'muted', style: { margin: '0 16px 10px' } },
            `Нет курса для ${missing.join(', ')} — общий итог посчитать нельзя.`) : null,
          allRow,
          ...groups.filter(Boolean),
          h('div', { style: { height: '24px' } })
        );
      },
      onClose: resolve,
    });
  });
}

/** Корректировка остатка — служебная операция, как в оригинале. */
export function openBalanceCorrection(accountId) {
  return new Promise((resolve) => {
    const account = store.accountById(accountId);
    if (!account) return resolve(null);

    let value = String(store.accountBalance(accountId) / 10 ** 2);

    const sheet = openSheet({
      size: 'auto',
      build: () => frag(
        sheetHeader({
          title: 'Корректировка остатка',
          subtitle: account.name,
          onClose: () => sheet.close(null),
        }),
        h('p', { class: 'muted', style: { margin: '0 16px 12px' } },
          'Скорректируйте остаток счёта, если он отличается от фактического. ' +
          'Будет создана специальная корректирующая операция.'),
        h('div', { class: 'fields' },
          h('label', { class: 'field-row' },
            h('span', { class: 'field-row__label' }, 'Текущий остаток'),
            h('span', { class: 'field-row__value is-set' },
              h('input', {
                type: 'text', inputMode: 'decimal', value,
                onInput: (e) => { value = e.target.value; },
              })))),
        h('div', { class: 'stack' },
          h('button', {
            class: 'btn btn--primary', type: 'button',
            onClick: async () => {
              const { toMinor } = await import('../core/money.js');
              const target = toMinor(value.replace(',', '.'), account.currency);
              if (!Number.isFinite(target)) return toast('Введите сумму', { type: 'error' });
              await store.adjustBalance(accountId, target);
              toast('Остаток скорректирован');
              sheet.close('done');
            },
          }, 'Корректировать остаток'))
      ),
      onClose: resolve,
    });
  });
}
