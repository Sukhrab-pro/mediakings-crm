const CACHE = 'mk-crm-v57';
const ASSETS = [
  './',
  './index.html',
  './config.js',
  './airtable.js',
  './finance.js',
  './leads.js',
  './analytics.js',
  './settings.js',
  './app.js',
  './style.css',
  './sw.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      return Promise.all(
        ASSETS.map(url => {
          // Force network fetch to bypass browser HTTP/CDN cache
          const requestUrl = url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
          return fetch(requestUrl, { cache: 'reload' }).then(response => {
            if (!response.ok) throw new Error(`Request failed for ${url}`);
            return c.put(url, response);
          }).catch(err => {
            console.error('Failed to cache with reload:', url, err);
            // Fallback to standard request if reload fails
            return c.add(url);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e =>
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)))
);
