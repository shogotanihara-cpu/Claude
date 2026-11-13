/* Service Worker — ツカイミチ本体をキャッシュして、オフラインでも開けるようにする。
   明細は localStorage に入っているので、ここでは扱わない。

   このファイルは /spend/ の中に置く。スコープが /spend/ に閉じるので、
   隣のアプリのリクエストには口を出さない。 */

var CACHE = 'spend-v1';

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/model.js',
  './js/ui.js',
  './js/csv.js',
  './js/cats.js',
  './js/entry.js',
  './js/month.js',
  './js/sort.js',
  './js/list.js',
  './js/events.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* network-first: 更新を取りに行き、オフラインならキャッシュを返す。
   { cache: 'no-store' } を明示しないと、GitHub Pages 側の Cache-Control に従って
   ブラウザの通常のHTTPキャッシュから返り、「ネットワーク優先」のつもりでも
   古い内容を掴み続けてしまうことがある。 */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then(function (res) {
      // cache.put は 404 も保存してしまう。正常な応答だけを残す
      if (res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
