/* RINOVAIA — app instalable en PC, Mac, Android, iPhone y iPad.
   - Registra el service worker (sw.js).
   - Chrome, Edge, Samsung Internet y Opera (Windows, Mac, Linux, Android, ChromeOS): usa el diálogo
     nativo de instalación (beforeinstallprompt).
   - iPhone/iPad (Safari, Chrome, Edge), Safari en Mac, Firefox en Android y navegadores dentro de
     redes sociales: muestra los pasos exactos para ese dispositivo.
   - No aparece si la app ya está abierta instalada. El botón flotante se puede ocultar 14 días.
   - Cualquier elemento con [data-pwa-install] instala o muestra los pasos.
   - Expone window.RinovaPWA y el evento "rinova:pwa" para la página instalar.html. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { });
  }

  var ua = navigator.userAgent;
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  var isMac = !isIOS && /macintosh|mac os x/i.test(ua);
  var isWin = /windows/i.test(ua);
  var isInApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Snapchat|LinkedInApp|GSA\//i.test(ua) ||
    (isAndroid && /; wv\)/.test(ua)) || /WhatsApp/i.test(ua);
  var isFirefox = /firefox|fxios/i.test(ua);
  var isSamsung = /samsungbrowser/i.test(ua);
  var isEdge = /edg(e|a|ios)?\//i.test(ua);
  var isChromium = !!window.chrome || /crios|chrome|chromium/i.test(ua);
  var isSafari = /safari/i.test(ua) && !/chrome|crios|chromium|fxios|edg|opr|samsungbrowser|android/i.test(ua);
  var safariVer = (ua.match(/version\/(\d+)/i) || [])[1] | 0;

  var platform = isIOS ? (/ipad/i.test(ua) || navigator.maxTouchPoints > 1 && !/iphone/i.test(ua) ? 'ipad' : 'iphone')
    : isAndroid ? 'android' : isMac ? 'mac' : isWin ? 'windows' : 'pc';
  var browser = isInApp ? 'inapp' : isSamsung ? 'samsung' : isEdge ? 'edge' : isFirefox ? 'firefox'
    : isSafari ? 'safari' : isChromium ? 'chrome' : 'otro';

  function isStandalone() {
    return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches ||
      matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
  }

  var deferred = null;
  var installed = isStandalone();
  // Hay pasos manuales cuando el navegador no ofrece el diálogo nativo.
  var manual = isIOS || isInApp || (isMac && isSafari) || (isAndroid && isFirefox);
  // Firefox de escritorio y Safari en Mac anterior a Sonoma (17) no instalan apps web.
  var unsupported = !isIOS && !isAndroid && (isFirefox || (isSafari && safariVer && safariVer < 17));

  var api = window.RinovaPWA = {
    platform: platform, browser: browser,
    get installed() { return installed; },
    get canPrompt() { return !!deferred; },
    manual: manual, unsupported: unsupported,
    install: install, steps: steps
  };
  function emit() { document.dispatchEvent(new CustomEvent('rinova:pwa', { detail: api })); }

  /* ---------- Pasos por dispositivo ---------- */
  var SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var DOTS = '<b aria-label="menú">⋮</b>';
  function stepsHTML() {
    if (isInApp) return ['Estás dentro de una app (WhatsApp, Instagram, Facebook…). Toca el menú <b>⋯</b> o <b>⋮</b> y elige <b>Abrir en el navegador</b>' + (isIOS ? ' (Safari)' : ' (Chrome)') + '.',
      'Ya en el navegador, toca <b>Instalar app</b> otra vez.'];
    if (isIOS) return [
      (browser === 'safari' ? 'En Safari toca' : 'Toca') + ' el botón <b>Compartir</b> ' + SHARE + ' (en iOS 26 está dentro del menú <b>···</b>).',
      'Desliza y elige <b>Agregar a inicio</b>.',
      'Deja activado <b>Abrir como app web</b> y toca <b>Agregar</b>.',
      'Abre RINOVAIA desde el ícono en tu pantalla de inicio.'];
    if (isMac && isSafari) return [
      'En la barra de menús elige <b>Archivo → Agregar al Dock…</b> (o toca Compartir ' + SHARE + ' → <b>Agregar al Dock</b>).',
      'Confirma con <b>Agregar</b>.',
      'RINOVAIA queda en tu Dock y en Launchpad, en su propia ventana.'];
    if (isAndroid && isFirefox) return [
      'Toca el menú ' + DOTS + ' de Firefox.',
      'Elige <b>Instalar</b> o <b>Agregar a pantalla de inicio</b>.',
      'Abre RINOVAIA desde tu pantalla de inicio.'];
    if (isAndroid) return [
      'Toca el menú ' + DOTS + ' del navegador.',
      'Elige <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.',
      'Confirma con <b>Instalar</b>. La encontrarás junto a tus apps.'];
    if (unsupported) return [
      isFirefox ? 'Firefox en computadora no instala apps web.' : 'Esta versión de Safari no instala apps web (necesitas macOS Sonoma o posterior).',
      'Abre <b>www.rinovaia.com/instalar.html</b> en <b>Chrome</b> o <b>Edge</b>' + (isMac ? ' (o actualiza macOS y usa Safari)' : '') + '.',
      'Pulsa <b>Instalar app</b>.'];
    return [
      'Haz clic en el ícono de instalar <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="vertical-align:-3px"><path d="M4 5h16v11H4zM9 20h6M12 8v5M9.5 10.5L12 13l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg> a la derecha de la barra de direcciones.',
      isEdge ? 'O abre el menú <b>⋯ → Aplicaciones → Instalar este sitio como aplicación</b>.' : 'O abre el menú ' + DOTS + ' → <b>Transmitir, guardar y compartir → Instalar RINOVAIA</b>.',
      'Confirma con <b>Instalar</b>. RINOVAIA queda en ' + (isMac ? 'Launchpad y en tu Dock.' : 'el menú Inicio; puedes anclarla a la barra de tareas.')];
  }

  var sheet;
  function steps() {
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.className = 'card pwa-sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'false');
      sheet.setAttribute('aria-labelledby', 'pwaSheetT');
      document.body.appendChild(sheet);
      sheet.addEventListener('click', function (e) { if (e.target.closest('[data-pwa-close]')) hideSheet(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideSheet(); });
    }
    var onGuide = /instalar\.html$/.test(location.pathname);
    sheet.innerHTML = '<div class="pwa-sheet-h"><img src="assets/img/app/icon-96.png" alt="" width="44" height="44">' +
      '<div><b id="pwaSheetT">Instala RINOVAIA</b><small>' + label() + '</small></div></div>' +
      '<ol class="pwa-steps">' + stepsHTML().map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      '<div class="pwa-sheet-a"><button class="btn btn-ink btn-sm" type="button" data-pwa-close>Entendido</button>' +
      (onGuide ? '' : '<a class="btn btn-text btn-sm" href="instalar.html">Ver guía completa</a>') + '</div>';
    sheet.classList.add('show');
    var b = sheet.querySelector('[data-pwa-close]'); if (b) b.focus();
  }
  function hideSheet() { if (sheet) sheet.classList.remove('show'); }
  function label() {
    var p = { iphone: 'iPhone', ipad: 'iPad', android: 'Android', mac: 'Mac', windows: 'PC con Windows', pc: 'Computadora' }[platform];
    var n = { safari: 'Safari', chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', samsung: 'Samsung Internet', inapp: 'navegador de una app', otro: 'tu navegador' }[browser];
    return p + ' · ' + n;
  }
  api.label = label;

  function install() {
    if (installed) { toast('RINOVAIA ya está instalada en este dispositivo.'); return; }
    if (deferred) {
      var d = deferred; deferred = null;
      d.prompt();
      d.userChoice.then(function (r) { if (r && r.outcome === 'accepted') hideBtn(); emit(); }).catch(function () { emit(); });
    } else steps();
  }

  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add('on'); });
    setTimeout(function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 400); }, 3600);
  }

  /* ---------- Botón flotante ---------- */
  var KEY = 'rinova.pwa.hideUntil';
  var hidden = false;
  try { hidden = +localStorage.getItem(KEY) > Date.now(); } catch (e) { }
  var btn = document.querySelector('[data-pwa-install-btn]');
  function showBtn() { if (btn && !installed && !hidden) { btn.hidden = false; btn.classList.add('show'); } }
  function hideBtn() { if (btn) btn.classList.remove('show'); }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; showBtn(); emit(); });
  window.addEventListener('appinstalled', function () {
    installed = true; deferred = null; hideBtn(); hideSheet(); emit();
    toast('Listo. RINOVAIA quedó instalada como app.');
  });
  if (!installed && manual) setTimeout(showBtn, 2500);

  if (btn) btn.addEventListener('click', function (e) {
    if (e.target.closest('[data-pwa-dismiss]')) {
      e.stopPropagation(); hideBtn(); hidden = true;
      try { localStorage.setItem(KEY, String(Date.now() + 14 * 864e5)); } catch (er) { }
      return;
    }
    install();
  });
  document.addEventListener('click', function (e) { if (e.target.closest('[data-pwa-install]')) { e.preventDefault(); install(); } });

  // Dentro de la app instalada se ocultan los enlaces de "Instalar app".
  if (installed) document.documentElement.classList.add('is-app');
  matchMedia('(display-mode: standalone)').addEventListener && matchMedia('(display-mode: standalone)').addEventListener('change', function (m) {
    if (m.matches) { installed = true; document.documentElement.classList.add('is-app'); hideBtn(); emit(); }
  });
  emit();
})();
