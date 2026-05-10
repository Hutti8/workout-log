const CACHE = 'workout-log-v4';
const FILES = [
  '/workout-log/',
  '/workout-log/index.html',
  '/workout-log/style.css',
  '/workout-log/app.js',
  '/workout-log/firebase.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});