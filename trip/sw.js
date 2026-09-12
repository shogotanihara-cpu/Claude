/* Service Worker — しおり本体をキャッシュして、オフラインでも開けるようにする。
   旅程は localStorage に入っているので、ここでは扱わない。

   スコープは /trip/ 。同じドメインには /log/ と /wake/ の Service Worker も
   いるが、それぞれのフォルダに閉じているので互いのリクエストは拾わない。

   ASSETS に実在しないファイルが1つでも混じると addAll が失敗し、
   オフラインが丸ごと効かなくなる。ファイルを足したらここも必ず足すこと。 */

var CACHE = 'shiori-v2';

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/ui.js',
  './js/model.js',
  './js/item.js',
  './js/plan.js',
  './js/gear.js',
  './js/trips.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
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
   古い内容を掴み続けてしまう。

   cache.put は 404 でも保存してしまうので、2xx のときだけ書き戻す。
   消えたURLを取りに行って、正常なキャッシュを 404 で上書きしないため。 */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then(function (res) {
      if (res && res.ok) {
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
