const CACHE = 'workout-log-v14';
const FILES = [
  '/workout-log/',
  '/workout-log/index.html',
  '/workout-log/style.css',
  '/workout-log/app.js',
  '/workout-log/firebase.js',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});