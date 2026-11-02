const CACHE = 'hong-er-shell-v2';
const SHELL = new URL('./index.html', self.registration.scope).href;
const FILES = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './assets/lucide.min.js', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(path => new Request(path, {cache: 'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('hong-er-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request.mode === 'navigate' ? SHELL : event.request, {ignoreSearch: true})).then(cached => cached || fetch(event.request)));
});
