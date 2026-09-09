/* Service Worker — ワケワケ本体をキャッシュして、オフラインでも開けるようにする。
   タスクは localStorage に入っているので、ここでは扱わない。

   スコープは /wake/ 。同じドメインのルートにも別アプリの Service Worker が
   いるが、より内側のスコープを持つこちらが /wake/ 配下を受け持つ。 */

var CACHE = 'wakewake-v1';

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/model.js',
  './js/ui.js',
  './js/task.js',
  './js/now.js',
  './js/due.js',
  './js/tree.js',
  './js/calendar.js',
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
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
