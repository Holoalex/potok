// Мини-калькулятор для клавиатуры ввода суммы.
// Приоритет операций честный: × и ÷ считаются раньше + и −.

const OPS = {
  '+': { prec: 1, apply: (a, b) => a + b },
  '−': { prec: 1, apply: (a, b) => a - b },
  '×': { prec: 2, apply: (a, b) => a * b },
  '÷': { prec: 2, apply: (a, b) => (b === 0 ? NaN : a / b) },
};

export const isOperator = (token) => Object.hasOwn(OPS, token);

export function createCalc({ maxDecimals = 2 } = {}) {
  let entry = '0';
  let tokens = []; // [число, оператор, число, ...] — всегда заканчивается оператором

  const api = {
    get entry() { return entry; },
    get tokens() { return tokens; },
    get hasExpression() { return tokens.length > 0; },
    get isEmpty() { return entry === '0' && !tokens.length; },

    digit(d) {
      if (entry === '0') entry = String(d);
      else if (countDecimals(entry) < maxDecimals) entry += d;
      else if (!entry.includes('.')) entry += d;
      return api;
    },

    decimal() {
      if (maxDecimals > 0 && !entry.includes('.')) entry += '.';
      return api;
    },

    operator(op) {
      if (!isOperator(op)) return api;
      if (tokens.length && isOperator(tokens.at(-1)) && entry === '0') {
        tokens[tokens.length - 1] = op; // просто меняем знак операции
        return api;
      }
      tokens.push(parseFloat(entry) || 0, op);
      entry = '0';
      return api;
    },

    backspace() {
      if (entry !== '0') {
        entry = entry.slice(0, -1) || '0';
        if (entry === '-') entry = '0';
      } else if (tokens.length) {
        tokens.pop();                       // оператор
        const last = tokens.pop();          // число перед ним
        entry = formatNumber(last ?? 0);
      }
      return api;
    },

    clear() {
      entry = '0';
      tokens = [];
      return api;
    },

    /** Свернуть выражение в одно число. */
    resolve() {
      const value = evaluate([...tokens, parseFloat(entry) || 0]);
      entry = Number.isFinite(value) ? formatNumber(round(value, maxDecimals)) : '0';
      tokens = [];
      return api;
    },

    value() {
      const result = evaluate([...tokens, parseFloat(entry) || 0]);
      return Number.isFinite(result) ? round(result, maxDecimals) : 0;
    },

    setValue(number) {
      entry = formatNumber(round(number, maxDecimals));
      tokens = [];
      return api;
    },

    /** Строка для табло: «1 200 + 350,5» */
    display() {
      const parts = tokens.map((t) => (isOperator(t) ? t : pretty(formatNumber(t))));
      parts.push(pretty(entry));
      return parts.join(' ');
    },
  };

  return api;
}

function evaluate(flat) {
  if (!flat.length) return 0;
  // Сначала × и ÷, затем + и −.
  const reduced = [flat[0]];
  for (let i = 1; i < flat.length; i += 2) {
    const op = flat[i];
    const rhs = flat[i + 1] ?? 0;
    if (OPS[op].prec === 2) {
      const lhs = reduced.pop();
      reduced.push(OPS[op].apply(lhs, rhs));
    } else {
      reduced.push(op, rhs);
    }
  }
  let acc = reduced[0];
  for (let i = 1; i < reduced.length; i += 2) {
    acc = OPS[reduced[i]].apply(acc, reduced[i + 1]);
  }
  return acc;
}

const round = (n, decimals) => Math.round(n * 10 ** decimals) / 10 ** decimals;

const countDecimals = (s) => (s.includes('.') ? s.split('.')[1].length : 0);

const formatNumber = (n) => String(n);

/** Пробелы в разрядах + запятая как разделитель дробной части. */
function pretty(raw) {
  const [intPart, fracPart] = String(raw).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fracPart === undefined ? grouped : `${grouped},${fracPart}`;
}
