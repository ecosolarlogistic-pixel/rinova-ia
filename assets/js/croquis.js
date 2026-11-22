/* RINOVAIA — Croquis a planos y conexión con RINOVAIA AI.
   1. El usuario sube un croquis en foto o PDF.
   2. Si la función de IA está desplegada (supabase/functions/rinova-ia), Claude lee el croquis y devuelve
      tipo de inmueble, medidas, niveles y programa. Si no, se hace una lectura asistida en el navegador
      (proporción del trazo) y el usuario confirma los datos.
   3. Con los datos confirmados se regenera todo el juego de planos y el croquis queda como lámina A-00. */
(function () {
  'use strict';
  var E = window.RinovaEstudio, PR = window.RinovaProyecto;
  if (!E || !PR) return;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var esc = E.esc;
  var CFG = window.RINOVA_IA || {};

  /* ---------- Cliente de RINOVAIA AI ---------- */
  var aiState = null; // null: sin probar · true: disponible · false: no desplegada
  var NOT_READY = 'RINOVAIA AI todavía no está activada en el servidor, así que se muestra la revisión por reglas. Para el dictamen con IA hay que desplegar la función rinova-ia con la clave de Anthropic (ver docs/IA.md).';
  function call(action, body, timeout) {
    if (!CFG.endpoint || aiState === false) return Promise.reject(new Error(NOT_READY));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeout || 120000);
    var headers = { 'content-type': 'application/json' }; if (CFG.key) headers.apikey = CFG.key;
    return fetch(CFG.endpoint, { method: 'POST', headers: headers, body: JSON.stringify(Object.assign({ action: action }, body)), signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        clearTimeout(t);
        if (res.status === 404 || res.status === 503) { aiState = false; throw new Error(NOT_READY); }
        return res.json().catch(function () { return {}; }).then(function (j) {
          if (!res.ok) throw new Error(j.error || ('RINOVAIA AI respondió con un error (' + res.status + '). Intenta de nuevo.'));
          aiState = true; return j;
        });
      }, function (err) {
        clearTimeout(t);
        if (err && err.name === 'AbortError') throw new Error('RINOVAIA AI tardó demasiado en responder. Intenta de nuevo.');
        if (aiState !== true) aiState = false;
        throw new Error(aiState === false ? NOT_READY : 'Sin conexión con RINOVAIA AI.');
      });
  }
  window.RinovaIA = {
    status: function () { return aiState; },
    analyze: function (datos) { return call('analisis', { datos: datos }).then(function (j) { return { texto: j.texto, meta: 'Dictamen de RINOVAIA AI' + (j.modelo ? ' · ' + j.modelo : '') }; }); },
    readSketch: function (file) { return call('croquis', { archivo: file }, 150000); }
  };

  /* ---------- Carga del archivo ---------- */
  function readAs(file, how) { return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = ko; r[how](file); }); }
  function loadImg(src) { return new Promise(function (ok, ko) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = ko; i.src = src; }); }
  function toCanvas(img, max) { var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); return c; }
  var pdfjs = null;
  function loadPdfJs() {
    if (pdfjs) return pdfjs;
    pdfjs = new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = function () { pdfjs = null; ko(new Error('pdf')); }; document.head.appendChild(s);
    });
    return pdfjs;
  }
  function pdfFirstPage(buf) {
    return loadPdfJs().then(function (lib) { return lib.getDocument({ data: buf }).promise; }).then(function (doc) { return doc.getPage(1); }).then(function (page) {
      var vp0 = page.getViewport({ scale: 1 }), k = 1600 / Math.max(vp0.width, vp0.height), vp = page.getViewport({ scale: k });
      var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      return page.render({ canvasContext: g, viewport: vp }).promise.then(function () { return c; });
    });
  }
  // Lectura local: recuadro que contiene el trazo para estimar la proporción frente/fondo
  function inkBox(canvas) {
    var k = Math.min(1, 420 / Math.max(canvas.width, canvas.height)), w = Math.round(canvas.width * k), h = Math.round(canvas.height * k);
    var c = document.createElement('canvas'); c.width = w; c.height = h; var g = c.getContext('2d'); g.drawImage(canvas, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h).data, sum = 0, n = 0, x, y, i;
    for (i = 0; i < d.length; i += 4) { sum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; n++; }
    var thr = Math.min(150, (sum / n) * 0.62), mx = Math.round(w * 0.03), my = Math.round(h * 0.03);
    var colC = new Array(w).fill(0), rowC = new Array(h).fill(0), dark = 0;
    for (y = my; y < h - my; y++) for (x = mx; x < w - mx; x++) { i = (y * w + x) * 4; if (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 < thr) { colC[x]++; rowC[y]++; dark++; } }
    if (dark < 40) return null;
    function span(arr, len) { var tot = arr.reduce(function (a, b) { return a + b; }, 0), acc = 0, a = 0, b = len - 1; for (var q = 0; q < len; q++) { acc += arr[q]; if (acc > tot * 0.02) { a = q; break; } } acc = 0; for (q = len - 1; q >= 0; q--) { acc += arr[q]; if (acc > tot * 0.02) { b = q; break; } } return [a, b]; }
    var sx = span(colC, w), sy = span(rowC, h), bw = sx[1] - sx[0], bh = sy[1] - sy[0];
    if (bw < w * 0.15 || bh < h * 0.15) return null;
    return { ratio: bh / bw, density: dark / ((w - 2 * mx) * (h - 2 * my)) };
  }

  /* ---------- Diálogo ---------- */
  var dlg = $('#dlgCroquis'), cur = null;
  function setStatus(kind, txt) { var s = $('#cqStatus'); s.className = 'chip ' + kind; s.innerHTML = '<span class="dot"></span>' + esc(txt); }
  function fillForm(v) {
    $('#cqType').value = v.type; $('#cqFront').value = v.front; $('#cqDepth').value = v.depth; $('#cqFloors').value = v.floors;
    $('#cqBeds').value = v.beds; $('#cqBaths').value = v.baths; $('#cqHalf').value = v.halfBaths; $('#cqParking').value = v.parking;
    $('#cqLayout').value = v.layout; $('#cqUnits').value = v.units; cqTypeUI();
  }
  function readForm() {
    function num(id, a, b, d) { var v = parseFloat($(id).value); return isNaN(v) ? d : Math.max(a, Math.min(b, v)); }
    var p = E.project();
    return { type: $('#cqType').value, front: num('#cqFront', 8, 40, p.front), depth: num('#cqDepth', 10, 40, p.depth), floors: num('#cqFloors', 1, 8, p.floors) | 0,
      beds: num('#cqBeds', 0, 10, p.beds) | 0, baths: num('#cqBaths', 0, 10, p.baths) | 0, halfBaths: num('#cqHalf', 0, 6, p.halfBaths) | 0,
      parking: num('#cqParking', 0, 400, p.parking) | 0, layout: $('#cqLayout').value, units: num('#cqUnits', 1, 24, p.units) | 0 };
  }
  function notes(list) { $('#cqNotes').innerHTML = (list || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join(''); }
  function open() { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  function close() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  function handle(file) {
    if (!file) return;
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name), isImg = /^image\//.test(file.type);
    if (!isPdf && !isImg) { E.toast('Sube una foto (JPG, PNG, HEIC) o un PDF del croquis.'); return; }
    if (file.size > 25 * 1024 * 1024) { E.toast('El archivo pesa más de 25 MB. Prueba con una foto más ligera.'); return; }
    var p = E.project();
    cur = { name: file.name, img: null, ai: null };
    fillForm(p); notes([]);
    $('#cqPic').innerHTML = '<div class="cq-load">Preparando el croquis…</div>';
    $('#cqName').textContent = file.name;
    setStatus('', 'Leyendo el croquis…');
    $('#cqGo').disabled = true;
    open();

    var canvasP = isPdf
      ? readAs(file, 'readAsArrayBuffer').then(function (buf) { cur.pdfB64 = file.size < 7 * 1024 * 1024 ? b64(buf) : null; return pdfFirstPage(buf.slice(0)); })
      : readAs(file, 'readAsDataURL').then(loadImg).then(function (img) { return toCanvas(img, 1600); });

    canvasP.then(function (canvas) {
      cur.img = canvas.toDataURL('image/jpeg', 0.86);
      cur.thumb = toCanvas(canvas, 1200).toDataURL('image/jpeg', 0.72);
      $('#cqPic').innerHTML = '<img alt="Croquis cargado" src="' + cur.img + '">';
      var box = inkBox(canvas);
      if (box) cur.local = { depth: Math.round(Math.max(10, Math.min(40, p.front * box.ratio)) * 2) / 2 };
    }, function () {
      $('#cqPic').innerHTML = '<div class="cq-load">PDF cargado: ' + esc(file.name) + '<br><small>No se pudo mostrar la vista previa en este navegador.</small></div>';
    }).then(function () {
      var payload = cur.pdfB64 ? { tipo: 'pdf', media_type: 'application/pdf', datos: cur.pdfB64, nombre: file.name }
        : cur.img ? { tipo: 'imagen', media_type: 'image/jpeg', datos: cur.img.split(',')[1], nombre: file.name } : null;
      if (!payload) throw new Error(NOT_READY);
      return window.RinovaIA.readSketch(payload);
    }).then(function (j) {
      var v = Object.assign({}, p), L = j.lectura || j;
      var T = { casa: 1, deptos: 1, comercial: 1, bodega: 1 };
      if (T[L.tipo]) v.type = L.tipo;
      ['front:frente_m', 'depth:fondo_m', 'floors:niveles', 'beds:recamaras', 'baths:banos', 'halfBaths:medios_banos', 'parking:estacionamiento', 'units:unidades_por_piso'].forEach(function (m) { var k = m.split(':'); if (typeof L[k[1]] === 'number' && L[k[1]] >= 0) v[k[0]] = L[k[1]]; });
      if (PR.DISTRIBUCION[L.distribucion]) v.layout = L.distribucion;
      fillForm(v);
      var conf = typeof L.confianza === 'number' ? ' · confianza ' + Math.round(L.confianza * 100) + ' %' : '';
      setStatus('ok', 'Leído con RINOVAIA AI' + conf);
      var nl = (L.observaciones || []).slice(0, 6);
      if (L.espacios && L.espacios.length) nl.unshift('Espacios identificados: ' + L.espacios.slice(0, 14).map(function (e) { return e.nombre + (e.area_m2 ? ' (' + e.area_m2 + ' m²)' : ''); }).join(', ') + '.');
      notes(nl); cur.ai = true; cur.by = 'RINOVAIA AI';
    }).catch(function (err) {
      var v = Object.assign({}, p);
      if (cur.local) v.depth = cur.local.depth;
      fillForm(v);
      setStatus('warn', 'Lectura asistida: confirma los datos');
      var msg = err && err.message === NOT_READY ? 'La lectura automática de espacios y medidas se activa al desplegar RINOVAIA AI. Mientras tanto, la app estimó la proporción del terreno a partir del trazo; revisa y ajusta los datos.' : (err && err.message) || 'No fue posible leer el croquis automáticamente; revisa los datos.';
      notes([msg].concat(cur.local ? ['Proporción del trazo: el fondo estimado es ' + cur.local.depth + ' m para un frente de ' + p.front + ' m. Si tu croquis tiene cotas, escríbelas aquí.'] : []));
      cur.by = 'lectura asistida';
    }).then(function () { $('#cqGo').disabled = false; });
  }
  function b64(buf) { var s = '', b = new Uint8Array(buf), i, ch = 0x8000; for (i = 0; i < b.length; i += ch) s += String.fromCharCode.apply(null, b.subarray(i, i + ch)); return btoa(s); }

  function cqTypeUI() { var t = $('#cqType').value, res = t === 'casa' || t === 'deptos'; $('#cqUnits').closest('.field').style.visibility = t === 'casa' ? 'hidden' : ''; $('#cqBeds').closest('.field').style.visibility = res ? '' : 'hidden'; }
  $('#cqType').addEventListener('change', cqTypeUI);
  $('#upCroquis').addEventListener('change', function (e) { handle(e.target.files[0]); e.target.value = ''; });
  $('#cqClose').addEventListener('click', close);
  $('#cqCancel').addEventListener('click', close);
  $('#cqGo').addEventListener('click', function () {
    var v = readForm();
    E.apply(v);
    if (cur && (cur.thumb || cur.img)) E.setCroquis({ img: cur.thumb || cur.img, name: cur.name, by: cur.by, at: Date.now() });
    close(); showCurrent();
    E.generate('Juego de planos generado a partir del croquis', function () {
      E.selectTab('planos'); E.showSheet('A-02');
      var out = document.querySelector('.out'); if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  function showCurrent() {
    var c = E.getCroquis(), el = $('#cqCurrent');
    el.hidden = !c; if (c) $('#cqCurName').textContent = c.name;
  }
  $('#cqRemove').addEventListener('click', function () { E.setCroquis(null); showCurrent(); E.generate('Croquis retirado del juego de planos'); });
  showCurrent();
})();
