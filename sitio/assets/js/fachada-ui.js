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
    $$('#fxStyles button').forEach(function (b) { b.setAttribute('aria-pressed', f.on && b.dataset.v === f.estilo); });
    $('#fxMat').value = f.material; $('#fxAcc').value = f.acento; $('#fxCan').value = f.cancel;
    $$('#fxOpts input').forEach(function (c) { c.checked = !!f.opts[c.dataset.o]; });
    $$('.fx-hora').forEach(function (g) { $$('button', g).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === f.hora); }); });
  }
  function touch(mut, msg) { var f = fx(); if (!f.on) { f.on = true; } mut(f); why = []; commit(); if (msg) E.toast(msg); }
  $('#fxStyles').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]'); if (!b) return;
    touch(function (f) { var pr = FX.preset(b.dataset.v); f.estilo = pr.estilo; f.material = pr.material; f.acento = pr.acento; f.cancel = pr.cancel; f.opts = pr.opts; }, 'Estilo ' + FX.ESTILOS[b.dataset.v].n.toLowerCase() + ' aplicado a la fachada');
  });
  $('#fxMat').addEventListener('change', function (e) { touch(function (f) { f.material = e.target.value; }); });
  $('#fxAcc').addEventListener('change', function (e) { touch(function (f) { f.acento = e.target.value; }); });
  $('#fxCan').addEventListener('change', function (e) { touch(function (f) { f.cancel = e.target.value; }); });
  $('#fxOpts').addEventListener('change', function (e) { var c = e.target.closest('input[data-o]'); if (c) touch(function (f) { f.opts[c.dataset.o] = c.checked; }); });
  $$('.fx-hora').forEach(function (g) {
    g.addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b) return; fx().hora = b.dataset.v; syncFxForm(); E.refresh(); });
  });
  $('#fxAuto').addEventListener('click', function () {
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
  /* Lectura en el navegador: color dominante del muro, techo de teja, proporción de vidrio. */
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function readFacade(canvas) {
    var k = Math.min(1, 160 / Math.max(canvas.width, canvas.height)), w = Math.max(8, Math.round(canvas.width * k)), h = Math.max(8, Math.round(canvas.height * k));
    var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'); g.drawImage(canvas, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h).data, bins = {}, dark = 0, tile = 0, total = 0, x, y;
    for (y = Math.round(h * 0.08); y < h * 0.95; y++) for (x = Math.round(w * 0.06); x < w * 0.94; x++) {
      var i = (y * w + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B), L = (mx + mn) / 2, sat = mx - mn;
      total++;
      if (L < 70) { dark++; continue; }
      if (B > R + 18 && B > G && L > 120 && y < h * 0.4) continue;           // cielo
      if (G > R + 12 && G > B + 8) continue;                                 // vegetación
      if (R > 120 && R > G + 40 && G > B && sat > 60 && y < h * 0.45) tile++; // teja
      var key = (R >> 4) + ',' + (G >> 4) + ',' + (B >> 4);
      bins[key] = (bins[key] || 0) + 1;
    }
    var best = null, bn = 0; Object.keys(bins).forEach(function (kk) { if (bins[kk] > bn) { bn = bins[kk]; best = kk; } });
    var rgb = best ? best.split(',').map(function (v) { return (+v << 4) + 8; }) : [200, 200, 200];
    var mat = 'aplanado', md = 1e9;
    ['concreto', 'aplanado', 'piedra', 'ladrillo', 'cantera', 'travertino', 'ocre', 'grafito', 'madera'].forEach(function (m) {
      var q = hex2rgb(FX.MATERIALES[m].c), dd = Math.pow(q[0] - rgb[0], 2) + Math.pow(q[1] - rgb[1], 2) + Math.pow(q[2] - rgb[2], 2);
      if (dd < md) { md = dd; mat = m; }
    });
    return { material: mat, color: 'rgb(' + rgb.join(',') + ')', teja: total ? tile / total > 0.025 : false, vidrio: total ? dark / total : 0, ratio: canvas.width / canvas.height };
  }
  function suggestFromPhoto(lec) {
    var p = proj(), r = res(), sg = FX.suggest(p, r), f = sg.fx, why = [];
    if (lec.teja) { f = Object.assign(FX.preset(lec.material === 'ocre' || lec.material === 'cantera' ? 'colonial' : 'mediterraneo'), { on: true, hora: sg.fx.hora }); why.push('Se respeta la cubierta de teja de tu fachada: estilo ' + FX.ESTILOS[f.estilo].n.toLowerCase() + '.'); }
    else if (lec.material === 'ladrillo') { f = Object.assign(FX.preset('industrial'), { on: true, hora: sg.fx.hora }); why.push('Tu fachada es de ladrillo: se conserva y se moderniza con estilo industrial.'); }
    else why.push('Estilo propuesto: ' + FX.ESTILOS[f.estilo].n.toLowerCase() + ', a partir del tipo de inmueble y el clima de ' + r.city.name + '.');
    f.material = lec.material;
    why.push('Material principal detectado en tu fachada: ' + FX.MATERIALES[lec.material].n.toLowerCase() + '. Se conserva como base de la propuesta.');
    var glass = Math.round(lec.vidrio * 100);
    if (lec.vidrio < 0.12) why.push('Tu fachada tiene poco vidrio (≈' + glass + ' % oscuro en la imagen): la propuesta abre ventanales para más luz natural.');
    else if (lec.vidrio > 0.35) why.push('Tu fachada tiene mucho vidrio (≈' + glass + ' %): se agregan celosías para controlar el sol.');
    if (lec.vidrio > 0.35) f.opts.celosia = true;
    sg.why.slice(1).forEach(function (t) { why.push(t); });
    return { fx: f, why: why };
  }
  function handleUp(file) {
    if (!file) return;
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name), isImg = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
    if (!isPdf && !isImg) { E.toast('Sube la fachada en JPG, PNG o PDF.'); return; }
    if (file.size > 25 * 1024 * 1024) { E.toast('El archivo pesa más de 25 MB. Prueba con uno más ligero.'); return; }
    if (view !== 'fachada') showPv('fachada');
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
      E.toast('Fachada subida: la propuesta parte de tu fachada. Desliza para comparar.');
      // Con RINOVAIA AI activa, se afina la lectura (estilo, niveles, elementos)
      var ai = window.RinovaIA && window.RinovaIA.readFacade;
      if (!ai) return;
      var payload = isPdf && bufCopy && file.size < 7 * 1024 * 1024 ? { tipo: 'pdf', media_type: 'application/pdf', datos: b64(bufCopy), nombre: file.name } : { tipo: 'imagen', media_type: 'image/jpeg', datos: v.img.split(',')[1], nombre: file.name };
      return ai(payload).then(function (j) {
        var L = j.lectura || j, f = fx();
        if (FX.ESTILOS[L.estilo_sugerido]) { var pr = FX.preset(L.estilo_sugerido); f.estilo = pr.estilo; f.acento = pr.acento; f.cancel = pr.cancel; f.opts = pr.opts; }
        if (FX.MATERIALES[L.material_principal]) f.material = L.material_principal;
        if (L.elementos) Object.keys(FX.OPCIONES).forEach(function (k) { if (typeof L.elementos[k] === 'boolean') f.opts[k] = L.elementos[k]; });
        why = (L.mejoras || []).slice(0, 8);
        if (L.descripcion) why.unshift('Lectura de tu fachada: ' + L.descripcion);
        foto.by = 'RINOVAIA AI'; foto.ai = L; saveFoto(foto);
        commit(); E.toast('RINOVAIA AI leyó tu fachada y afinó la propuesta');
      }).catch(function () { /* sin IA activa: se queda la lectura del navegador */ });
    }).catch(function () {
      E.toast(isPdf ? 'No se pudo abrir el PDF. Prueba con una foto JPG de la fachada.' : 'No se pudo leer la imagen. Prueba con otra foto en JPG.');
    }).then(function () { ld.remove(); });
  }
  function b64(buf) { var s = '', b = new Uint8Array(buf), i, ch = 0x8000; for (i = 0; i < b.length; i += ch) s += String.fromCharCode.apply(null, b.subarray(i, i + ch)); return btoa(s); }
  $('#fxUp').addEventListener('change', function (e) { handleUp(e.target.files[0]); e.target.value = ''; });
  $('#fxFileDel').addEventListener('click', function () { saveFoto(null); why = []; commit(); E.toast('Fachada subida retirada'); });
  // Arrastrar y soltar sobre el visor
  $('#fxStage').addEventListener('dragover', function (e) { e.preventDefault(); });
  $('#fxStage').addEventListener('drop', function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) handleUp(e.dataTransfer.files[0]); });
  function fileInfo() {
    var el = $('#fxFile'); el.hidden = !foto;
    $('#fxUpBtn').lastChild.textContent = foto ? 'Cambiar fachada subida' : 'Subir fachada (PDF o JPG)';
    if (!foto) return;
    $('#fxFileThumb').src = foto.thumb || foto.img; $('#fxFileName').textContent = foto.name;
    $('#fxFileInfo').textContent = foto.tipo + ' · ' + (foto.lectura ? FX.MATERIALES[foto.lectura.material].n + (foto.lectura.teja ? ' · teja' : '') + ' · ' : '') + 'lectura: ' + (foto.by || 'navegador');
  }
  function originalHtml(p, r, f) {
    if (foto) return '<div class="fx-photo"><img alt="Fachada actual subida: ' + esc(foto.name) + '" src="' + foto.img + '"></div>';
    return F.build({ floors: p.floors, bays: p.bays, style: p.style, mode: 'render', phi: false, lat: r.city.lat, month: p.month, hour: f.hora === 'dia' ? 12 : f.hora === 'tarde' ? 17.5 : 20, palette: p.palette, width: 1200, height: 720, id: 'fxo' });
  }

  /* ---------- Render de fachada ---------- */
  function renderFx() {
    if (view !== 'fachada') return;
    var p = proj(), r = res(), f = fx(), on = f.on;
    syncFxForm(); fileInfo();
    $('#fxTagB').textContent = foto ? 'Tu fachada actual' : 'Fachada original';
    $('#fxCompare').parentNode.lastChild.textContent = foto ? ' Comparar con tu fachada' : ' Comparar con la original';
    if (!on) {
      $('#fxAfter').innerHTML = originalHtml(p, r, f);
      $('#fxTagA').textContent = foto ? 'Tu fachada actual' : 'Fachada actual';
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
  window.RinovaFachadaUI = { show: showPv };
})();
