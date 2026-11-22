/* RINOVAIA — botón "Instalar app".
   Android / PC: evento beforeinstallprompt. iPhone, iPad y Safari en Mac: muestra los pasos.
   No aparece si ya se abre instalada. Se puede ocultar 14 días. Cualquier [data-pwa-install] también instala. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { });
  }
  var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  var KEY = 'rinova.pwa.hideUntil';
  try { if (+localStorage.getItem(KEY) > Date.now()) return; } catch (e) { }

  var btn = document.querySelector('[data-pwa-install-btn]');
  if (!btn) return;
  var deferred = null;
  var ua = navigator.userAgent;
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isSafariMac = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua) && !isIOS;

  function show() { btn.hidden = false; btn.classList.add('show'); }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; show(); });
  if (isIOS || isSafariMac) setTimeout(show, 2500);

  var sheet;
  function steps() {
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.className = 'card pwa-sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-label', 'Cómo instalar la app');
      sheet.innerHTML = '<b style="font-family:var(--display);font-size:18px">Instala RINOVAIA</b>' +
        '<ol style="margin:10px 0 14px;padding-left:20px;color:var(--muted);font-size:14px">' +
        (isIOS ? '<li>Toca el botón <b>Compartir</b> de Safari.</li><li>Elige <b>Agregar a inicio</b>.</li>'
               : '<li>En la barra de menús elige <b>Archivo → Agregar al Dock</b>.</li>') +
        '<li>Abre RINOVAIA desde tu pantalla de inicio.</li></ol>' +
        '<button class="btn btn-ink btn-sm" type="button">Entendido</button>';
      sheet.querySelector('button').addEventListener('click', function () { sheet.classList.remove('show'); });
      document.body.appendChild(sheet);
    }
    sheet.classList.add('show');
  }
  function install() {
    if (deferred) { deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; btn.classList.remove('show'); }); }
    else steps();
  }
  btn.addEventListener('click', function (e) {
    if (e.target.closest('[data-pwa-dismiss]')) {
      e.stopPropagation(); btn.classList.remove('show');
      try { localStorage.setItem(KEY, String(Date.now() + 14 * 864e5)); } catch (er) { }
      return;
    }
    install();
  });
  document.addEventListener('click', function (e) { if (e.target.closest('[data-pwa-install]')) { e.preventDefault(); install(); } });
})();
