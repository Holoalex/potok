// Деньги. Целые минорные единицы, форматирование как в оригинале, пересчёт валют.
// Слой без DOM — переезжает в нативное приложение как есть.

/**
 * Валюты. decimals — сколько знаков после запятой у минорной единицы.
 * Список сокращён до ходовых; недостающие подхватываются с decimals: 2.
 */
export const CURRENCIES = {
  RUB: { symbol: '₽', decimals: 2, name: 'Российский рубль' },
  USD: { symbol: '$', decimals: 2, name: 'Доллар США' },
  EUR: { symbol: '€', decimals: 2, name: 'Евро' },
  GBP: { symbol: '£', decimals: 2, name: 'Фунт стерлингов' },
  KZT: { symbol: '₸', decimals: 2, name: 'Казахстанский тенге' },
  BYN: { symbol: 'Br', decimals: 2, name: 'Белорусский рубль' },
  UAH: { symbol: '₴', decimals: 2, name: 'Гривна' },
  GEL: { symbol: '₾', decimals: 2, name: 'Лари' },
  AMD: { symbol: '֏', decimals: 2, name: 'Армянский драм' },
  TRY: { symbol: '₺', decimals: 2, name: 'Турецкая лира' },
  RSD: { symbol: 'дин.', decimals: 2, name: 'Сербский динар' },
  THB: { symbol: '฿', decimals: 2, name: 'Тайский бат' },
  AED: { symbol: 'د.إ', decimals: 2, name: 'Дирхам ОАЭ' },
  CNY: { symbol: '¥', decimals: 2, name: 'Юань' },
  CHF: { symbol: 'Fr', decimals: 2, name: 'Швейцарский франк' },
  PLN: { symbol: 'zł', decimals: 2, name: 'Польский злотый' },
  JPY: { symbol: '¥', decimals: 0, name: 'Японская иена' },
  KRW: { symbol: '₩', decimals: 0, name: 'Вона' },
};

const FALLBACK = { symbol: '', decimals: 2, name: '' };

export const currency = (code) => CURRENCIES[code] || { ...FALLBACK, symbol: code, name: code };

export const decimalsOf = (code) => currency(code).decimals;

// ------------------------------------------------------------ минорные единицы

/** «1 234,56» или 1234.56 -> 123456 при decimals = 2. */
export function toMinor(value, code) {
  const factor = 10 ** decimalsOf(code);
  const number = typeof value === 'string' ? parseAmount(value) : Number(value);
  if (!Number.isFinite(number)) return 0;
  // Округляем в строке: 1.005 * 100 в двоичной арифметике даёт 100.49999999999999.
  return Math.round((number + Number.EPSILON * Math.sign(number)) * factor);
}

export const toMajor = (minor, code) => minor / 10 ** decimalsOf(code);

/** Разбор пользовательского ввода: пробелы, неразрывные пробелы, запятая. */
export function parseAmount(text) {
  const cleaned = String(text)
    .replace(/[\s  ]/g, '')
    .replace(',', '.')
    .replace(/[^\d.\-+]/g, '');
  return parseFloat(cleaned);
}

// ------------------------------------------------------------ форматирование

const MINUS = '−';       // настоящий минус, а не дефис
const NBSP = ' ';
const THIN = ' ';        // узкий неразрывный пробел между разрядами

/**
 * Формат оригинала: «791 891,45 ₽», «+ 344 623,53 ₽», «− 904,98 ₽».
 * Знак отделён пробелом, разряды — узким пробелом, дробная часть через запятую.
 */
export function formatMoney(minor, code, options = {}) {
  const {
    sign = 'auto',            // 'auto' | 'always' | 'never'
    symbol = true,
    decimals: forceDecimals,
  } = options;

  const digits = forceDecimals ?? decimalsOf(code);
  const negative = minor < 0;
  const absolute = Math.abs(minor);

  const whole = Math.trunc(absolute / 10 ** digits);
  const fraction = absolute % 10 ** digits;

  // Круглые суммы оригинал печатает без дробной части: «250 000 ₽», не
  // «250 000,00 ₽». При этом «508 253,01 ₽» копейки сохраняет.
  let text = groupDigits(whole);
  if (digits > 0 && fraction !== 0) text += ',' + String(fraction).padStart(digits, '0');

  let prefix = '';
  if (negative) prefix = MINUS + NBSP;
  else if (sign === 'always' && minor !== 0) prefix = '+' + NBSP;

  const suffix = symbol ? NBSP + currency(code).symbol : '';
  return prefix + text + suffix;
}

/** Компактно для подписей: «84,3 тыс.», «1,2 млн». */
export function formatCompact(minor, code) {
  const value = Math.abs(toMajor(minor, code));
  const sign = minor < 0 ? MINUS + NBSP : '';
  if (value >= 1e6) return sign + trim(value / 1e6) + NBSP + 'млн';
  if (value >= 1e4) return sign + trim(value / 1e3) + NBSP + 'тыс.';
  return sign + groupDigits(Math.round(value));
}

const trim = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

function groupDigits(n) {
  const s = String(n);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/** Процент как в оригинале: «24,9 %». */
export const formatPercent = (share, digits = 1) =>
  (share * 100).toFixed(digits).replace('.', ',') + NBSP + '%';

// ------------------------------------------------------------------ пересчёт

/**
 * Курсы храним как «сколько базовой валюты стоит одна единица данной».
 * rates = { USD: 90.5, EUR: 98.2, RUB: 1 } при базовой RUB.
 */
export function convert(minor, from, to, rates) {
  if (from === to) return minor;
  const rateFrom = rates[from];
  const rateTo = rates[to];
  if (!rateFrom || !rateTo) return null; // курса нет — считать нельзя, врать не будем

  const major = toMajor(minor, from) * (rateFrom / rateTo);
  return toMinor(major, to);
}

/** Курс, выведенный из фактических сумм перевода. Оригинал хранит именно так. */
export function impliedRate(fromMinor, fromCode, toMinor_, toCode) {
  const a = toMajor(Math.abs(fromMinor), fromCode);
  const b = toMajor(Math.abs(toMinor_), toCode);
  return a === 0 ? null : b / a;
}
