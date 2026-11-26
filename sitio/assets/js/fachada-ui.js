/* RINOVAIA — Planos: vistas "Mejorar fachada" y "Render 3D 360°".
   Lee y guarda la configuración de fachada en el proyecto (p.fx) y se sincroniza con cada cambio
   del Estudio (evento rinova:change). */
(function () {
  'use strict';
  var E = window.RinovaEstudio, FX = window.RinovaFachada, R3 = window.RinovaRender3D, F = window.RinovaFacade;
  if (!E || !FX || !document.getElementById('pvTabs')) return;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = E.esc;
  var view = 'laminas', why = [], ctl = null, ctlBusy = false;

  function proj() { return E.project(); }
  function res() { return E.result(); }
  function fx() { var p = proj(); p.fx = FX.normalize(p.fx, p); return p.fx; }
  function commit() { E.refresh(); }

  /* ---------- Sub-vistas ---------- */
  function showPv(v) {
    view = v;
    $$('#pvTabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.pv === v); });
    $$('#p-planos .pv').forEach(function (el) { el.hidden = el.id !== 'pv-' + v; });
    if (v === 'fachada') renderFx();
    if (v === 'r3d') open3d();
    try { sessionStorage.setItem('rinova.pv', v); } catch (e) { }
    document.dispatchEvent(new CustomEvent('rinova:pv', { detail: v }));
  }
  $('#pvTabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-pv]'); if (b) showPv(b.dataset.pv); });
  $$('[data-pv-go]').forEach(function (b) { b.addEventListener('click', function () { showPv(b.dataset.pvGo); $('#pvTabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });

  /* ---------- Formulario de fachada ---------- */
  $('#fxStyles').innerHTML = Object.keys(FX.ESTILOS).map(function (k) { var s = FX.ESTILOS[k]; return '<button type="button" data-v="' + k + '" aria-pressed="false"><b>' + esc(s.n) + '</b><small>' + esc(s.d) + '</small></button>'; }).join('');
  function opt(keys, src) { return keys.map(function (k) { return '<option value="' + k + '">' + esc(src[k].n) + '</option>'; }).join(''); }
  $('#fxMat').innerHTML = opt(Object.keys(FX.MATERIALES), FX.MATERIALES);
  $('#fxAcc').innerHTML = opt(FX.ACENTOS, FX.MATERIALES);
  $('#fxCan').innerHTML = opt(Object.keys(FX.CANCEL), FX.CANCEL);
  $('#fxOpts').innerHTML = Object.keys(FX.OPCIONES).map(function (k) { var o = FX.OPCIONES[k]; return '<label class="fx-opt"><input type="checkbox" data-o="' + k + '"><span><b>' + esc(o.n) + '</b><small>' + esc(o.d) + '</small></span></label>'; }).join('');

  function syncFxForm() {
    var f = fx();
    $$('#fxStyles button').forEach(function (b) { b.setAttribute('aria-pressed', f.on && b.dataset.v === f.estilo); if (b.dataset.v === 'referencia') b.hidden = !f.ref; });
    $('#fxMat').value = f.material; $('#fxAcc').value = f.acento; $('#fxCan').value = f.cancel;
    $$('#fxOpts input').forEach(function (c) { c.checked = !!f.opts[c.dataset.o]; });
    $$('.fx-hora').forEach(function (g) { $$('button', g).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === f.hora); }); });
  }
  function touch(mut, msg) { var f = fx(); if (!f.on) { f.on = true; } mut(f); why = []; commit(); if (msg) E.toast(msg); }
  $('#fxStyles').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]'); if (!b) return;
    touch(function (f) { var pr = FX.preset(b.dataset.v); if (b.dataset.v === 'referencia' && !f.ref) return; f.estilo = pr.estilo; f.material = pr.material; f.acento = pr.acento; f.cancel = pr.cancel; f.opts = pr.opts; }, 'Estilo ' + FX.ESTILOS[b.dataset.v].n.toLowerCase() + ' aplicado a la fachada');
  });
  $('#fxMat').addEventListener('change', function (e) { touch(function (f) { f.material = e.target.value; }); });
  $('#fxAcc').addEventListener('change', function (e) { touch(function (f) { f.acento = e.target.value; }); });
  $('#fxCan').addEventListener('change', function (e) { touch(function (f) { f.cancel = e.target.value; }); });
  $('#fxOpts').addEventListener('change', function (e) { var c = e.target.closest('input[data-o]'); if (c) touch(function (f) { f.opts[c.dataset.o] = c.checked; }); });
  $$('.fx-hora').forEach(function (g) {
    g.addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b) return; fx().hora = b.dataset.v; syncFxForm(); E.refresh(); });
  });
  /* Con una fachada subida, «Mejorar fachada» la conserva y le suma mejoras (no la cambia por un estilo prefijado). */
  function improveRef() {
    var p = proj(), r = res(), f = fx(), R = Object.assign({}, f.ref), hot = r.city.lat < 21.5, extra = [];
    f.on = true; f.estilo = 'referencia';
    if (!f.opts.jardineras) { f.opts.jardineras = true; extra.push('Jardineras al pie de la fachada: suavizan el muro y separan la casa de la banqueta.'); }
    if (!f.opts.iluminacion) { f.opts.iluminacion = true; extra.push('Iluminación arquitectónica cálida para que la fachada luzca de noche.'); }
    if (!R.losaVolada && !R.porche) { R.losaVolada = true; extra.push('Losa volada sobre el acceso con luminarias empotradas: protege la entrada de la lluvia y la marca.'); }
    if (p.floors > 1 && R.balcon === 'ninguno') { R.balcon = R.cubierta === 'teja' ? 'herreria' : 'vidrio'; R.balconLado = R.puertaLado; extra.push('Balcón en planta alta sobre el acceso: gana terraza y vista sin cerrar la fachada.'); }
    if (R.ventanas === 'lisa' && R.cubierta !== 'teja') { R.ventanas = 'cuadricula'; R.travesano = true; extra.push('Ventanales con retícula y travesaño alto: más luz y una fachada más ordenada.'); }
    if (hot && !f.opts.celosia) { f.opts.celosia = true; extra.push('Celosía de parteluces en clima cálido (' + r.city.name + '): baja la ganancia solar y el gasto de aire acondicionado.'); }
    if (p.floors >= 2 && R.cubierta === 'plano' && !f.opts.pergola) { f.opts.pergola = true; extra.push('Pérgola en azotea para convertirla en terraza habitable.'); }
    f.ref = FX.normRef(R); f.opts.volado = f.ref.losaVolada; f.opts.balcones = f.ref.balcon !== 'ninguno';
    why = refWhy(f.ref).concat(extra.length ? extra : ['Tu fachada ya tiene los elementos que se proponen; se conserva tal cual.']);
    commit();
    E.toast(extra.length ? 'Tu fachada se mejoró con ' + extra.length + ' cambio' + (extra.length > 1 ? 's' : '') + ' sin perder su estilo' : 'Tu fachada ya tiene las mejoras propuestas');
  }
  $('#fxAuto').addEventListener('click', function () {
    if (fx().ref && foto) { improveRef(); return; }
    var sg = FX.suggest(proj(), res()); proj().fx = sg.fx; why = sg.why; commit();
    E.toast('Fachada mejorada: ' + FX.ESTILOS[sg.fx.estilo].n.toLowerCase() + ' con ' + Object.keys(sg.fx.opts).filter(function (k) { return sg.fx.opts[k]; }).length + ' elementos');
  });
  $('#fxCompare').addEventListener('change', renderFx);
  $('#fxCmp').addEventListener('input', function () { $('#fxBefore').style.clipPath = 'inset(0 ' + (100 - this.value) + '% 0 0)'; $('#fxStage').style.setProperty('--cmp', this.value + '%'); });

  /* ---------- Fachada existente subida (foto o PDF) ---------- */
  var FKEY = 'rinova.estudio.v2.fachadaFoto', foto = null;
  try { foto = JSON.parse(localStorage.getItem(FKEY) || 'null'); } catch (e) { }
  window.RinovaFachadaFoto = function () { return foto; };
  function saveFoto(v) {
    foto = v;
    try { if (v) localStorage.setItem(FKEY, JSON.stringify(v)); else localStorage.removeItem(FKEY); }
    catch (e) { // sin espacio: se guarda una versión más ligera
      if (v && v.img) { try { v.img = v.thumb; localStorage.setItem(FKEY, JSON.stringify(v)); } catch (e2) { } }
    }
  }
  function readAs(file, how) { return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = ko; r[how](file); }); }
  function loadImg(src) { return new Promise(function (ok, ko) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ko(new Error('img')); }; i.src = src; }); }
  function toCanvas(img, max) { var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); return c; }
  var pdfjs = null;
  function pdfPage(buf) {
    if (!pdfjs) pdfjs = new Promise(function (ok, ko) {
      if (window.pdfjsLib) { ok(window.pdfjsLib); return; }
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = function () { pdfjs = null; ko(new Error('pdf')); }; document.head.appendChild(s);
    });
    return pdfjs.then(function (lib) { return lib.getDocument({ data: buf }).promise; }).then(function (doc) { return doc.getPage(1); }).then(function (page) {
      var v0 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(3, 1800 / Math.max(v0.width, v0.height)) });
      var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      return page.render({ canvasContext: g, viewport: vp }).promise.then(function () { return c; });
    });
  }
  /* Lectura en el navegador de la fachada de referencia: color real del muro, de la cancelería y del acceso,
     lado de la puerta (zona baja más oscura), porche remetido, teja y proporción de vidrio. RINOVAIA AI la afina. */
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function rgb2hex(c) { return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function readFacade(canvas) {
    var k = Math.min(1, 200 / Math.max(canvas.width, canvas.height)), w = Math.max(8, Math.round(canvas.width * k)), h = Math.max(8, Math.round(canvas.height * k));
    var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'); g.drawImage(canvas, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h).data, bins = {}, dark = 0, tileTop = 0, tileMid = 0, total = 0, x, y, i;
    var dk = [0, 0, 0, 0], skip = new Uint8Array(w * h);
    function px(x, y) { var i = (y * w + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B); return { R: R, G: G, B: B, L: (mx + mn) / 2, sat: mx - mn }; }
    // 1.ª pasada: color del muro, cancelería (lo más oscuro), teja (rojo arriba y no a media altura)
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var q = px(x, y);
      if ((q.B > q.R + 18 && q.B > q.G && q.L > 120 && y < h * 0.5) || (q.G > q.R + 12 && q.G > q.B + 8)) { skip[y * w + x] = 1; continue; } // cielo, vegetación
      total++;
      if (q.R > 120 && q.G < q.R * 0.62 && q.G > q.B && q.sat > 60) { if (y < h * 0.3) tileTop++; else if (y > h * 0.45 && y < h * 0.8) tileMid++; }
      if (q.L < 60) { dark++; dk[0] += q.R; dk[1] += q.G; dk[2] += q.B; dk[3]++; continue; }
      if (q.L < 110) continue;
      var key = (q.R >> 4) + ',' + (q.G >> 4) + ',' + (q.B >> 4);
      bins[key] = (bins[key] || 0) + 1;
    }
    var bn = 0; Object.keys(bins).forEach(function (kk) { if (bins[kk] > bn) bn = bins[kk]; });
    // color del muro: promedio de los tonos dominantes (los que tienen al menos 30 % del más frecuente)
    var acc = [0, 0, 0, 0];
    Object.keys(bins).forEach(function (kk) { if (bins[kk] < bn * 0.3) return; var q = kk.split(','); for (var j = 0; j < 3; j++) acc[j] += ((+q[j] << 4) + 8) * bins[kk]; acc[3] += bins[kk]; });
    var raw = acc[3] ? acc.slice(0, 3).map(function (v) { return v / acc[3]; }) : [236, 236, 234], rgb = raw.slice();
    // un muro claro y casi sin color es blanco a la sombra: se neutraliza el tinte azul del cielo y se aclara
    var lum = (rgb[0] + rgb[1] + rgb[2]) / 3, sat0 = Math.max.apply(null, rgb) - Math.min.apply(null, rgb);
    if (sat0 < 40 && lum > 170) rgb = [Math.min(246, lum + 30), Math.min(245, lum + 29), Math.min(241, lum + 25)];
    var mat = 'aplanado', md = 1e9;
    ['concreto', 'aplanado', 'piedra', 'ladrillo', 'cantera', 'travertino', 'ocre', 'grafito', 'madera'].forEach(function (m) {
      var q = hex2rgb(FX.MATERIALES[m].c), dd = Math.pow(q[0] - rgb[0], 2) + Math.pow(q[1] - rgb[1], 2) + Math.pow(q[2] - rgb[2], 2);
      if (dd < md) { md = dd; mat = m; }
    });
    if (lum > 190 && sat0 < 40) mat = 'aplanado';
    if (raw[0] > 110 && raw[1] < raw[0] * 0.72 && raw[2] > raw[1] * 0.75 && raw[2] <= raw[1]) mat = 'ladrillo';
    var teja = total ? tileTop / total > 0.02 && tileMid < tileTop * 0.5 : false;
    // 2.ª pasada: lo que es claramente más oscuro que el muro (vanos, puerta, volúmenes de acento)
    var wl = (raw[0] + raw[1] + raw[2]) / 3;
    function isDark(x, y) {
      if (skip[y * w + x]) return false; var q = px(x, y);
      var dd = Math.sqrt(Math.pow(q.R - raw[0], 2) + Math.pow(q.G - raw[1], 2) + Math.pow(q.B - raw[2], 2));
      return dd > 70 && q.L < wl - 35;
    }
    function isWall(x, y) { var q = px(x, y); return Math.abs(q.R - raw[0]) + Math.abs(q.G - raw[1]) + Math.abs(q.B - raw[2]) < 55; }
    // Por columna: oscuro arriba y abajo, y de un solo tono (un volumen de acento; un porche o un ventanal mezclan tonos)
    var low = [], col = [], bld = [], y0 = Math.round(h * 0.15), y1 = Math.round(h * 0.88), ym = Math.round(h * 0.5);
    for (x = 0; x < w; x++) {
      var nt = 0, mt = 0, nb = 0, mb = 0, b = 0, s1 = 0, s2 = 0;
      for (y = y0; y < y1; y++) {
        if (skip[y * w + x]) continue;
        var top = y < ym; if (top) mt++; else mb++;
        if (isDark(x, y)) { if (top) nt++; else nb++; b++; var lq = px(x, y).L; s1 += lq; s2 += lq * lq; } else if (isWall(x, y)) b++;
      }
      var l1 = 0, l2 = 0, ln = 0;
      for (y = ym; y < y1; y++) if (!skip[y * w + x] && isDark(x, y)) { var lv = px(x, y).L; l1 += lv; l2 += lv * lv; ln++; }
      low.push(mb > (y1 - ym) * 0.4 && ln > 1 ? { f: nb / mb, sd: Math.sqrt(Math.max(0, l2 / ln - Math.pow(l1 / ln, 2))) } : { f: 0, sd: 99 });
      var nd = nt + nb, sd = nd > 1 ? Math.sqrt(Math.max(0, s2 / nd - Math.pow(s1 / nd, 2))) : 99;
      col.push(mt > (ym - y0) * 0.4 && mb > (y1 - ym) * 0.4 && sd < 28 ? Math.min(nt / mt, nb / mb) : 0); bld.push(b / (y1 - y0));
    }
    // Volumen de acento: franja oscura continua desde un borde del edificio
    function edgeRun(from, step) { var n = 0, sum = [0, 0, 0, 0]; for (x = from; x >= 0 && x < w; x += step) { if (col[x] < 0.85) break; n++; for (y = y0; y < y1; y++) if (isDark(x, y)) { var q = px(x, y); sum[0] += q.R; sum[1] += q.G; sum[2] += q.B; sum[3]++; } } return { n: n, c: sum[3] ? rgb2hex(sum.slice(0, 3).map(function (v) { return v / sum[3]; })) : null }; }
    function firstCol(from, step) { for (x = from; x >= 0 && x < w; x += step) if (bld[x] > 0.55) return x; return from; }
    var aL = edgeRun(firstCol(0, 1), 1), aR = edgeRun(firstCol(w - 1, -1), -1), acento = null, acentoLado = 'ninguno', acentoAncho = 0.35, ax0 = -1, ax1 = -1;
    var minA = w * 0.12, maxA = w * 0.6;
    if (aL.n > minA && aL.n < maxA && aL.n >= aR.n) { acento = aL.c; acentoLado = 'izq'; acentoAncho = aL.n / w; ax0 = 0; ax1 = firstCol(0, 1) + aL.n; }
    else if (aR.n > minA && aR.n < maxA) { acento = aR.c; acentoLado = 'der'; acentoAncho = aR.n / w; ax0 = firstCol(w - 1, -1) - aR.n; ax1 = w; }
    // Puerta: zona baja (donde los vanos ya terminaron) más oscura, fuera del acento
    var th = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    // pie del edificio: última fila donde todavía se ve muro (abajo empiezan banqueta, pasto o calle)
    var yb = Math.round(h * 0.95);
    for (y = h - 1; y > h * 0.5; y--) { var nw = 0; for (x = 0; x < w; x++) if (!skip[y * w + x] && isWall(x, y)) nw++; if (nw > w * 0.12) { yb = y; break; } }
    for (y = Math.max(0, yb - Math.round(h * 0.09)); y <= yb; y++) for (x = 0; x < w; x++) {
      if (x >= ax0 && x < ax1) continue; if (skip[y * w + x]) continue;
      var t = Math.min(2, Math.floor(x / w * 3)); th[t][1]++;
      if (isDark(x, y)) { var q = px(x, y); th[t][0]++; th[t][2] += q.R; th[t][3] += q.G; th[t][4] += q.B; }
    }
    var fr = th.map(function (q) { return q[1] ? q[0] / q[1] : 0; }), side = fr.indexOf(Math.max.apply(null, fr));
    // Puerta = franja baja oscura y opaca (tono parejo); los ventanales con interior visible varían más de tono
    var ds = [0, 0, 0], dn = [0, 0, 0];
    for (x = 0; x < w; x++) { if (x >= ax0 && x < ax1) continue; var t2 = Math.min(2, Math.floor(x / w * 3)); dn[t2]++; if (low[x].f > 0.75 && low[x].sd < 32) ds[t2]++; }
    ds = ds.map(function (v, j) { return dn[j] ? v / dn[j] : 0; });
    var dmax = Math.max.apply(null, ds);
    var frs = fr.slice().sort(function (a, b) { return b - a; });
    if (dmax > 0.15 && frs[0] - frs[1] < 0.1) side = ds.indexOf(dmax); // pie ambiguo (jardineras, escalones): manda lo opaco
    var dq = th[side], puerta = dq[0] ? rgb2hex([dq[2] / dq[0], dq[3] / dq[0], dq[4] / dq[0]]) : '#3A3D43';
    var vid = total ? dark / total : 0, floors = proj().floors, lado = ['izq', 'centro', 'der'][side];
    var cancel = dk[3] ? rgb2hex(dk.slice(0, 3).map(function (v) { return v / dk[3]; })) : '#1D2128';
    var porche = !teja && fr[side] > 0.6;
    var ref = {
      muro: rgb2hex(rgb), cancel: cancel, puerta: puerta, porcheColor: puerta, textura: mat, acento: acento, acentoLado: acentoLado, acentoAncho: acentoAncho, acentoDesde: 0,
      ventanas: teja ? 'marco' : vid > 0.06 ? 'cuadricula' : 'lisa', travesano: !teja && vid > 0.06, ventanaAlta: !teja && vid > 0.14,
      puertaLado: lado, porche: porche, losaVolada: porche && floors > 1,
      balcon: floors > 1 ? (teja ? 'herreria' : 'vidrio') : 'ninguno', balconLado: lado,
      cubierta: teja ? 'teja' : 'plano', cochera: false
    };
    return { material: mat, color: ref.muro, teja: teja, vidrio: vid, ratio: canvas.width / canvas.height, pie: Math.round(yb / h * 100) / 100, accesos: fr.concat(ds).map(function (v) { return Math.round(v * 100) / 100; }), ref: FX.normRef(ref) };
  }
  var LADO = { izq: 'a la izquierda', centro: 'al centro', der: 'a la derecha' };
  function refWhy(R, desc) {
    var t = [];
    if (desc) t.push('Lectura de tu referencia: ' + desc);
    t.push('Tu fachada se ajustó a la referencia: muro ' + R.muro.toUpperCase() + ' (' + FX.MATERIALES[R.textura].n.toLowerCase() + '), cancelería ' + R.cancel.toUpperCase() + ' y puerta ' + R.puerta.toUpperCase() + '.');
    t.push('Ventanas ' + ({ cuadricula: 'con retícula de perfiles', lisa: 'lisas', franja: 'en franja', arco: 'en arco', marco: 'con marco' })[R.ventanas] + (R.travesano ? ' y travesaño alto' : '') + (R.ventanaAlta ? ', de piso a techo' : '') + ', como en la referencia.');
    t.push('Acceso ' + LADO[R.puertaLado] + (R.puertaDoble ? ' con puerta doble' : '') + (R.porche ? ', remetido y en color oscuro' : '') + (R.losaVolada ? ', bajo una losa volada con luminarias empotradas' : '') + '.');
    if (R.balcon !== 'ninguno') t.push('Balcón ' + (R.balcon === 'vidrio' ? 'con barandal de cristal' : 'de herrería') + ' en planta alta ' + (R.balconLado === 'todos' ? 'en todo el frente' : LADO[R.balconLado]) + '.');
    if (R.acentoLado !== 'ninguno') t.push('Volumen de acento ' + LADO[R.acentoLado] + ' en ' + R.acento.toUpperCase() + '.');
    if (R.cubierta === 'teja') t.push('Cubierta de teja como la referencia.');
    t.push('Las medidas, niveles y crujías son las de tu proyecto; el 3D y el recorrido usan estos mismos colores.');
    return t;
  }
  function suggestFromPhoto(lec) {
    var p = proj(), f = Object.assign(FX.preset('referencia'), { on: true, hora: 'dia' });
    f.ref = lec.ref; f.material = lec.material;
    f.opts.volado = lec.ref.losaVolada; f.opts.balcones = lec.ref.balcon !== 'ninguno'; f.opts.jardineras = true; f.opts.iluminacion = true;
    f.opts.celosia = false; f.opts.pergola = false; f.opts.basamento = false;
    return { fx: f, why: refWhy(f.ref) };
  }
  // Respuesta de RINOVAIA AI → fachada de referencia
  var AI_KEYS = { muro_hex: 'muro', acento_hex: 'acento', cancel_hex: 'cancel', puerta_hex: 'puerta', porche_hex: 'porcheColor', textura: 'textura', ventanas: 'ventanas', travesano: 'travesano', ventana_alta: 'ventanaAlta',
    puerta_lado: 'puertaLado', puerta_doble: 'puertaDoble', porche: 'porche', losa_volada: 'losaVolada', balcon: 'balcon', balcon_lado: 'balconLado', acento_lado: 'acentoLado', acento_ancho: 'acentoAncho', acento_desde: 'acentoDesde', cubierta: 'cubierta', cochera: 'cochera' };
  function refFromAI(base, rep) {
    var R = Object.assign({}, base);
    Object.keys(AI_KEYS).forEach(function (k) { if (rep[k] !== undefined && rep[k] !== null && rep[k] !== '') R[AI_KEYS[k]] = typeof rep[k] === 'string' && /_hex$/.test(k) ? rep[k].trim() : rep[k]; });
    if (rep.acento_hex === '' || rep.acento_lado === 'ninguno') { R.acento = null; R.acentoLado = 'ninguno'; }
    return FX.normRef(R);
  }
  function handleUp(file, opts) {
    if (!file) return; opts = opts || {};
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name), isImg = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
    if (!isPdf && !isImg) { E.toast('Sube la fachada en JPG, PNG o PDF.'); return; }
    if (file.size > 25 * 1024 * 1024) { E.toast('El archivo pesa más de 25 MB. Prueba con uno más ligero.'); return; }
    if (view !== 'fachada' && !opts.quiet) showPv('fachada');
    var ld = document.createElement('div'); ld.className = 'fx-up-load'; ld.textContent = 'Leyendo la fachada…'; $('#fxStage').appendChild(ld);
    var bufCopy = null;
    var cp = isPdf ? readAs(file, 'readAsArrayBuffer').then(function (buf) { bufCopy = buf.slice(0); return pdfPage(buf); })
      : readAs(file, 'readAsDataURL').then(loadImg).then(function (img) { return toCanvas(img, 1800); });
    cp.then(function (canvas) {
      var lec = readFacade(canvas);
      var v = { name: file.name, tipo: isPdf ? 'PDF' : 'Imagen', img: toCanvas(canvas, 1400).toDataURL('image/jpeg', 0.82), thumb: toCanvas(canvas, 480).toDataURL('image/jpeg', 0.7), lectura: lec, at: Date.now(), by: 'lectura en el navegador' };
      saveFoto(v);
      var sg = suggestFromPhoto(lec);
      proj().fx = sg.fx; why = sg.why;
      $('#fxCompare').checked = true;
      commit();
      if (!opts.quiet) E.toast('Tu fachada se ajustó a la referencia. Desliza para comparar.');
      // Con RINOVAIA AI activa, se afina la lectura (estilo, niveles, elementos); si ya viene leída, se usa tal cual
      var ai = opts.ai ? function () { return Promise.resolve({ lectura: opts.ai }); } : window.RinovaIA && window.RinovaIA.readFacade;
      if (!ai) return;
      var payload = isPdf && bufCopy && file.size < 7 * 1024 * 1024 ? { tipo: 'pdf', media_type: 'application/pdf', datos: b64(bufCopy), nombre: file.name } : { tipo: 'imagen', media_type: 'image/jpeg', datos: v.img.split(',')[1], nombre: file.name };
      return ai(payload).then(function (j) {
        var L = j.lectura || j, f = fx();
        // La propuesta sigue siendo "según tu fachada": la IA solo afina colores, vanos, balcón y acceso
        f.estilo = 'referencia'; f.on = true;
        if (L.replica) f.ref = refFromAI(f.ref || lec.ref, L.replica);
        else if (L.material_principal && FX.MATERIALES[L.material_principal]) f.ref = FX.normRef(Object.assign({}, f.ref || lec.ref, { textura: L.material_principal }));
        if (FX.MATERIALES[L.material_principal]) f.material = L.material_principal;
        if (L.elementos) ['celosia', 'pergola', 'jardineras', 'basamento', 'iluminacion'].forEach(function (k) { if (typeof L.elementos[k] === 'boolean') f.opts[k] = L.elementos[k]; });
        f.opts.volado = f.ref.losaVolada; f.opts.balcones = f.ref.balcon !== 'ninguno';
        why = refWhy(f.ref, L.descripcion).concat((L.mejoras || []).slice(0, 6));
        foto.by = 'RINOVAIA AI'; foto.ai = L; saveFoto(foto);
        commit(); if (!opts.quiet) E.toast('RINOVAIA AI leyó la referencia y afinó colores, vanos y balcón');
      }).catch(function () { /* sin IA activa: se queda la lectura del navegador */ });
    }).catch(function () {
      E.toast(isPdf ? 'No se pudo abrir el PDF. Prueba con una foto JPG de la fachada.' : 'No se pudo leer la imagen. Prueba con otra foto en JPG.');
    }).then(function () { ld.remove(); });
  }
  function b64(buf) { var s = '', b = new Uint8Array(buf), i, ch = 0x8000; for (i = 0; i < b.length; i += ch) s += String.fromCharCode.apply(null, b.subarray(i, i + ch)); return btoa(s); }
  $('#fxUp').addEventListener('change', function (e) { handleUp(e.target.files[0]); e.target.value = ''; });
  window.RinovaFachadaUp = handleUp;
  $('#fxFileDel').addEventListener('click', function () { saveFoto(null); why = []; commit(); E.toast('Fachada subida retirada'); });
  // Arrastrar y soltar sobre el visor
  $('#fxStage').addEventListener('dragover', function (e) { e.preventDefault(); });
  $('#fxStage').addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) handleUp(e.dataTransfer.files[0]); });
  function fileInfo() {
    var el = $('#fxFile'); el.hidden = !foto;
    $('#fxUpBtn').lastChild.textContent = foto ? 'Cambiar fachada de referencia' : 'Subir fachada (PDF o JPG)';
    if (!foto) return;
    $('#fxFileThumb').src = foto.thumb || foto.img; $('#fxFileName').textContent = foto.name;
    var R = fx().ref;
    $('#fxFileInfo').innerHTML = esc(foto.tipo) + ' · ' + (R ? ['muro', 'cancel', 'puerta'].map(function (k) { return '<i class="fx-sw" style="background:' + R[k] + '" title="' + k + ' ' + R[k] + '"></i>'; }).join('') + ' ' : '') + 'lectura: ' + esc(foto.by || 'navegador');
  }
  function originalHtml(p, r, f) {
    if (foto) return '<div class="fx-photo"><img alt="Fachada actual subida: ' + esc(foto.name) + '" src="' + foto.img + '"></div>';
    return F.build({ floors: p.floors, bays: p.bays, style: p.style, mode: 'render', phi: false, lat: r.city.lat, month: p.month, hour: f.hora === 'dia' ? 12 : f.hora === 'tarde' ? 17.5 : 20, palette: p.palette, width: 1200, height: 720, id: 'fxo' });
  }

  /* ---------- Corregir la lectura de la referencia ---------- */
  var REF_SEL = [
    ['puertaLado', 'Acceso', { izq: 'Izquierda', centro: 'Centro', der: 'Derecha' }],
    ['ventanas', 'Ventanas', { cuadricula: 'Con retícula', lisa: 'Lisas', franja: 'En franja', arco: 'En arco', marco: 'Con marco' }],
    ['balcon', 'Balcón', { vidrio: 'Barandal de cristal', herreria: 'Herrería', ninguno: 'Sin balcón' }],
    ['balconLado', 'Lado del balcón', { izq: 'Izquierda', centro: 'Centro', der: 'Derecha', todos: 'Todo el frente' }],
    ['acentoLado', 'Volumen de acento', { ninguno: 'Ninguno', izq: 'Izquierda', der: 'Derecha' }],
    ['cubierta', 'Cubierta', { plano: 'Losa plana', teja: 'Teja' }],
    ['textura', 'Acabado del muro', null]
  ];
  var REF_COL = [['muro', 'Muro'], ['cancel', 'Cancelería'], ['puerta', 'Puerta'], ['acento', 'Acento'], ['porcheColor', 'Fondo del acceso']];
  var REF_CHK = [['travesano', 'Travesaño alto'], ['ventanaAlta', 'Ventanas de piso a techo'], ['puertaDoble', 'Puerta doble'], ['porche', 'Acceso remetido'], ['losaVolada', 'Losa volada sobre el acceso'], ['cochera', 'Portón de cochera']];
  $('#fxRefG').innerHTML = REF_COL.map(function (c) { return '<div class="field"><label for="fxR-' + c[0] + '">' + c[1] + '</label><input type="color" id="fxR-' + c[0] + '" data-r="' + c[0] + '"></div>'; }).join('') +
    REF_SEL.map(function (c) { var o = c[2] || FX.MATERIALES; return '<div class="field"><label for="fxR-' + c[0] + '">' + c[1] + '</label><select class="input" id="fxR-' + c[0] + '" data-r="' + c[0] + '">' + Object.keys(o).map(function (k) { return '<option value="' + k + '">' + esc(o[k].n || o[k]) + '</option>'; }).join('') + '</select></div>'; }).join('') +
    REF_CHK.map(function (c) { return '<label class="chk"><input type="checkbox" data-r="' + c[0] + '"> ' + c[1] + '</label>'; }).join('');
  function syncRef() {
    var f = fx(), box = $('#fxRef'); box.hidden = !f.ref; if (!f.ref) return;
    $$('[data-r]', box).forEach(function (el) { var k = el.dataset.r, v = f.ref[k]; if (el.type === 'checkbox') el.checked = !!v; else if (el.type === 'color') el.value = v || (k === 'acento' ? '#2B2F36' : '#888888'); else el.value = v; });
  }
  $('#fxRefG').addEventListener('change', function (e) {
    var el = e.target.closest('[data-r]'); if (!el) return;
    var f = fx(); if (!f.ref) return;
    var k = el.dataset.r, R = Object.assign({}, f.ref);
    R[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'acento' && R.acentoLado === 'ninguno') R.acentoLado = 'der';
    if (k === 'acentoLado' && R.acentoLado !== 'ninguno' && !R.acento) R.acento = '#2B2F36';
    if (k === 'puertaLado' && f.ref.balconLado === f.ref.puertaLado) R.balconLado = R.puertaLado;
    f.ref = FX.normRef(R); f.estilo = 'referencia'; f.on = true;
    f.opts.volado = f.ref.losaVolada; f.opts.balcones = f.ref.balcon !== 'ninguno';
    why = refWhy(f.ref); commit();
  });

  /* ---------- Render de fachada ---------- */
  function renderFx() {
    if (view !== 'fachada') return;
    var p = proj(), r = res(), f = fx(), on = f.on;
    syncFxForm(); fileInfo(); syncRef();
    $('#fxTagB').textContent = foto ? 'Fachada de referencia' : 'Fachada original';
    $('#fxCompare').parentNode.lastChild.textContent = foto ? ' Comparar con la referencia' : ' Comparar con la original';
    if (!on) {
      $('#fxAfter').innerHTML = originalHtml(p, r, f);
      $('#fxTagA').textContent = foto ? 'Fachada de referencia' : 'Fachada actual';
      $('#fxLegend').innerHTML = '<li class="fx-empty">Pulsa <b>Mejorar fachada</b>, elige un estilo o <b>sube tu fachada</b> en PDF o JPG para generar la propuesta.</li>';
      $('#fxBefore').hidden = true; $('#fxCmp').hidden = true; $('#fxTagB').hidden = true; $('#fxCompare').disabled = true;
      $('#fxWhy').innerHTML = '<li class="muted">Aún no hay mejoras aplicadas.</li>'; $('#fxCost').innerHTML = '<p class="muted" style="margin:0">—</p>';
      return;
    }
    var out = FX.svg(p, r, f, { id: 'fxa' });
    $('#fxAfter').innerHTML = out.svg;
    $('#fxTagA').textContent = 'Propuesta · ' + FX.ESTILOS[f.estilo].n;
    $('#fxLegend').innerHTML = out.marks.map(function (m, i) { return '<li><span class="n">' + (i + 1) + '</span>' + esc(m.t) + '</li>'; }).join('');
    var cmp = $('#fxCompare').checked; $('#fxCompare').disabled = false;
    $('#fxBefore').hidden = !cmp; $('#fxCmp').hidden = !cmp; $('#fxTagB').hidden = !cmp;
    if (cmp) {
      $('#fxBefore').innerHTML = originalHtml(p, r, f);
      $('#fxBefore').style.clipPath = 'inset(0 ' + (100 - $('#fxCmp').value) + '% 0 0)';
    }
    // Mejoras y por qué
    var list = why.length ? why : describe(out.spec);
    $('#fxWhy').innerHTML = list.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    var c = FX.cost(p, r, f);
    $('#fxCost').innerHTML = '<div class="costbars">' + c.items.map(function (x) { return '<div class="fx-ci"><span>' + esc(x[0]) + '</span><b>' + E.money(x[1]) + '</b></div>'; }).join('') + '</div>' +
      '<div class="total" style="margin-top:12px;padding-top:12px"><span>Total fachada <small class="muted">· ' + E.nf0.format(c.area) + ' m² · ' + Math.round(c.wwr * 100) + ' % vidrio</small></span><b class="num" style="font-size:24px">' + E.money(c.total) + '</b></div>';
  }
  function describe(s) {
    var t = ['Estilo ' + s.E.n.toLowerCase() + ': ' + s.E.d.toLowerCase() + '.', 'Muro en ' + s.M.n.toLowerCase() + (s.accent ? ' con volumen de acento en ' + s.A.n.toLowerCase() : '') + ' y cancelería de ' + s.C.n.toLowerCase() + '.'];
    Object.keys(FX.OPCIONES).forEach(function (k) { if (s.fx.opts[k]) t.push(FX.OPCIONES[k].n + ': ' + FX.OPCIONES[k].d.toLowerCase() + '.'); });
    return t;
  }
  function slug(s) { return String(s || 'proyecto').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proyecto'; }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  $('#fxPng').addEventListener('click', function () {
    var svgEl = $('#fxAfter svg'); if (!svgEl) return;
    var src = new XMLSerializer().serializeToString(svgEl), img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = 2400; c.height = 1440; var g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
      g.fillStyle = 'rgba(11,15,23,.8)'; g.fillRect(0, c.height - 96, c.width, 96); g.fillStyle = '#D4AF37'; g.fillRect(44, c.height - 34, 60, 4);
      g.fillStyle = '#fff'; g.font = '600 34px Montserrat, Inter, sans-serif'; g.fillText('RINOVAIA', 44, c.height - 46);
      g.fillStyle = '#C0C6D4'; g.font = '24px Inter, sans-serif'; g.textAlign = 'right'; g.fillText(proj().name + ' · Fachada ' + FX.ESTILOS[fx().estilo].n.toLowerCase(), c.width - 44, c.height - 40);
      c.toBlob(function (b) { download(b, 'rinovaia-' + slug(proj().name) + '-fachada.png'); E.toast('Imagen de la fachada descargada'); }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  });

  /* ---------- Render 3D ---------- */
  function updateChip() { var f = fx(); $('#r3dChip').textContent = (f.on ? FX.ESTILOS[f.estilo].n : 'Fachada base') + ' · ' + FX.HORAS[f.hora] + ' · ' + proj().floors + ' niveles'; }
  function specNow() {
    var p = proj(), r = res(), f = fx();
    // Sin mejora aplicada, el 3D usa la fachada base equivalente al estilo del formulario
    var base = f.on ? f : Object.assign(FX.preset({ moderno: 'contemporaneo', mediterraneo: 'mediterraneo', renacentista: 'colonial' }[p.style] || 'contemporaneo'), { hora: f.hora, opts: {} });
    if (!f.on) { base.material = { concreto: 'concreto', marmol: 'travertino', travertino: 'travertino', terracota: 'ocre' }[p.palette] || 'concreto'; }
    return FX.spec(p, r, base);
  }
  function open3d() {
    updateChip();
    if (ctl) { ctl.update(specNow(), { hora: fx().hora, lat: res().city.lat, month: proj().month }); ctl.resize(); return; }
    if (ctlBusy) return;
    if (!R3.webgl()) { $('#r3dLoad').textContent = 'Tu navegador no tiene WebGL activo, necesario para el render 3D.'; return; }
    ctlBusy = true; $('#r3dLoad').hidden = false; $('#r3dLoad').textContent = 'Generando modelo 3D…';
    R3.load().then(function () {
      ctl = R3.create($('#r3dCanvas'), { onInteract: function () { $('#r3dHint').classList.add('off'); } });
      ctl.update(specNow(), { hora: fx().hora, lat: res().city.lat, month: proj().month });
      $('#r3dLoad').hidden = true; ctlBusy = false;
      if (!ctl.canRecord()) { $('#r3dVid').disabled = true; $('#r3dVid').title = 'Este navegador no permite grabar video'; }
    }).catch(function (err) { ctlBusy = false; $('#r3dLoad').textContent = err.message || 'No se pudo generar el render 3D.'; });
  }
  $('#r3dSpin').addEventListener('click', function () {
    if (!ctl) return; var on = !ctl.spinning(); ctl.setSpin(on);
    this.setAttribute('aria-pressed', on); $('span', this).textContent = on ? 'Pausar giro' : 'Girar 360°';
  });
  $('#r3dViews').addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (b && ctl) ctl.setView(b.dataset.v); });
  $('#r3dPng').addEventListener('click', function () {
    if (!ctl) return;
    ctl.png(proj().name + ' · ' + res().city.name).then(function (b) { download(b, 'rinovaia-' + slug(proj().name) + '-3d.png'); E.toast('Imagen del render 3D descargada'); });
  });
  $('#r3dVid').addEventListener('click', function () {
    if (!ctl) return; var btn = this, lbl = btn.innerHTML;
    btn.disabled = true; $('#r3dRec').hidden = false;
    ctl.record360(12, function (f) { btn.textContent = 'Grabando… ' + Math.round(f * 100) + ' %'; }).then(function (out) {
      download(out.blob, 'rinovaia-' + slug(proj().name) + '-360.' + out.ext); E.toast('Video 360° descargado (' + out.ext.toUpperCase() + ')');
    }).catch(function (err) { E.toast(err.message || 'No se pudo grabar el video'); }).then(function () { btn.disabled = false; btn.innerHTML = lbl; $('#r3dRec').hidden = true; });
  });
  $('#r3dFull').addEventListener('click', function () {
    var box = $('#r3d');
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (box.classList.contains('full')) { box.classList.remove('full'); document.body.style.overflow = ''; }
    else if (box.requestFullscreen) box.requestFullscreen().catch(function () { box.classList.add('full'); document.body.style.overflow = 'hidden'; });
    else { box.classList.add('full'); document.body.style.overflow = 'hidden'; }
    setTimeout(function () { if (ctl) ctl.resize(); }, 120);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#r3d').classList.contains('full')) { $('#r3d').classList.remove('full'); document.body.style.overflow = ''; } });

  /* ---------- Sincronización con el Estudio ---------- */
  var t3;
  document.addEventListener('rinova:change', function () {
    if (view === 'fachada') renderFx();
    if (view === 'r3d' && ctl) { clearTimeout(t3); t3 = setTimeout(function () { updateChip(); ctl.update(specNow(), { hora: fx().hora, lat: res().city.lat, month: proj().month }); }, 180); }
  });
  try { var last = sessionStorage.getItem('rinova.pv'); if (last && last !== 'laminas') showPv(last); } catch (e) { }
  /* ---------- Encabezado fijo y accesos rápidos ---------- */
  var bar = $('#studioBar'), topm = $('.topm'), rootS = document.documentElement.style;
  function measure() {
    var off = topm && getComputedStyle(topm).display !== 'none' ? topm.offsetHeight : 0;
    rootS.setProperty('--top-off', off + 'px');
    if (bar) { rootS.setProperty('--bar-h', bar.offsetHeight + 'px'); bar.classList.toggle('stuck', window.scrollY > 4 && bar.getBoundingClientRect().top <= off + 0.5); }
  }
  window.addEventListener('scroll', measure, { passive: true });
  window.addEventListener('resize', measure);
  if (window.ResizeObserver && bar) new ResizeObserver(measure).observe(bar);
  measure();
  $$('[data-pv-jump]').forEach(function (b) {
    b.addEventListener('click', function () {
      E.showView('studio'); E.selectTab('planos'); showPv(b.dataset.pvJump);
      setTimeout(function () { $('#pvTabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
    });
  });
  window.RinovaFachadaUI = {
    show: showPv, spec: specNow,
    hora: function () { return fx().hora; },
    // Colores que el recorrido virtual toma de la misma fachada que dibujan la propuesta y el 3D
    facade: function () { var s = specNow(); return { muro: s.M.c, cancel: s.C.c, porton: s.ref ? s.ref.puerta : null, puerta: s.doorC || null, spec: s }; }
  };
})();
