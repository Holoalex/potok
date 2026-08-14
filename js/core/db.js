// IndexedDB: промисы вместо событий. Никакой бизнес-логики.

const DB_NAME = globalThis.__POTOK_DB_NAME__ || 'potok';
const DB_VERSION = 1;

export const STORES = {
  accountGroups: 'accountGroups',
  accounts: 'accounts',
  categories: 'categories',
  payees: 'payees',
  tags: 'tags',
  places: 'places',
  transactions: 'transactions',
  budgets: 'budgets',
  settings: 'settings',
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of Object.values(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const keyPath = name === STORES.settings ? 'key' : 'id';
        const store = db.createObjectStore(name, { keyPath });
        if (name === STORES.transactions) {
          store.createIndex('at', 'at');
          store.createIndex('accountId', 'accountId');
          store.createIndex('categoryId', 'categoryId');
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('База открыта в другой вкладке'));
  });

  return dbPromise;
}

function run(names, mode, fn) {
  const list = Array.isArray(names) ? names : [names];
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(list, mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Транзакция прервана'));

        const stores = Array.isArray(names)
          ? Object.fromEntries(list.map((n) => [n, tx.objectStore(n)]))
          : tx.objectStore(names);

        const value = fn(stores, tx);
        if (value && typeof value.then === 'function') {
          value.then((v) => { result = v; }, reject);
        } else {
          result = value;
        }
      })
  );
}

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const getAll = (store) => run(store, 'readonly', (s) => request(s.getAll()));

export const put = (store, value) => run(store, 'readwrite', (s) => { s.put(value); return value; });

export const putMany = (store, values) =>
  run(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); return values; });

export const remove = (store, key) => run(store, 'readwrite', (s) => { s.delete(key); });

export const removeMany = (store, keys) =>
  run(store, 'readwrite', (s) => { keys.forEach((k) => s.delete(k)); });

export const clearAll = () =>
  run(Object.values(STORES), 'readwrite', (stores) => {
    Object.values(stores).forEach((s) => s.clear());
  });

/** Полная замена содержимого — импорт и восстановление из копии. */
export const replaceAll = (data) =>
  run(Object.values(STORES), 'readwrite', (stores) => {
    for (const [name, rows] of Object.entries(data)) {
      const store = stores[name];
      if (!store) continue;
      store.clear();
      rows.forEach((row) => store.put(row));
    }
  });

/** Массовая запись одним заходом — импорт нескольких тысяч операций. */
export const writeBulk = (data) =>
  run(Object.values(STORES), 'readwrite', (stores) => {
    for (const [name, rows] of Object.entries(data)) {
      const store = stores[name];
      if (!store) continue;
      rows.forEach((row) => store.put(row));
    }
  });
