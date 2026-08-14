// Периоды. Пресеты повторяют оригинал: последние 30/90/365 дней, вся история,
// произвольный отрезок и помесячные вкладки для отчёта.

export const PRESETS = [
  { id: 'last30', label: 'Посл. 30 дней', days: 30 },
  { id: 'last90', label: 'Посл. 90 дней', days: 90 },
  { id: 'last365', label: 'Посл. 365 дней', days: 365 },
  { id: 'all', label: 'Вся история' },
];

export const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const endOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/**
 * period: { kind: 'preset'|'month'|'custom', preset?, month?: 'YYYY-MM', from?, to? }
 * Возвращает { from, to } в миллисекундах; null означает «без границы».
 */
export function rangeOf(period, monthStartDay = 1) {
  if (!period || period.kind === 'preset') {
    const preset = PRESETS.find((p) => p.id === (period?.preset ?? 'last30'));
    if (!preset || !preset.days) return { from: null, to: null };
    const to = endOfDay(Date.now());
    const from = startOfDay(to - (preset.days - 1) * 86_400_000);
    return { from, to };
  }

  if (period.kind === 'month') {
    const [year, month] = period.month.split('-').map(Number);
    const day = Math.min(Math.max(monthStartDay, 1), 28);
    const from = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const to = new Date(year, month, day, 0, 0, 0, 0).getTime() - 1;
    return { from, to };
  }

  return { from: period.from ?? null, to: period.to ?? null };
}

export function labelOf(period) {
  if (!period || period.kind === 'preset') {
    return PRESETS.find((p) => p.id === (period?.preset ?? 'last30'))?.label ?? '';
  }
  if (period.kind === 'month') return monthName(period.month);
  const { from, to } = period;
  return `${shortDate(from)}—${shortDate(to)}`;
}

/** Последние N месяцев в виде 'YYYY-MM', для вкладок отчёта. */
export function recentMonths(count = 6, endDate = new Date()) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// ------------------------------------------------------------ форматирование

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда',
  'Четверг', 'Пятница', 'Суббота'];
const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export const monthName = (key) => {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS_NOM[month - 1]} ${year}`;
};

export const monthShort = (key) => MONTHS_NOM[Number(key.split('-')[1]) - 1];

export const shortDate = (ms) => {
  const d = new Date(ms);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

/** «Среда, 12 августа 2026 г.» — так подписаны дни в списке операций. */
export function dayTitle(ms) {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()} г.`;
}

/** «Ср, 12 августа 2026 г. в 15:22» — подпись даты в карточке операции. */
export function dateTimeTitle(ms) {
  const d = new Date(ms);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()} г. в ${time}`;
}

/** Ключ дня для группировки списка. */
export const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const monthKeyOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Значение для <input type="datetime-local">. */
export const toInputValue = (ms) => {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fromInputValue = (value) => new Date(value).getTime();
