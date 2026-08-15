// Service worker: приложение целиком живёт в кэше и работает офлайн.

const CACHE = 'potok-v1';

// На localhost правки должны быть видны сразу, иначе кэш отдаёт вчерашний код.
// В бою наоборот: сначала кэш — приложение открывается мгновенно и без сети.
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/app.css',
  './js/app.js',
  './js/core/calc.js',
  './js/core/category-icons.js',
  './js/core/db.js',
  './js/core/import-moneyflow.js',
  './js/core/money.js',
  './js/core/period.js',
  './js/core/schema.js',
  './js/core/store.js',
  './js/ui/accounts.js',
  './js/ui/charts.js',
  './js/ui/dom.js',
  './js/ui/editors.js',
  './js/ui/entry.js',
  './js/ui/filter.js',
  './js/ui/icons.js',
  './js/ui/operations.js',
  './js/ui/pickers.js',
  './js/ui/plan.js',
  './js/ui/report.js',
  './js/ui/screen-params.js',
  './js/ui/settings.js',
  './js/ui/theme.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // fetch + put, а не add: add падает с «Entry already exists», если к тому же
    // хранилищу кто-то обращается параллельно, и кэш молча остаётся пустым.
    // put перезаписывает и такого не устраивает. Строго по одному: addAll
    // роняет всю пачку из-за одного недоступного файла.
    for (const url of SHELL) {
      try {
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (response.ok) await cache.put(url, response);
        else console.warn('[sw] пропущен', url, response.status);
      } catch (error) {
        console.warn('[sw] не удалось закэшировать', url, error);
      }
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => cached || caches.match('./index.html'));

      return DEV ? network : cached || network;
    })
  );
});
