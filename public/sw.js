/**
 * StellaFlix Service Worker
 * 提供离线缓存和快速加载
 */

const CACHE_NAME = 'stellaflix-v1';
const STATIC_CACHE = 'stellaflix-static-v1';
const DYNAMIC_CACHE = 'stellaflix-dynamic-v1';

// 预缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/movies',
  '/documentaries',
  '/bilibili',
  '/manifest.json',
];

// 安装事件 - 预缓存
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截 - 网络优先，失败时使用缓存
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过 API 请求和非 GET 请求
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // 成功时缓存响应
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 网络失败时使用缓存
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // 如果是页面请求，返回离线页面
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/');
          }
          return new Response('离线状态', { status: 503 });
        });
      })
  );
});

// 推送通知
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {
    title: 'StellaFlix',
    body: '有新内容更新了！',
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: { url: '/' },
    })
  );
});

// 通知点击
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
