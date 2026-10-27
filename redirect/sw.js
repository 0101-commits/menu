// 옛 주소의 서비스워커를 걷어 낸다.
// 예전에 맛핀을 연 기기에는 옛 서비스워커가 앱 파일을 쥐고 있어서, 새 주소로 넘기는 index.html 대신
// 캐시해 둔 옛 앱을 계속 보여 준다. 브라우저가 sw.js 를 새로 받으면 이 파일이 들어와
// 맛핀 캐시를 지우고 스스로 등록을 풀고 열린 창을 다시 불러 넘김 페이지를 받게 한다.
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    await self.clients.claim();
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) {
      return k === 'matpin-data' || (k.indexOf('workbox-precache') === 0 && k.indexOf(self.registration.scope) >= 0);
    }).map(function (k) { return caches.delete(k); }));
    await self.registration.unregister();
    var wins = await self.clients.matchAll({ type: 'window' });
    wins.forEach(function (c) { c.navigate(c.url); });
  })());
});
