/* sw.js - lưu file app để chạy khi mất mạng. Đổi file nào thì tăng số CACHE. */
var CACHE = 'rubik-v9';
var FILES = ['./', 'index.html', 'style.css', 'app.js', 'cube.js', 'solver.js', 'lessons.js', 'store.js', 'vision.js', 'learn.js', 'scan.js', 'view3d.js', 'lib/three.min.js',
  'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // ưu tiên bản mới trên mạng (để cập nhật file là thấy ngay), mất mạng thì dùng bản đã lưu
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone();
    if (r.ok) caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return r;
  }).catch(function () { return caches.match(e.request); }));
});
