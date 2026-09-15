/* ============================================================
   三火工作台 - Service Worker
   静态资源缓存策略:Network First(网络优先) + 离线回退缓存
   ============================================================ */
const CACHE_NAME = 'sanhuo-workbench-v10';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './assets/images/2.png',
  './assets/images/2_238.png',
  './assets/images/2_240.png',
  './assets/images/2_242.png',
  './assets/images/2_243_cropped.png',
  './assets/images/logo.png',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png'
];

/* 安装:预缓存核心资源 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

/* 激活:清理旧缓存 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* 请求:网络优先,离线回退缓存
   —— 云端更新后,已安装的 PWA 下次打开即可同步到最新版 */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        /* 成功响应:回写缓存,供离线使用 */
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req)) /* 离线:回退缓存 */
  );
});
