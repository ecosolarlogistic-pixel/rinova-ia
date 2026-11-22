/* RINOVAIA — service worker. Cada cambio de este archivo sube VERSION. */
const VERSION = 'rinovaia-v3';
const PRECACHE = [
  './', 'index.html', 'app.html', 'distribuidores.html', 'offline.html',
  'manifest.webmanifest', 'manifest-app.webmanifest',
  'assets/css/rinova.css', 'assets/js/facade.js', 'assets/js/estudio.js', 'assets/js/plataforma.js', 'pwa.js',
  'assets/fonts/montserrat.woff2', 'assets/fonts/inter.woff2',
  'assets/img/logo-mark.svg', 'assets/img/isotipo.svg', 'assets/img/hero-residencia.svg', 'assets/img/icon-192.png', 'assets/img/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API y Supabase siempre en vivo

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isPage) {
    // Páginas: red primero, caché si no hay internet
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('offline.html'))));
    return;
  }
  // Recursos estáticos: caché primero
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  })));
});
