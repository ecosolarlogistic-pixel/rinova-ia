/* RINOVAIA — Croquis y planos subidos → juego de planos, y conexión con RINOVAIA AI.
   1. El usuario sube uno o varios archivos (fotos o PDF): croquis, plantas por nivel y fachadas.
   2. Con RINOVAIA AI (supabase/functions/rinova-ia, acción «plano») Claude lee de cada planta las cotas, los
      espacios con su posición y medidas, las puertas y el nivel; de una fachada, su estilo y material.
      Sin IA, el navegador detecta muros y espacios del trazo (lectura-plano.js) y el usuario confirma las cotas.
   3. La distribución leída se guarda en el proyecto (p.sk) y el juego de planos se dibuja con ella, a escala.
      El primer plano queda como lámina A-00 y la fachada pasa a «Mejorar fachada». */
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
    readSketch: function (file) { return call('croquis', { archivo: file }, 150000); },
    readPlan: function (file) { return call('plano', { archivo: file }, 170000); },
    readFacade: function (file) { return call('fachada', { archivo: file }, 150000); }
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
  function pdfPages(buf, max) {
    return loadPdfJs().then(function (lib) { return lib.getDocument({ data: buf }).promise; }).then(function (doc) {
      var n = Math.min(max || 4, doc.numPages), out = [], chain = Promise.resolve();
      for (var i = 1; i <= n; i++) (function (k) {
        chain = chain.then(function () { return doc.getPage(k); }).then(function (page) {
          var vp0 = page.getViewport({ scale: 1 }), sc = Math.min(3, 1800 / Math.max(vp0.width, vp0.height)), vp = page.getViewport({ scale: sc });
          var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          return page.render({ canvasContext: g, viewport: vp }).promise.then(function () { out.push(c); });
        });
      })(i);
      return chain.then(function () { return out; });
    });
  }
  /* ---------- Diálogo ---------- */
  var LP = window.RinovaLecturaPlano;
  var dlg = $('#dlgCroquis'), items = [], curIdx = 0, view = 'lectura', dimsTouched = false, aiNote = '';
  var LVN = function (i) { return i === 0 ? 'Planta baja' : 'Nivel ' + i; };
  function setStatus(kind, txt) { var s = $('#cqStatus'); s.className = 'chip ' + kind; s.innerHTML = '<span class="dot"></span>' + esc(txt); }
  function fillForm(v) {
    $('#cqType').value = v.type; $('#cqFront').value = v.front; $('#cqDepth').value = v.depth; $('#cqFloors').value = v.floors;
    $('#cqBeds').value = v.beds; $('#cqBaths').value = v.baths; $('#cqHalf').value = v.halfBaths; $('#cqParking').value = v.parking;
    $('#cqLayout').value = v.layout; $('#cqUnits').value = v.units; cqTypeUI();
  }
  function num(id, a, b, d) { var v = parseFloat($(id).value); return isNaN(v) ? d : Math.max(a, Math.min(b, v)); }
  function readForm() {
    var p = E.project();
    return { type: $('#cqType').value, front: num('#cqFront', 4, 40, p.front), depth: num('#cqDepth', 4, 40, p.depth), floors: num('#cqFloors', 1, 8, p.floors) | 0,
      beds: num('#cqBeds', 0, 10, p.beds) | 0, baths: num('#cqBaths', 0, 10, p.baths) | 0, halfBaths: num('#cqHalf', 0, 6, p.halfBaths) | 0,
      parking: num('#cqParking', 0, 400, p.parking) | 0, layout: $('#cqLayout').value, units: num('#cqUnits', 1, 24, p.units) | 0 };
  }
  function notes(list) { $('#cqNotes').innerHTML = (list || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join(''); }
  function open() { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  function close() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  /* ---------- Estado de cada archivo ---------- */
  function plans() { return items.filter(function (it) { return it.role === 'planta' && (it.ai || it.geom); }).sort(function (a, b) { return a.level - b.level; }); }
  function facade() { return items.filter(function (it) { return it.role === 'fachada'; })[0]; }
  // Distribución de un archivo en metros, con las cotas que hay en el formulario
  function roomsOf(it, W, D) {
    if (it.ai) { var kx = W / it.ai.W, ky = D / it.ai.D; return { rooms: it.ai.rooms.map(function (q) { return Object.assign({}, q, { x: q.x * kx, y: q.y * ky, w: q.w * kx, h: q.h * ky }); }), doors: it.ai.doors.map(function (d) { return Object.assign({}, d, { x: d.x * kx, y: d.y * ky, w: d.w * (d.o === 'v' ? ky : kx) }); }) }; }
    return { rooms: LP.classify(it.geom, W, D, it.level), doors: [] };
  }
  function dims() { return { W: num('#cqFront', 4, 40, 10), D: num('#cqDepth', 4, 40, 10) }; }
  function hasPlan() { return plans().length > 0; }
  function dimLabels() {
    var g = hasPlan();
    $('label[for="cqFront"]').textContent = g ? 'Frente construido (m)' : 'Frente del terreno (m)';
    $('label[for="cqDepth"]').textContent = g ? 'Fondo construido (m)' : 'Fondo del terreno (m)';
  }
  // Conteos y niveles a partir de lo leído
  function syncCounts() {
    var P = plans(); if (!P.length) return;
    var d = dims(), lv = P.map(function (it) { return roomsOf(it, d.W, d.D); }), c = LP.counts(lv);
    $('#cqFloors').value = P.length; $('#cqBeds').value = c.beds; $('#cqBaths').value = c.baths; $('#cqHalf').value = c.halfBaths;
    if (c.parking) $('#cqParking').value = c.parking;
    var ai = P.filter(function (it) { return it.aiRaw; })[0];
    if (ai && ai.aiRaw.tipo && PR.TIPOS[ai.aiRaw.tipo]) $('#cqType').value = ai.aiRaw.tipo;
  }
  // Medidas: las cotas que leyó la IA; si no, la proporción del trazo con el frente actual
  function syncDims() {
    if (dimsTouched) return;
    var P = plans(), p = E.project(); if (!P.length) return;
    var ai = P.filter(function (it) { return it.ai; })[0];
    if (ai) { $('#cqFront').value = r05(ai.ai.W); $('#cqDepth').value = r05(ai.ai.D); return; }
    var W = p.sk ? p.sk.W : Math.round(p.front * 0.92 * 2) / 2;
    $('#cqFront').value = r05(W); $('#cqDepth').value = r05(W * P[0].geom.ratio);
  }
  function r05(v) { return Math.round(v * 20) / 20; }

  /* ---------- Vista de cada archivo: imagen original o la lectura a escala ---------- */
  var COL = { soc: '#FBF3DC', rec: '#E4ECF8', bano: '#DDEFF6', serv: '#EEF0F3', circ: '#FFFFFF', coch: '#F1F1F1', ext: '#E3F1E3', alm: '#F1F0EC', ofi: '#E4ECF8', com: '#FBF3DC' };
  function schematic(it) {
    var d = dims(), L = roomsOf(it, d.W, d.D), W = d.W, D = d.D, s = 100, pad = 30;
    var o = ['<svg viewBox="' + (-pad) + ' ' + (-pad) + ' ' + (W * s + pad * 2) + ' ' + (D * s + pad * 2 + 20) + '" role="img" aria-label="Lectura de ' + esc(it.name) + '" style="width:100%;height:100%">'];
    L.rooms.forEach(function (q) { o.push('<rect x="' + q.x * s + '" y="' + q.y * s + '" width="' + q.w * s + '" height="' + q.h * s + '" fill="' + (COL[q.k] || '#fff') + '" stroke="#18202B" stroke-width="4"/>'); });
    L.doors.forEach(function (dd) { var L2 = dd.w * s; o.push(dd.o === 'h' ? '<line x1="' + dd.x * s + '" y1="' + dd.y * s + '" x2="' + (dd.x * s + L2) + '" y2="' + dd.y * s + '" stroke="#fff" stroke-width="9"/>' : '<line x1="' + dd.x * s + '" y1="' + dd.y * s + '" x2="' + dd.x * s + '" y2="' + (dd.y * s + L2) + '" stroke="#fff" stroke-width="9"/>'); });
    var seen = {};
    L.rooms.forEach(function (q) {
      var key = q.g ? 'g' + q.g : null; if (key && seen[key]) return; if (key) seen[key] = 1;
      var area = key ? L.rooms.filter(function (z) { return z.g === q.g; }).reduce(function (a, z) { return a + z.w * z.h; }, 0) : q.w * q.h;
      var fs = Math.max(22, Math.min(46, Math.min(q.w, q.h) * s / 5));
      if (q.w * s < fs * 2.2 || q.h * s < fs * 1.6) return;
      o.push('<text x="' + (q.x + q.w / 2) * s + '" y="' + ((q.y + q.h / 2) * s) + '" text-anchor="middle" font-size="' + fs + '" font-weight="700" fill="#18202B">' + esc(q.n.length > 16 ? q.n.slice(0, 15) + '…' : q.n) + '</text>' +
        '<text x="' + (q.x + q.w / 2) * s + '" y="' + ((q.y + q.h / 2) * s + fs * 1.05) + '" text-anchor="middle" font-size="' + fs * 0.78 + '" fill="#5A6475">' + area.toFixed(1) + ' m²</text>');
    });
    o.push('<rect x="0" y="0" width="' + W * s + '" height="' + D * s + '" fill="none" stroke="#18202B" stroke-width="10"/>');
    o.push('<text x="' + W * s / 2 + '" y="' + (D * s + 52) + '" text-anchor="middle" font-size="34" font-weight="700" fill="#B8932A">' + W.toFixed(2) + ' × ' + D.toFixed(2) + ' m · calle ↓</text></svg>');
    return o.join('');
  }
  function renderPic() {
    var it = items[curIdx];
    if (!it) { $('#cqPic').innerHTML = '<div class="cq-load">Preparando los archivos…</div>'; return; }
    var canRead = it.role === 'planta' && (it.ai || it.geom);
    $('#cqView').hidden = !canRead;
    $$('#cqView button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === (canRead ? view : 'original')); });
    if (canRead && view === 'lectura') $('#cqPic').innerHTML = '<div class="cq-sch">' + schematic(it) + '</div>';
    else $('#cqPic').innerHTML = it.img ? '<img alt="' + esc(it.name) + '" src="' + it.img + '">' : '<div class="cq-load">' + esc(it.name) + '<br><small>No se pudo mostrar la vista previa en este navegador.</small></div>';
  }
  function roleText(it) {
    if (it.busy) return 'leyendo…';
    if (it.role === 'fachada') return 'fachada' + (it.aiFx ? ' · IA' : '');
    if (it.role === 'planta') return LVN(it.level).toLowerCase() + (it.ai ? ' · IA' : it.geom ? ' · trazo' : ' · sin lectura');
    return 'sin usar';
  }
  function renderItems() {
    $('#cqItems').hidden = !items.length;
    $('#cqItems').innerHTML = items.map(function (it, i) {
      var opts = [0, 1, 2, 3].map(function (l) { return '<option value="p' + l + '"' + (it.role === 'planta' && it.level === l ? ' selected' : '') + '>' + LVN(l) + '</option>'; }).join('') +
        '<option value="fachada"' + (it.role === 'fachada' ? ' selected' : '') + '>Fachada</option><option value="ninguno"' + (it.role === 'ninguno' ? ' selected' : '') + '>No usar</option>';
      return '<div class="cq-it' + (i === curIdx ? ' on' : '') + '" data-i="' + i + '"><button type="button" class="cq-th" data-i="' + i + '" aria-label="Ver ' + esc(it.name) + '">' + (it.thumb ? '<img alt="" src="' + it.thumb + '">' : '') + '</button>' +
        '<div class="cq-meta"><b title="' + esc(it.name) + '">' + esc(it.name) + '</b><small>' + esc(roleText(it)) + '</small>' +
        '<label class="sr" for="cqRole' + i + '">Uso del archivo</label><select class="input" id="cqRole' + i + '" data-i="' + i + '">' + opts + '</select></div></div>';
    }).join('');
    $('#cqName').textContent = items.length === 1 ? items[0].name : items.length + ' archivos';
  }
  function refresh() { dimLabels(); syncDims(); syncCounts(); renderItems(); renderPic(); explain(); }
  function explain() {
    var P = plans(), F = facade(), busy = items.some(function (it) { return it.busy; }), ai = P.some(function (it) { return it.ai; });
    if (busy) setStatus('', 'Leyendo ' + items.filter(function (it) { return it.busy; }).length + ' de ' + items.length + ' archivos…');
    else if (ai) setStatus('ok', 'Leído con RINOVAIA AI');
    else if (P.length) setStatus('warn', 'Lectura del trazo: confirma las cotas');
    else setStatus('warn', 'Sin planta legible: confirma los datos');
    var n = [];
    if (P.length) n.push('Se leyeron ' + P.length + (P.length === 1 ? ' planta' : ' plantas') + ' (' + P.map(function (it) { return LVN(it.level).toLowerCase(); }).join(', ') + '). Los planos se dibujarán con esta distribución y estas medidas.');
    if (P.length && !ai && !busy) n.push('Escribe el frente y el fondo construidos según las cotas de tu plano: la distribución se escala a esas medidas. Los nombres de los espacios son estimados; puedes cambiarlos después tocando el espacio en el plano.');
    if (F) n.push('Fachada: ' + (F.aiFx && F.aiFx.descripcion ? F.aiFx.descripcion : 'se usará como base en «Mejorar fachada»') + '.');
    if (aiNote && !busy) n.push(aiNote);
    P.forEach(function (it) { (it.notes || []).forEach(function (t) { n.push(t); }); });
    notes(n.slice(0, 9));
    $('#cqGo').disabled = busy || (!P.length && !F && !items.length);
  }

  /* ---------- Carga de archivos ---------- */
  function levelHint(name, i) {
    var s = String(name).toLowerCase();
    if (/baja|\bpb\b|ground|primer piso|first floor|planta 1\b|nivel 0/.test(s)) return 0;
    if (/alta|\bpa\b|second|segundo|nivel 1|1er nivel|planta 2\b|upper/.test(s)) return 1;
    if (/tercer|third|nivel 2|azotea|roof/.test(s)) return 2;
    return null;
  }
  function loadFile(file) {
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name), isImg = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
    if (!isPdf && !isImg) return Promise.resolve([]);
    if (file.size > 25 * 1024 * 1024) { E.toast(file.name + ' pesa más de 25 MB.'); return Promise.resolve([]); }
    var cp = isPdf ? readAs(file, 'readAsArrayBuffer').then(function (buf) { return pdfPages(buf, 4); })
      : readAs(file, 'readAsDataURL').then(loadImg).then(function (img) { return [toCanvas(img, 2000)]; });
    return cp.then(function (cs) {
      return cs.map(function (c, k) { return { name: file.name + (cs.length > 1 ? ' · pág. ' + (k + 1) : ''), file: file, isPdf: isPdf, canvas: c, img: toCanvas(c, 1600).toDataURL('image/jpeg', 0.86), thumb: toCanvas(c, 240).toDataURL('image/jpeg', 0.7) }; });
    }, function () { E.toast('No se pudo abrir ' + file.name + '. Prueba con una foto JPG.'); return []; });
  }
  function handleFiles(list) {
    list = Array.prototype.slice.call(list || []).slice(0, 8);
    if (!list.length) return;
    items = []; curIdx = 0; view = 'lectura'; dimsTouched = false; aiNote = '';
    var p = E.project();
    fillForm(p); notes([]); renderItems(); renderPic(); setStatus('', 'Abriendo archivos…'); $('#cqGo').disabled = true;
    open();
    Promise.all(list.map(loadFile)).then(function (groups) {
      items = [].concat.apply([], groups);
      if (!items.length) { setStatus('warn', 'No se pudo leer ningún archivo'); notes(['Sube fotos (JPG, PNG, HEIC) o PDF de tus croquis, plantas o fachadas.']); return; }
      // primera lectura en el navegador: ¿fachada o planta?, nivel y muros
      var next = 0;
      items.forEach(function (it, i) {
        it.role = LP.looksLikeFacade(it.canvas) ? 'fachada' : 'planta';
        if (it.role === 'planta') {
          try { it.geom = LP.detect(it.canvas); } catch (e) { it.geom = null; }
          var hn = levelHint(it.name, i); it.level = hn != null ? hn : next; next = Math.max(next, it.level + 1);
        }
        it.busy = true;
      });
      refresh();
      // lectura con RINOVAIA AI, un archivo por solicitud y en paralelo
      return Promise.all(items.map(function (it) {
        return window.RinovaIA.readPlan({ tipo: 'imagen', media_type: 'image/jpeg', datos: it.img.split(',')[1], nombre: it.name }).then(function (j) {
          var L = j.lectura || j; it.aiRaw = L;
          if (L.clase === 'fachada') { it.role = 'fachada'; it.aiFx = L.fachada; }
          else if (L.clase === 'planta') {
            var g = LP.fromAI(L); it.role = 'planta';
            if (g && g.rooms.length) { it.ai = g; it.level = Math.max(0, Math.min(3, L.nivel | 0)); }
            it.notes = (L.observaciones || []).slice(0, 4);
            if (L.cotas_leidas === false) it.notes.unshift('No se leyeron cotas en ' + it.name + ': las medidas son estimadas; corrígelas si las conoces.');
          }
        }, function (err) {
          aiNote = err && err.message === NOT_READY ? 'La lectura de nombres, cotas y puertas con RINOVAIA AI no está activa en el servidor; esta es la lectura del trazo hecha en tu navegador.' : (err && err.message) || '';
        }).then(function () { it.busy = false; refresh(); });
      }));
    });
  }

  /* ---------- Generar ---------- */
  function go() {
    var v = readForm(), p = E.project(), P = plans(), F = facade();
    if (P.length) {
      var W = v.front, D = v.depth, lv = [];
      P.forEach(function (it) { var L = roomsOf(it, W, D); lv[Math.min(it.level, 7)] = L; });
      lv = lv.filter(Boolean);
      var c = LP.counts(lv);
      p.sk = { W: W, D: D, levels: lv.map(function (L) { return { rooms: L.rooms.map(function (q) { return { n: q.n, k: q.k, x: r2(q.x), y: r2(q.y), w: r2(q.w), h: r2(q.h), g: q.g || null }; }), doors: L.doors }; }), by: P.some(function (it) { return it.ai; }) ? 'RINOVAIA AI' : 'lectura del trazo', at: Date.now() };
      // la distribución anterior ya no aplica: muros movidos y nombres de espacios leídos antes
      p.walls = { m: [], x: [] };
      Object.keys(p.rooms || {}).forEach(function (k) { if (/^sk/.test(k)) delete p.rooms[k]; });
      v.floors = lv.length; v.beds = v.beds || c.beds; v.baths = v.baths || c.baths; v.halfBaths = v.halfBaths || c.halfBaths;
      v.front = Math.min(40, Math.max(p.front, Math.ceil(W + 1))); v.depth = Math.min(40, Math.max(p.depth, Math.ceil(D + 6)));
      v.bays = Math.max(3, Math.min(9, Math.round(W / 3.6)));
    } else if (p.sk) delete p.sk;
    E.apply(v);
    var first = P[0] || items[0];
    if (first) E.setCroquis({ img: first.thumb && first.canvas ? toCanvas(first.canvas, 1200).toDataURL('image/jpeg', 0.72) : first.img, name: first.name, by: P.length ? p.sk.by : 'lectura asistida', at: Date.now() });
    if (F && window.RinovaFachadaUp) window.RinovaFachadaUp(F.file, { quiet: true, ai: F.aiFx || null });
    close(); showCurrent();
    E.generate(P.length ? 'Juego de planos dibujado con la distribución de tu plano' : 'Juego de planos generado a partir del croquis', function () {
      E.selectTab('planos'); E.showSheet('A-02');
      var out = document.querySelector('.out'); if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  function cqTypeUI() { var t = $('#cqType').value, res = t === 'casa' || t === 'deptos'; $('#cqUnits').closest('.field').style.visibility = t === 'casa' ? 'hidden' : ''; $('#cqBeds').closest('.field').style.visibility = res ? '' : 'hidden'; }
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  $('#cqType').addEventListener('change', cqTypeUI);
  $('#upCroquis').addEventListener('change', function (e) { handleFiles(e.target.files); e.target.value = ''; });
  $('#cqClose').addEventListener('click', close);
  $('#cqCancel').addEventListener('click', close);
  ['#cqFront', '#cqDepth'].forEach(function (id) { $(id).addEventListener('input', function () { dimsTouched = true; syncCounts(); renderPic(); }); });
  $('#cqItems').addEventListener('click', function (e) { var b = e.target.closest('.cq-th'); if (!b) return; curIdx = +b.dataset.i; renderItems(); renderPic(); });
  $('#cqItems').addEventListener('change', function (e) {
    var s = e.target.closest('select[data-i]'); if (!s) return; var it = items[+s.dataset.i];
    if (s.value === 'fachada' || s.value === 'ninguno') it.role = s.value; else { it.role = 'planta'; it.level = +s.value.slice(1); if (!it.geom && !it.ai) { try { it.geom = LP.detect(it.canvas); } catch (er) { } } }
    curIdx = +s.dataset.i; refresh();
  });
  $('#cqView').addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b) return; view = b.dataset.v; renderPic(); });
  $('#cqGo').addEventListener('click', go);
  // Soltar archivos sobre la caja de carga
  var box = $('.cq-up');
  box.addEventListener('dragover', function (e) { e.preventDefault(); box.classList.add('drag'); });
  box.addEventListener('dragleave', function () { box.classList.remove('drag'); });
  box.addEventListener('drop', function (e) { e.preventDefault(); box.classList.remove('drag'); handleFiles(e.dataTransfer.files); });
  function showCurrent() {
    var c = E.getCroquis(), el = $('#cqCurrent'), p = E.project();
    el.hidden = !c && !p.sk; if (!el.hidden) $('#cqCurName').textContent = (c ? c.name : 'plano subido') + (p.sk ? ' · distribución ' + p.sk.W.toFixed(2) + ' × ' + p.sk.D.toFixed(2) + ' m' : '');
  }
  $('#cqRemove').addEventListener('click', function () {
    var p = E.project(); E.setCroquis(null);
    if (p.sk) { delete p.sk; p.walls = { m: [], x: [] }; }
    showCurrent(); E.generate('Croquis retirado: los planos vuelven a generarse con el programa del formulario');
  });
  showCurrent();
  window.RinovaCroquis = { open: handleFiles };
})();
