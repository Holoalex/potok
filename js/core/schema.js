// Сущности и стартовые справочники.
// Структура повторяет Money Flow: два уровня категорий, счета в группах,
// цели как счета, контрагенты, метки и места отдельными справочниками.

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Типы операций. refund — возврат средств: деньги пришли, но категория расходная,
 * и в отчётах он вычитается из расхода, а не добавляется к доходу.
 *
 * Корректировка остатка — не отдельный тип, а флаг isAdjustment на обычном
 * доходе или расходе. Так настройка «Корректировки как доходы и расходы»
 * сводится к фильтру, а не к отдельной ветке в расчёте баланса.
 */
export const TX_TYPES = ['expense', 'income', 'refund', 'transfer'];

export const ACCOUNT_KINDS = ['regular', 'goal'];

// --------------------------------------------------------------- фабрики

export const makeAccountGroup = (data = {}) => ({
  id: data.id || uid(),
  name: data.name || '',
  order: data.order ?? 0,
  collapsed: data.collapsed ?? false,
});

export const makeAccount = (data = {}) => ({
  id: data.id || uid(),
  groupId: data.groupId || null,
  name: data.name || '',
  icon: data.icon || 'wallet',
  color: data.color || '#7737e6',
  currency: data.currency || 'RUB',
  initialBalanceMinor: data.initialBalanceMinor ?? 0,
  excludeFromTotal: data.excludeFromTotal ?? false,
  kind: data.kind || 'regular',
  // Цель: сколько копим и к какой дате. Только для kind === 'goal'.
  goalTargetMinor: data.goalTargetMinor ?? null,
  goalDate: data.goalDate ?? null,
  order: data.order ?? 0,
  archived: data.archived ?? false,
});

export const makeCategory = (data = {}) => ({
  id: data.id || uid(),
  parentId: data.parentId ?? null,   // два уровня, глубже оригинал не идёт
  name: data.name || '',
  icon: data.icon || 'tag',
  color: data.color || '#8b8b8b',
  type: data.type || 'expense',      // expense | income
  order: data.order ?? 0,
  archived: data.archived ?? false,
});

export const makePayee = (data = {}) => ({
  id: data.id || uid(),
  name: data.name || '',
  defaultCategoryId: data.defaultCategoryId ?? null,
  order: data.order ?? 0,
});

export const makeTag = (data = {}) => ({
  id: data.id || uid(),
  name: data.name || '',
  color: data.color || '#7737e6',
  order: data.order ?? 0,
});

export const makePlace = (data = {}) => ({
  id: data.id || uid(),
  name: data.name || '',
});

/**
 * Операция. Суммы всегда положительные, направление задаёт type.
 * У перевода заполнена принимающая сторона — обе фактические суммы,
 * как в оригинале: курс не хранится, он выводится из них.
 */
export const makeTransaction = (data = {}) => ({
  id: data.id || uid(),
  type: data.type || 'expense',
  at: data.at ?? Date.now(),                 // дата и время, миллисекунды
  accountId: data.accountId ?? null,
  amountMinor: Math.abs(Math.round(data.amountMinor ?? 0)),
  currency: data.currency || 'RUB',
  toAccountId: data.toAccountId ?? null,
  toAmountMinor: data.toAmountMinor == null ? null : Math.abs(Math.round(data.toAmountMinor)),
  toCurrency: data.toCurrency ?? null,
  categoryId: data.categoryId ?? null,
  payeeId: data.payeeId ?? null,
  tagIds: data.tagIds ? [...data.tagIds] : [],
  placeId: data.placeId ?? null,
  note: (data.note || '').trim(),
  pinned: data.pinned ?? false,
  isAdjustment: data.isAdjustment ?? false,
  createdAt: data.createdAt ?? Date.now(),
  updatedAt: data.updatedAt ?? Date.now(),
});

/**
 * Бюджет повторяющийся, а не привязанный к одному месяцу: в оригинале
 * у него «Период повтора», и одни и те же лимиты видны на всех вкладках месяцев.
 */
export const makeBudget = (data = {}) => ({
  id: data.id || uid(),
  name: data.name || '',
  period: data.period || 'month',            // month | week | year
  scope: data.scope || 'all',                // all | categories | tags
  categoryIds: data.categoryIds ? [...data.categoryIds] : [],
  tagIds: data.tagIds ? [...data.tagIds] : [],
  accountIds: data.accountIds ? [...data.accountIds] : [],   // пусто — все счета
  limitMinor: data.limitMinor ?? 0,
  order: data.order ?? 0,
});

// ------------------------------------------------------------- настройки

export const DEFAULT_SETTINGS = {
  baseCurrency: 'RUB',
  favoriteCurrencies: ['RUB', 'USD', 'EUR'],
  rates: { RUB: 1 },                 // сколько базовой стоит одна единица валюты
  theme: 'system',                   // system | light | dark | black | pureBlack
  monthStartDay: 1,
  transfersAsIncomeExpense: false,   // «Переводы как доходы и расходы»
  adjustmentsAsIncomeExpense: false, // «Корректировки как доходы и расходы»
  mergeSmallSlices: true,            // доли меньше 3 % -> «Остальное»
  reportSort: 'amount',              // amount | standard
  showBalance: true,
  showChart: true,
  addButtonSide: 'right',
  roundTotals: false,
  schemaVersion: 1,
};

// ------------------------------------------------- стартовые справочники

export const DEFAULT_GROUPS = ['Наличные', 'Банк. карты', 'Копилки (Цели)'];

/**
 * Дерево категорий расходов: родитель -> листья.
 * Собрано по экрану фильтра и отчётам оригинала. Часть связей выведена
 * по смыслу — импорт складывает нераспознанные листья в «Другое»
 * и отдельно о них сообщает, чтобы дерево можно было поправить.
 */
export const EXPENSE_TREE = {
  'Продукты питания': ['Продукты питания', 'Алкоголь', 'Мясо', 'Сладости', 'Ягоды и фрукты'],
  'Еда вне дома': ['Еда вне дома', 'Кофейни', 'Фастфуд', 'Рестораны', 'Клубы и бары'],
  'Дом': ['Арендная плата', 'Квартплата', 'Коммунальные платежи', 'Мебель', 'Ремонт',
          'Посуда', 'Товары для дома', 'Бытовая химия', 'Промтовары'],
  'Транспорт': ['Транспорт', 'Такси', 'Общественный транспорт', 'Каршеринг', 'Аренда транспорта'],
  'Здоровье': ['Здоровье', 'Медицинские услуги', 'Медикаменты', 'Спорт'],
  'Одежда и обувь': ['Одежда', 'Обувь', 'Нижнее бельё', 'Аксессуары'],
  'Развлечения': ['Развлечения', 'Кино, театры и концерты', 'Музыка и видео', 'Книги и пресса',
                  'Игры и программы', 'Хобби и увлечения', 'Выставки и музеи', 'Активный отдых'],
  'Путешествия': ['Путешествия', 'Отель', 'Билеты', 'Сувениры', 'Туристические расходы'],
  'Другое': ['Другое', 'Подарки', 'Благотворительность', 'Государство', 'Форсмажор',
             'Необдуманные траты', 'Возврат долга'],
};

export const INCOME_TREE = {
  'Зарплата': ['Зарплата'],
  'Подработка': ['Подработка'],
  'Приятные находки': ['Приятные находки'],
  'Другое': ['Другое', 'Проценты по счетам'],
};

/** Палитра категорий, снятая с диаграмм оригинала. */
export const CATEGORY_COLORS = [
  '#1793df', '#30a044', '#1cb786', '#fd492d', '#fc1037', '#f45f8e',
  '#b15db6', '#ffc463', '#d8a67b', '#c5bfa1', '#7737e6', '#8b8b8b',
];
