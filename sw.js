/* RINOVAIA — service worker. Cada cambio de este archivo sube VERSION. */
const VERSION = 'rinovaia-v15';
// Debe coincidir con el ?v= de los HTML: la CDN de Hostinger guarda JS y CSS 30 días por URL.
const V = '?v=20261128';
const PRECACHE = [
  './', 'index.html', 'app.html', 'distribuidores.html', 'instalar.html', 'offline.html',
  'manifest.webmanifest', 'favicon.ico',
  'assets/css/rinova.css' + V, 'assets/js/facade.js' + V, 'assets/js/proyecto.js' + V, 'assets/js/planos.js' + V, 'assets/js/estudio.js' + V, 'assets/js/croquis.js' + V, 'assets/js/fachada.js' + V, 'assets/js/fachada-ui.js' + V, 'assets/js/render3d.js' + V, 'assets/js/recorrido.js' + V, 'assets/js/recorrido-ui.js' + V, 'assets/js/espacios.js' + V,
  'assets/js/plataforma.js' + V, 'pwa.js' + V,
  'assets/fonts/montserrat.woff2', 'assets/fonts/inter.woff2',
  'assets/img/logo-mark.svg', 'assets/img/isotipo.svg', 'assets/img/logo-circular.svg', 'assets/img/hero-residencia.svg',
  'assets/img/app/icon-96.png', 'assets/img/app/icon-192.png', 'assets/img/app/icon-512.png',
  'assets/img/app/maskable-192.png', 'assets/img/app/maskable-512.png', 'assets/img/app/apple-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// La página puede pedir activar ya la versión nueva.
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

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
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('offline.html'))));
    return;
  }
  // Recursos estáticos: caché primero
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  })));
});
