/* Rinova AI — Estudio de diseño (maqueta funcional).
   Toda la lógica corre en el navegador con fórmulas simplificadas de demostración.
   En producción, compute() se sustituye por llamadas a la API (ver docs/ARQUITECTURA.md):
     POST /api/v1/proyectos/{id}/generar  → render (difusión), FEA, vectores DXF/SVG y metrajes. */
(function () {
  'use strict';
  var F = window.RinovaFacade, PHI = F.PHI;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var CITIES = {
    cdmx: { name: 'Ciudad de México', lat: 19.43, zone: 'Alta · suelo blando', c: 0.40, q: 60, f: 1.08, wind: 0.9 },
    gdl: { name: 'Guadalajara', lat: 20.67, zone: 'Media', c: 0.32, q: 160, f: 1.0, wind: 0.8 },
    mty: { name: 'Monterrey', lat: 25.69, zone: 'Baja', c: 0.16, q: 200, f: 1.04, wind: 1.0 },
    pue: { name: 'Puebla', lat: 19.04, zone: 'Alta', c: 0.36, q: 140, f: 0.96, wind: 0.8 },
    qro: { name: 'Querétaro', lat: 20.59, zone: 'Baja', c: 0.18, q: 180, f: 1.0, wind: 0.8 },
    mid: { name: 'Mérida', lat: 20.97, zone: 'Muy baja', c: 0.08, q: 220, f: 0.97, wind: 1.2 },
    cun: { name: 'Cancún', lat: 21.16, zone: 'Muy baja · huracanes', c: 0.08, q: 120, f: 1.12, wind: 1.6 }
  };
  var STYLE_NAME = { renacentista: 'clásico renacentista', mediterraneo: 'mediterráneo', moderno: 'contemporáneo' };
  var FINISH = { eco: { name: 'Económico', cm: 4.8, unit: 9800 }, med: { name: 'Medio', cm: 5.3, unit: 15200 }, pre: { name: 'Premium', cm: 5.9, unit: 23500 } };
  var MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var USD = 18.5;

  var DEFAULT = { name: 'Villa Fiorentina', front: 18, depth: 22, floors: 3, bays: 7, style: 'renacentista', use: 'res', finish: 'pre', city: 'cdmx', palette: 'travertino', month: 6, hour: 17, phi: false, line: false, cur: 'MXN' };
  var KEY = 'rinova.estudio.v1';
  var p = Object.assign({}, DEFAULT);
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) p = Object.assign(p, saved); } catch (e) { }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { } }

  /* ---------- Formatos ---------- */
  var nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  function money(v, compact) {
    var cur = p.cur, x = cur === 'USD' ? v / USD : v;
    if (compact) return (x >= 1e6 ? '$' + nf2.format(x / 1e6) + ' M' : '$' + nf0.format(Math.round(x / 1000)) + ' mil');
    return '$' + nf0.format(Math.round(x)) + ' ' + cur;
  }
  function pct(u) { return Math.round(u * 100) + ' %'; }
  function stateOf(u) { return u <= 0.7 ? 'ok' : u <= 0.9 ? 'warn' : 'bad'; }
  function colorOf(u) { return { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)' }[stateOf(u)]; }
  var STATE_TXT = { ok: 'Cumple', warn: 'Cumple al límite', bad: 'No cumple' };

  /* ---------- Cálculo (demostración) ---------- */
  function compute() {
    var city = CITIES[p.city], fin = FINISH[p.finish];
    var W = p.front * 0.92, D = p.depth * 0.82;
    var footprint = W * D, area = footprint * p.floors;
    var L = W / p.bays;                       // claro en fachada
    var rows = Math.max(2, Math.round(D / 5.5));
    var Ly = D / rows;                         // claro perpendicular
    var CM = fin.cm, CV = p.use === 'com' ? 3.5 : 1.9;
    var Wu = 1.2 * CM + 1.6 * CV;              // kPa
    var amp = 1 + city.c * 0.6;

    // Vigas
    var Lb = Math.max(L, Ly);
    var wb = Wu * Math.min(L, Ly) + 3.6;
    var Mu = wb * Lb * Lb / 10 * amp;
    var BEAMS = [[25, 40], [25, 50], [30, 60], [35, 70], [40, 80], [45, 90]];
    var beam = pick(BEAMS, function (s) { var d = (s[1] - 5) / 100; return 3000 * s[0] / 100 * d * d; }, Mu);

    // Columnas
    var Pu = Wu * L * Ly * p.floors * 1.1 * (1 + city.c * 0.5);
    var COLS = [[30, 30], [35, 35], [40, 40], [45, 45], [50, 50], [60, 60], [70, 70]];
    var minCol = city.c >= 0.3 ? 1 : 0;
    var col = pick(COLS.slice(minCol), function (s) { return 0.55 * 25000 * s[0] / 100 * s[1] / 100; }, Pu);
    var PuUp = Pu * (p.floors - 1) / p.floors;
    var colUp = p.floors > 1 ? pick(COLS.slice(minCol), function (s) { return 0.55 * 25000 * s[0] / 100 * s[1] / 100; }, PuUp) : null;

    // Losa
    var hs = Math.max(10, Math.ceil(Math.min(L, Ly) * 100 / 28));
    var MuS = Wu * Math.pow(Math.min(L, Ly), 2) / 8;
    var capS = 3000 * Math.pow((hs - 2.5) / 100, 2);

    // Cimentación
    var Ps = Pu / 1.4, side = Math.sqrt(Ps / city.q), found;
    if (side > 0.8 * Math.min(L, Ly)) {
      var qd = (CM + CV) * p.floors * 1.1;
      found = { name: 'Losa de cimentación', sec: 'h = ' + (p.floors > 3 ? 40 : 30) + ' cm', dem: qd, cap: city.q, unit: 'kPa' };
    } else {
      var sr = Math.ceil(side * 10) / 10 + 0.2;
      found = { name: 'Zapata aislada Z-1', sec: nf1.format(sr) + ' × ' + nf1.format(sr) + ' m', dem: Ps, cap: city.q * sr * sr, unit: 'kN' };
    }

    // Sismo y desplazamiento
    var Wt = (CM + 0.4 * CV) * area;
    var V = city.c / 2 * Wt;
    var drift = 0.0035 + 0.0016 * p.floors * (city.c / 0.2) * (p.style === 'moderno' ? 1.1 : 1);
    var driftLim = 0.015;

    var elements = [
      { name: 'Viga principal V-1', sec: beam.s[0] + ' × ' + beam.s[1] + ' cm', dem: Mu, cap: beam.cap, unit: 'kN·m' },
      { name: 'Columna C-1 · planta baja', sec: col.s[0] + ' × ' + col.s[1] + ' cm', dem: Pu, cap: col.cap, unit: 'kN' }
    ];
    if (colUp) elements.push({ name: 'Columna C-2 · niveles superiores', sec: colUp.s[0] + ' × ' + colUp.s[1] + ' cm', dem: PuUp, cap: colUp.cap, unit: 'kN' });
    elements.push({ name: 'Losa de entrepiso L-1', sec: 'maciza h = ' + hs + ' cm', dem: MuS, cap: capS, unit: 'kN·m/m' });
    elements.push(found);
    elements.push({ name: 'Desplazamiento lateral', sec: 'marcos dúctiles Q = 2', dem: drift, cap: driftLim, unit: 'Δ/h', ratio: true });
    elements.forEach(function (e) { e.u = e.dem / e.cap; e.st = stateOf(e.u); });
    var worst = elements.reduce(function (a, e) { return Math.max(a, e.u); }, 0);

    // Eléctrico
    var circ = [], i, flArea = footprint;
    for (i = 0; i < p.floors; i++) {
      var lvl = i === 0 ? 'PB' : 'N' + i;
      var nl = Math.max(1, Math.round(flArea / 120)), nc = Math.max(1, Math.round(flArea / 80));
      for (var a = 0; a < nl; a++) circ.push({ use: 'Alumbrado ' + lvl, br: '1P-15A', kw: 0.9 });
      for (var b = 0; b < nc; b++) circ.push({ use: 'Contactos ' + lvl, br: '1P-20A', kw: 1.5 });
      if (p.finish === 'pre') circ.push({ use: 'Aire acondicionado ' + lvl, br: '2P-30A', kw: 2.6 });
      if (p.use === 'com') circ.push({ use: 'Fuerza ' + lvl, br: '2P-30A', kw: 3.0 });
    }
    circ.push({ use: p.use === 'com' ? 'Cocineta / servicio' : 'Cocina', br: '1P-20A', kw: 2.4 });
    circ.push({ use: 'Lavado y bombeo', br: '1P-20A', kw: 1.8 });
    var kw = circ.reduce(function (s, c) { return s + c.kw; }, 0), kwd = kw * 0.6;
    var tri = kwd > 10;
    var I = kwd * 1000 / (tri ? 220 * 1.732 * 0.9 : 220 * 0.9);
    var MAIN = [40, 50, 63, 70, 100, 125, 150, 200, 250];
    var main = MAIN.filter(function (m) { return m >= I * 1.25; })[0] || 250;

    // Costos
    var styleF = { renacentista: 1.12, mediterraneo: 1.05, moderno: 1 }[p.style];
    var heightF = 1 + Math.max(0, p.floors - 3) * 0.03;
    var unit = fin.unit * styleF * city.f * heightF * (p.use === 'com' ? 1.06 : 1);
    var total = unit * area;
    var parts = [
      ['Preliminares y cimentación', 11 + (found.name.indexOf('Losa') === 0 ? 3 : 0)],
      ['Estructura', 23 + (city.c >= 0.3 ? 2 : 0)],
      ['Albañilería y muros', 15],
      ['Instalación eléctrica', 7],
      ['Instalación hidrosanitaria', 7],
      ['Acabados interiores', 19 + (p.finish === 'pre' ? 4 : 0)],
      ['Fachada y ornamentación', 6 + (p.style === 'renacentista' ? 5 : p.style === 'mediterraneo' ? 2 : 0)],
      ['Honorarios, licencias e IA', 6]
    ];
    var sum = parts.reduce(function (s, x) { return s + x[1]; }, 0);
    parts = parts.map(function (x) { return { name: x[0], pct: x[1] / sum, v: total * x[1] / sum }; });

    return { city: city, fin: fin, W: W, D: D, L: L, Ly: Ly, rows: rows, footprint: footprint, area: area, Wu: Wu, CV: CV, V: V,
      elements: elements, worst: worst, beam: beam, col: col, circ: circ, kw: kw, kwd: kwd, tri: tri, main: main, unit: unit, total: total, parts: parts, drift: drift };
  }
  function pick(list, capFn, dem) {
    for (var i = 0; i < list.length; i++) { var cap = capFn(list[i]); if (dem / cap <= 0.82) return { s: list[i], cap: cap }; }
    var l = list[list.length - 1]; return { s: l, cap: capFn(l) };
  }

  /* ---------- Render ---------- */
  function renderFacade(r) {
    $('#renderOut').innerHTML = F.build({ floors: p.floors, bays: p.bays, style: p.style, mode: p.line ? 'line' : 'render', phi: p.phi,
      lat: r.city.lat, month: p.month, hour: p.hour, palette: p.palette, width: 1000, height: 600, id: 'r', frontM: p.front });
    var s = F.sun(r.city.lat, p.month, p.hour);
    $('#sunChip').textContent = 'Sol ' + Math.round(Math.max(0, s.elevation)) + '° · ' + r.city.name;
    $('#phiChip').textContent = 'φ ' + PHI.toFixed(3) + ' · ' + p.bays + ' crujías';
    $('#renderOut').parentElement.style.setProperty('--f-line', '#24436e');
  }
  var VARIANTS = [
    { label: 'Mañana', o: { hour: 9 } }, { label: 'Atardecer', o: { hour: 18.5 } },
    { label: 'Mármol', o: { palette: 'marmol' } }, { label: 'Terracota', o: { palette: 'terracota' } }
  ];
  function renderVariants(r) {
    $('#variants').innerHTML = VARIANTS.map(function (v, i) {
      var o = Object.assign({ floors: p.floors, bays: p.bays, style: p.style, mode: 'render', phi: false, lat: r.city.lat, month: p.month, hour: p.hour, palette: p.palette, width: 600, height: 380, id: 'v' + i }, v.o);
      var pressed = Object.keys(v.o).every(function (k) { return p[k] === v.o[k]; });
      return '<button type="button" data-var="' + i + '" aria-pressed="' + pressed + '">' + F.build(o) + '<small>' + v.label + '</small></button>';
    }).join('');
  }

  /* ---------- Estructura ---------- */
  function renderStructure(r) {
    $('#structOut').innerHTML = r.elements.map(function (e) {
      var dem = e.ratio ? nf2.format(e.dem * 100) : nf1.format(e.dem);
      var cap = e.ratio ? nf2.format(e.cap * 100) + ' %' : nf1.format(e.cap) + ' ' + e.unit;
      return '<tr><td><b>' + esc(e.name) + '</b></td><td>' + esc(e.sec) + '</td><td class="r num">' + dem + '</td><td class="r num">' + cap + '</td>' +
        '<td><div style="display:flex;gap:8px;align-items:center;white-space:nowrap"><div class="ubar" style="flex:1"><i style="width:' + Math.min(100, e.u * 100) + '%;background:' + colorOf(e.u) + '"></i></div><span class="num" style="font-size:13px">' + pct(e.u) + '</span></div></td>' +
        '<td><span class="chip ' + e.st + '"><span class="dot"></span>' + STATE_TXT[e.st] + '</span></td></tr>';
    }).join('');
    var crit = [
      ['Ubicación', r.city.name], ['Zona sísmica', r.city.zone], ['Coeficiente sísmico c', nf2.format(r.city.c)],
      ['Cortante basal', nf0.format(r.V) + ' kN'], ['Carga viva', nf1.format(r.CV) + ' kPa'],
      ['Carga última Wu', nf2.format(r.Wu) + ' kPa'], ['Capacidad del suelo', r.city.q + ' kPa'], ['Concreto / acero', "f'c 250 · fy 4,200"]
    ], rowsC = [];
    for (var ci = 0; ci < crit.length; ci += 2) rowsC.push('<tr>' + crit.slice(ci, ci + 2).map(function (x) { return '<td><small class="muted" style="display:block;font-size:12px">' + x[0] + '</small><b>' + esc(x[1]) + '</b></td>'; }).join('') + '</tr>');
    $('#critOut').innerHTML = rowsC.join('');

    // Marco en fachada
    var W = 520, H = 300, m = 30, bays = Math.min(p.bays, 9), fl = p.floors;
    var bw = (W - 2 * m) / bays, fh = (H - 2 * m) / fl, out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Marco estructural con uso por elemento">'];
    var uB = r.elements[0].u, uC = r.elements[1].u, uC2 = r.elements[2] && r.elements[2].name.indexOf('C-2') > -1 ? r.elements[2].u : uC;
    out.push('<line x1="10" y1="' + (H - m) + '" x2="' + (W - 10) + '" y2="' + (H - m) + '" stroke="#1c1712" stroke-width="2"/>');
    for (var j = 0; j < fl; j++) {
      var y = H - m - fh * (j + 1);
      for (var i = 0; i < bays; i++) {
        var k = 0.82 + 0.18 * Math.sin((i + 1) * 1.7 + j); // variación por posición
        var u = uB * k * (1 - j * 0.04);
        out.push('<line x1="' + (m + bw * i) + '" y1="' + y + '" x2="' + (m + bw * (i + 1)) + '" y2="' + y + '" stroke="' + colorOf(u) + '" stroke-width="5" stroke-linecap="round"><title>Viga nivel ' + (j + 1) + ', eje ' + (i + 1) + ': ' + pct(u) + '</title></line>');
      }
      for (i = 0; i <= bays; i++) {
        var edge = (i === 0 || i === bays) ? 0.62 : 1;
        var uc = (j === 0 ? uC : uC2) * edge * (1 - j / (fl + 1) * 0.5);
        out.push('<line x1="' + (m + bw * i) + '" y1="' + (y + fh) + '" x2="' + (m + bw * i) + '" y2="' + y + '" stroke="' + colorOf(uc) + '" stroke-width="4" opacity=".9"><title>Columna eje ' + (i + 1) + ', nivel ' + (j + 1) + ': ' + pct(uc) + '</title></line>');
      }
    }
    for (i = 0; i <= bays; i++) out.push('<rect x="' + (m + bw * i - 7) + '" y="' + (H - m) + '" width="14" height="6" fill="#6b604f"/>');
    out.push('</svg>');
    $('#frameOut').innerHTML = out.join('');
  }

  /* ---------- Planos ---------- */
  function roomsFor(level) {
    if (p.use === 'com') return level === 0 ? { front: ['Área de venta', 'Exhibición', 'Recepción'], back: ['Sanitarios', 'Escalera', 'Bodega'] } : { front: ['Oficina abierta', 'Sala de juntas', 'Dirección'], back: ['Sanitarios', 'Escalera', 'Archivo'] };
    if (level === 0) return { front: ['Sala', 'Comedor', 'Cocina'], back: ['Baño visitas', 'Escalera', 'Estudio'] };
    if (level === p.floors - 1 && p.floors > 2) return { front: ['Recámara principal', 'Terraza', 'Vestidor'], back: ['Baño principal', 'Escalera', 'Biblioteca'] };
    return { front: ['Recámara 1', 'Estancia familiar', 'Recámara 2'], back: ['Baño', 'Escalera', 'Lavado'] };
  }
  function renderPlan(r) {
    var level = +($('#planLevel').value || 0);
    var VW = 960, VH = 680, mL = 90, mT = 80;
    var s = Math.min((VW - mL - 80) / r.W, (VH - mT - 90) / r.D);
    var W = r.W * s, D = r.D * s, x0 = mL + ((VW - mL - 80) - W) / 2, y0 = mT;
    var on = {}; $$('#layers input[data-layer]').forEach(function (c) { on[c.dataset.layer] = c.checked; });
    var rooms = roomsFor(level), o = [];
    var hFront = D / PHI, hBack = D - hFront, yMid = y0 + hBack;
    var wf = [PHI, 1, 1 / PHI], wbk = [1 / PHI, 1 / PHI * 0.8, 1];
    function split(ws) { var t = ws.reduce(function (a, b) { return a + b; }, 0), acc = 0; return ws.map(function (w) { var a = acc; acc += w / t * W; return [x0 + a, w / t * W]; }); }
    var fr = split(wf), bk = split(wbk);
    var cells = fr.map(function (c, i) { return { x: c[0], y: yMid, w: c[1], h: hFront, name: rooms.front[i] }; })
      .concat(bk.map(function (c, i) { return { x: c[0], y: y0, w: c[1], h: hBack, name: rooms.back[i] }; }));

    o.push('<svg class="plan-svg" id="planSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" font-family="Manrope,system-ui,sans-serif">');
    o.push('<rect width="' + VW + '" height="' + VH + '" fill="#fbf8f0"/>');
    // Ejes
    var bx = W / p.bays, i, j;
    if (on.arq) {
      o.push('<g stroke="#b9ad98" stroke-width=".8" stroke-dasharray="8 4 2 4">');
      for (i = 0; i <= p.bays; i++) o.push('<line x1="' + (x0 + bx * i) + '" y1="' + (y0 - 40) + '" x2="' + (x0 + bx * i) + '" y2="' + (y0 + D + 12) + '"/>');
      for (j = 0; j <= r.rows; j++) o.push('<line x1="' + (x0 - 40) + '" y1="' + (y0 + D / r.rows * j) + '" x2="' + (x0 + W + 12) + '" y2="' + (y0 + D / r.rows * j) + '"/>');
      o.push('</g><g font-size="11" font-weight="700" fill="#24436e" text-anchor="middle">');
      for (i = 0; i <= p.bays; i++) o.push('<circle cx="' + (x0 + bx * i) + '" cy="' + (y0 - 52) + '" r="11" fill="#fbf8f0" stroke="#24436e"/><text x="' + (x0 + bx * i) + '" y="' + (y0 - 48) + '">' + (i + 1) + '</text>');
      for (j = 0; j <= r.rows; j++) o.push('<circle cx="' + (x0 - 52) + '" cy="' + (y0 + D / r.rows * j) + '" r="11" fill="#fbf8f0" stroke="#24436e"/><text x="' + (x0 - 52) + '" y="' + (y0 + D / r.rows * j + 4) + '">' + String.fromCharCode(65 + j) + '</text>');
      o.push('</g>');
      // Columnas
      o.push('<g fill="#1c1712">');
      for (i = 0; i <= p.bays; i++) for (j = 0; j <= r.rows; j++) o.push('<rect x="' + (x0 + bx * i - 4) + '" y="' + (y0 + D / r.rows * j - 4) + '" width="8" height="8"/>');
      o.push('</g>');
      // Muros
      o.push('<g fill="none" stroke="#1c1712" stroke-linecap="square">');
      o.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + W + '" height="' + D + '" stroke-width="5"/>');
      o.push('<line x1="' + x0 + '" y1="' + yMid + '" x2="' + (x0 + W) + '" y2="' + yMid + '" stroke-width="3"/>');
      cells.forEach(function (c, k) { if (k !== 0 && k !== 3) o.push('<line x1="' + c.x + '" y1="' + c.y + '" x2="' + c.x + '" y2="' + (c.y + c.h) + '" stroke-width="3"/>'); });
      o.push('</g>');
      // Puertas (vano + abatimiento)
      var dw = Math.min(0.9 * s, 34);
      cells.forEach(function (c, k) {
        var dx = k < 3 ? c.x + c.w * 0.5 - dw / 2 : c.x + c.w * 0.5 - dw / 2, dy = yMid;
        if (k === 1 && level > 0) return;
        o.push('<rect x="' + dx + '" y="' + (dy - 3) + '" width="' + dw + '" height="6" fill="#fbf8f0"/>');
        o.push('<path d="M' + dx + ' ' + dy + ' v' + (k < 3 ? dw : -dw) + ' A' + dw + ' ' + dw + ' 0 0 ' + (k < 3 ? 0 : 1) + ' ' + (dx + dw) + ' ' + dy + '" fill="none" stroke="#6b604f" stroke-width="1"/>');
      });
      if (level === 0) { var ex = fr[0][0] + fr[0][1] * 0.5 - dw * 0.7; o.push('<rect x="' + ex + '" y="' + (y0 + D - 3) + '" width="' + dw * 1.4 + '" height="6" fill="#fbf8f0"/><text x="' + (ex + dw * 0.7) + '" y="' + (y0 + D + 22) + '" font-size="11" text-anchor="middle" fill="#6b604f">ACCESO</text>'); }
      // Ventanas en fachada
      o.push('<g stroke="#24436e" stroke-width="1.5">');
      for (i = 0; i < p.bays; i++) { var wx = x0 + bx * i + bx * 0.25; if (level === 0 && Math.abs(wx + bx * 0.25 - (fr[0][0] + fr[0][1] * 0.5)) < bx * 0.6) continue; o.push('<line x1="' + wx + '" y1="' + (y0 + D - 2) + '" x2="' + (wx + bx * 0.5) + '" y2="' + (y0 + D - 2) + '"/><line x1="' + wx + '" y1="' + (y0 + D + 2) + '" x2="' + (wx + bx * 0.5) + '" y2="' + (y0 + D + 2) + '"/>'); }
      o.push('</g>');
      // Nombres
      o.push('<g text-anchor="middle" fill="#1c1712">');
      cells.forEach(function (c) { var m2 = (c.w / s) * (c.h / s); o.push('<text x="' + (c.x + c.w / 2) + '" y="' + (c.y + c.h / 2 - 4) + '" font-size="' + (c.w > 120 ? 14 : 11) + '" font-weight="700">' + esc(c.name) + '</text><text x="' + (c.x + c.w / 2) + '" y="' + (c.y + c.h / 2 + 13) + '" font-size="11" fill="#6b604f">' + nf1.format(m2) + ' m²</text>'); });
      o.push('</g>');
      // Escalera
      var st = cells[4]; o.push('<g stroke="#6b604f" stroke-width="1">'); for (i = 1; i < 10; i++) o.push('<line x1="' + (st.x + 10) + '" y1="' + (st.y + st.h * i / 10) + '" x2="' + (st.x + st.w - 10) + '" y2="' + (st.y + st.h * i / 10) + '"/>'); o.push('</g>');
    }
    // Hidráulico
    if (on.hid) {
      var kit = p.use === 'com' ? cells[5] : (level === 0 ? cells[2] : cells[5]), bath = cells[3];
      var tx = x0 + 12, ty = y0 + D - 12;
      o.push('<g fill="none" stroke-width="2"><path d="M' + tx + ' ' + (y0 + D + 30) + ' V' + ty + ' H' + (bath.x + 18) + ' V' + (bath.y + 26) + '" stroke="#2f6db0"/>');
      o.push('<path d="M' + (bath.x + 18) + ' ' + (bath.y + bath.h * 0.6) + ' H' + (kit.x + kit.w - 24) + ' V' + (kit.y + 24) + '" stroke="#2f6db0"/>');
      o.push('<path d="M' + (bath.x + bath.w - 22) + ' ' + (bath.y + 18) + ' H' + (kit.x + kit.w - 34) + ' V' + (kit.y + 34) + '" stroke="#c0492f" stroke-dasharray="6 4"/></g>');
      o.push('<g fill="#fbf8f0" stroke="#2f6db0" stroke-width="1.5"><ellipse cx="' + (bath.x + 22) + '" cy="' + (bath.y + 30) + '" rx="9" ry="12"/><rect x="' + (bath.x + bath.w - 34) + '" y="' + (bath.y + 10) + '" width="22" height="16" rx="3"/><rect x="' + (kit.x + kit.w - 46) + '" y="' + (kit.y + 14) + '" width="34" height="18" rx="2"/></g>');
      o.push('<g font-size="10" fill="#2f6db0" font-weight="700"><text x="' + (tx + 6) + '" y="' + (y0 + D + 34) + '">TOMA Ø 19 mm</text><text x="' + (bath.x + bath.w - 26) + '" y="' + (bath.y + 42) + '" fill="#c0492f">CAL.</text></g>');
    }
    // Eléctrico
    if (on.ele) {
      var tb = { x: x0 + 22, y: yMid + 16 };
      o.push('<g stroke="#b0823a" fill="none" stroke-width="1.2">');
      cells.forEach(function (c, k) {
        var cx = c.x + c.w / 2, cy = c.y + c.h * 0.28;
        o.push('<path d="M' + cx + ' ' + cy + ' V' + (yMid + (k < 3 ? 10 : -10)) + ' H' + tb.x + '" stroke-dasharray="5 3" opacity=".75"/>');
      });
      o.push('</g><g stroke="#b0823a" stroke-width="1.4" fill="#fbf8f0">');
      cells.forEach(function (c) {
        var cx = c.x + c.w / 2, cy = c.y + c.h * 0.28;
        o.push('<circle cx="' + cx + '" cy="' + cy + '" r="7"/><path d="M' + (cx - 5) + ' ' + (cy - 5) + 'l10 10M' + (cx + 5) + ' ' + (cy - 5) + 'l-10 10"/>');
        [[c.x + 8, c.y + c.h * 0.7], [c.x + c.w - 8, c.y + c.h * 0.7]].forEach(function (pt, q) {
          o.push('<path d="M' + pt[0] + ' ' + (pt[1] - 6) + ' a6 6 0 0 ' + (q ? 0 : 1) + ' 0 12z"/>');
        });
      });
      o.push('</g><rect x="' + (tb.x - 10) + '" y="' + (tb.y - 8) + '" width="20" height="16" fill="#b0823a"/><text x="' + (tb.x + 16) + '" y="' + (tb.y + 4) + '" font-size="10" font-weight="700" fill="#b0823a">TAB-' + (level === 0 ? 'P' : 'N' + level) + '</text>');
    }
    // Cotas
    if (on.cot) {
      o.push('<g stroke="#b0823a" fill="#b0823a" font-size="12" font-weight="600" stroke-width="1">');
      var cy2 = y0 + D + 52;
      o.push('<line x1="' + x0 + '" y1="' + cy2 + '" x2="' + (x0 + W) + '" y2="' + cy2 + '"/><line x1="' + x0 + '" y1="' + (cy2 - 7) + '" x2="' + x0 + '" y2="' + (cy2 + 7) + '"/><line x1="' + (x0 + W) + '" y1="' + (cy2 - 7) + '" x2="' + (x0 + W) + '" y2="' + (cy2 + 7) + '"/>');
      o.push('<text x="' + (x0 + W / 2) + '" y="' + (cy2 - 6) + '" text-anchor="middle" stroke="none">' + nf2.format(r.W) + ' m</text>');
      var cx2 = x0 + W + 40;
      o.push('<line x1="' + cx2 + '" y1="' + y0 + '" x2="' + cx2 + '" y2="' + (y0 + D) + '"/><line x1="' + (cx2 - 7) + '" y1="' + y0 + '" x2="' + (cx2 + 7) + '" y2="' + y0 + '"/><line x1="' + (cx2 - 7) + '" y1="' + (y0 + D) + '" x2="' + (cx2 + 7) + '" y2="' + (y0 + D) + '"/>');
      o.push('<text x="' + (cx2 + 8) + '" y="' + (y0 + D / 2) + '" stroke="none" transform="rotate(90 ' + (cx2 + 8) + ' ' + (y0 + D / 2) + ')" text-anchor="middle">' + nf2.format(r.D) + ' m</text>');
      o.push('<text x="' + (x0 + bx / 2) + '" y="' + (y0 - 70) + '" text-anchor="middle" stroke="none" font-size="11">' + nf2.format(r.L) + ' m</text>');
      o.push('</g>');
    }
    // Cuadro de datos
    o.push('<g font-size="11" fill="#6b604f"><text x="' + (VW - 20) + '" y="' + (VH - 34) + '" text-anchor="end" font-weight="700" fill="#1c1712">' + esc(p.name.toUpperCase()) + ' · PLANTA ' + (level === 0 ? 'BAJA' : 'NIVEL ' + level) + '</text><text x="' + (VW - 20) + '" y="' + (VH - 18) + '" text-anchor="end">Rinova AI · Lámina ' + (level === 0 ? 'A-02' : 'A-0' + (level + 2)) + ' · Esc. gráfica</text></g>');
    o.push('</svg>');
    $('#planOut').innerHTML = o.join('');
  }
  function renderUnifilar(r) {
    var n = r.circ.length, rowH = 26, H = 90 + n * rowH, W = 680, bus = 230, o = [];
    o.push('<svg viewBox="0 0 ' + W + ' ' + H + '" style="min-width:540px;width:100%" font-family="Manrope,system-ui,sans-serif" font-size="12">');
    o.push('<g stroke="#1c1712" stroke-width="1.6" fill="none"><path d="M20 50h50"/><circle cx="92" cy="50" r="22"/><path d="M114 50h40"/><rect x="154" y="34" width="56" height="32" rx="4"/><path d="M210 50h' + (bus - 210) + '"/><path d="M' + bus + ' 40V' + (60 + n * rowH) + '" stroke-width="4"/></g>');
    o.push('<g fill="#1c1712"><text x="20" y="36" font-weight="700">CFE</text><text x="92" y="55" text-anchor="middle" font-weight="700">M</text><text x="182" y="54" text-anchor="middle" font-size="10" font-weight="700">' + (r.tri ? '3P' : '2P') + '-' + r.main + 'A</text>');
    o.push('<text x="20" y="90" fill="#6b604f">Acometida ' + (r.tri ? 'trifásica 220/127 V' : 'bifásica 220/127 V') + '</text><text x="20" y="108" fill="#6b604f">Carga instalada ' + nf1.format(r.kw) + ' kW</text><text x="20" y="126" fill="#6b604f">Demanda (FD 0.6) ' + nf1.format(r.kwd) + ' kW</text></g>');
    r.circ.forEach(function (c, i) {
      var y = 60 + i * rowH + rowH / 2;
      o.push('<g stroke="#b0823a" stroke-width="1.4" fill="none"><path d="M' + bus + ' ' + y + 'h40"/><path d="M' + (bus + 40) + ' ' + y + ' q10 -12 20 0"/><path d="M' + (bus + 60) + ' ' + y + 'h40"/></g>');
      o.push('<text x="' + (bus + 110) + '" y="' + (y + 4) + '" fill="#1c1712"><tspan font-weight="700">C' + (i + 1) + '</tspan>  ' + esc(c.use) + '</text><text x="' + (W - 20) + '" y="' + (y + 4) + '" text-anchor="end" fill="#6b604f">' + c.br + ' · ' + nf1.format(c.kw) + ' kW</text>');
    });
    o.push('</svg>');
    $('#uniOut').innerHTML = o.join('');
  }

  /* ---------- Costos ---------- */
  var COLORS = ['#1c1712', '#3a3126', '#b0823a', '#d6b26a', '#24436e', '#6b8fb8', '#8c6a43', '#a99d88'];
  function renderCosts(r) {
    var max = Math.max.apply(null, r.parts.map(function (x) { return x.pct; }));
    $('#costOut').innerHTML = r.parts.map(function (x, i) {
      return '<div class="cb"><span>' + esc(x.name) + '</span><div class="track"><i style="width:' + (x.pct / max * 100) + '%;background:' + COLORS[i] + '"></i></div><b>' + money(x.v) + '</b></div>';
    }).join('');
    $('#costTotal').textContent = money(r.total);
    $('#costPer').textContent = '· ' + money(r.unit) + ' por m²';
    $('#costSub').textContent = nf0.format(r.area) + ' m² · acabados ' + r.fin.name.toLowerCase() + ' · ' + r.city.name;
  }

  /* ---------- KPIs y todo ---------- */
  var last;
  function renderAll() {
    var r = last = compute();
    $('#kArea').textContent = nf0.format(r.area) + ' m²';
    $('#kAreaS').textContent = p.floors + ' niveles · ' + nf0.format(r.footprint) + ' m² por planta';
    $('#kCost').textContent = money(r.total, true);
    $('#kCostS').textContent = money(r.unit) + ' / m²';
    var st = stateOf(r.worst);
    $('#kStruct').innerHTML = '<span style="color:' + colorOf(r.worst) + '">' + (st === 'bad' ? 'Revisar' : 'Aprobada') + '</span>';
    $('#kStructS').textContent = 'Uso máximo ' + pct(r.worst);
    var chip = $('#tabStructChip'); chip.className = 'chip ' + st; chip.textContent = st === 'bad' ? 'Revisar' : 'OK';
    $('#kElec').textContent = r.circ.length + ' circuitos';
    $('#kElecS').textContent = (r.tri ? 'Trifásica' : 'Bifásica') + ' · principal ' + r.main + ' A';
    renderFacade(r); renderVariants(r); renderStructure(r);
    var sel = $('#planLevel'), cur = sel.value;
    sel.innerHTML = Array.from({ length: p.floors }, function (_, i) { return '<option value="' + i + '">' + (i === 0 ? 'Planta baja' : 'Nivel ' + i) + '</option>'; }).join('');
    sel.value = cur && +cur < p.floors ? cur : '0';
    renderPlan(r); renderUnifilar(r); renderCosts(r);
    save();
  }

  /* ---------- Formulario ---------- */
  function syncForm() {
    $('#pName').value = p.name; $('#pFront').value = p.front; $('#pDepth').value = p.depth;
    $('#pFloors').value = p.floors; $('#pBays').value = p.bays; $('#pUse').value = p.use; $('#pFinish').value = p.finish;
    $('#pCity').value = p.city; $('#pPalette').value = p.palette; $('#pMonth').value = p.month; $('#pHour').value = p.hour;
    $('#showPhi').checked = p.phi; $('#lineMode').checked = p.line;
    $$('#segStyle button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === p.style); });
    $$('#segCur button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === p.cur); });
    outputs();
  }
  function outputs() {
    $('#oFloors').textContent = p.floors; $('#oBays').textContent = p.bays; $('#oMonth').textContent = MONTHS[p.month - 1];
    var h = Math.floor(p.hour), mm = p.hour % 1 ? '30' : '00'; $('#oHour').textContent = h + ':' + mm;
  }
  var tmr;
  function changed() {
    outputs();
    $('#liveTxt').textContent = 'Recalculando…';
    clearTimeout(tmr);
    tmr = setTimeout(function () { renderAll(); $('#liveTxt').textContent = 'Sincronizado'; }, 140);
  }
  function clamp(v, a, b, d) { v = parseFloat(v); return isNaN(v) ? d : Math.max(a, Math.min(b, v)); }
  var bind = [
    ['#pFront', 'input', function (e) { p.front = clamp(e.target.value, 8, 40, 18); }],
    ['#pDepth', 'input', function (e) { p.depth = clamp(e.target.value, 10, 40, 22); }],
    ['#pFloors', 'input', function (e) { p.floors = +e.target.value; }],
    ['#pBays', 'input', function (e) { p.bays = +e.target.value; }],
    ['#pUse', 'change', function (e) { p.use = e.target.value; }],
    ['#pFinish', 'change', function (e) { p.finish = e.target.value; }],
    ['#pCity', 'change', function (e) { p.city = e.target.value; }],
    ['#pPalette', 'change', function (e) { p.palette = e.target.value; }],
    ['#pMonth', 'input', function (e) { p.month = +e.target.value; }],
    ['#pHour', 'input', function (e) { p.hour = +e.target.value; }],
    ['#showPhi', 'change', function (e) { p.phi = e.target.checked; }],
    ['#lineMode', 'change', function (e) { p.line = e.target.checked; }],
    ['#pName', 'input', function (e) { p.name = e.target.value.slice(0, 60) || 'Proyecto sin nombre'; }]
  ];
  bind.forEach(function (b) { $(b[0]).addEventListener(b[1], function (e) { b[2](e); changed(); }); });
  $('#segStyle').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; p.style = b.dataset.v; syncForm(); changed(); });
  $('#segCur').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; p.cur = b.dataset.v; syncForm(); renderAll(); });
  $('#variants').addEventListener('click', function (e) { var b = e.target.closest('button[data-var]'); if (!b) return; Object.assign(p, VARIANTS[+b.dataset.var].o); syncForm(); renderAll(); });
  $('#layers').addEventListener('change', function () { renderPlan(last); });

  /* ---------- Generar con el comité ---------- */
  $('#params').addEventListener('submit', function (e) {
    e.preventDefault();
    var ov = $('#genOv'), items = $$('#genLog li'), bar = $('#genProg'), step = 0;
    items.forEach(function (li) { li.className = ''; }); bar.style.width = '0';
    ov.classList.add('on');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, dt = reduce ? 150 : 650;
    (function next() {
      if (step > 0) items[step - 1].classList.add('done');
      if (step < items.length) { items[step].classList.add('on'); bar.style.width = ((step + 1) / items.length * 100) + '%'; step++; setTimeout(next, dt); }
      else { renderAll(); setTimeout(function () { ov.classList.remove('on'); toast('Proyecto generado y verificado por el comité'); }, 250); }
    })();
  });

  /* ---------- Pestañas ---------- */
  function selectTab(name) {
    $$('.tabs [role=tab]').forEach(function (t) { var on = t.dataset.tab === name; t.setAttribute('aria-selected', on); $('#p-' + t.dataset.tab).classList.toggle('on', on); });
  }
  $('.tabs').addEventListener('click', function (e) { var t = e.target.closest('[role=tab]'); if (t) selectTab(t.dataset.tab); });
  $('.tabs').addEventListener('keydown', function (e) {
    var tabs = $$('.tabs [role=tab]'), i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); selectTab(n.dataset.tab); }
  });

  /* ---------- Vistas ---------- */
  function showView(v) {
    $$('.view').forEach(function (el) { el.classList.toggle('on', el.dataset.v === v); });
    $$('.side .nv[data-view]').forEach(function (b) { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('#mNav').value = v; window.scrollTo(0, 0);
  }
  $$('[data-view]').forEach(function (b) { b.addEventListener('click', function () { showView(b.dataset.view); }); });
  $$('[data-view-btn]').forEach(function (b) { b.addEventListener('click', function () { p = Object.assign({}, DEFAULT, { name: 'Proyecto nuevo' }); syncForm(); renderAll(); showView('studio'); }); });
  $$('[data-tab-jump]').forEach(function (b) { b.addEventListener('click', function () { showView('studio'); selectTab(b.dataset.tabJump); $('.out').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
  $('#mNav').addEventListener('change', function (e) {
    var v = e.target.value;
    if (v === 'present') { openPresent(); e.target.value = 'studio'; }
    else if (v === 'dist') location.href = 'distribuidores.html';
    else showView(v);
  });

  /* ---------- Proyectos de ejemplo ---------- */
  var SAMPLES = [
    { name: 'Villa Fiorentina', front: 18, depth: 22, floors: 3, bays: 7, style: 'renacentista', city: 'cdmx', palette: 'travertino', finish: 'pre', use: 'res', st: ['ok', 'Aprobado'], date: 'Hoy' },
    { name: 'Casa Amalfi', front: 14, depth: 20, floors: 2, bays: 5, style: 'mediterraneo', city: 'mid', palette: 'terracota', finish: 'med', use: 'res', st: ['warn', 'En revisión'], date: 'Ayer' },
    { name: 'Palazzo Monterrey', front: 26, depth: 30, floors: 5, bays: 9, style: 'renacentista', city: 'mty', palette: 'marmol', finish: 'pre', use: 'com', st: ['ok', 'Aprobado'], date: '12 nov' },
    { name: 'Loft Querétaro', front: 12, depth: 18, floors: 3, bays: 5, style: 'moderno', city: 'qro', palette: 'marmol', finish: 'med', use: 'res', st: ['ok', 'Presentado'], date: '9 nov' },
    { name: 'Residencia Cholula', front: 16, depth: 24, floors: 2, bays: 7, style: 'renacentista', city: 'pue', palette: 'travertino', finish: 'med', use: 'res', st: ['ok', 'Contratado'], date: '3 nov' },
    { name: 'Hotel Boutique Tulum', front: 32, depth: 28, floors: 4, bays: 9, style: 'mediterraneo', city: 'cun', palette: 'terracota', finish: 'pre', use: 'com', st: ['warn', 'Borrador'], date: '28 oct' }
  ];
  $('#projGrid').innerHTML = SAMPLES.map(function (s, i) {
    return '<article class="card pcard"><div class="thumb">' + F.build({ floors: s.floors, bays: s.bays, style: s.style, mode: 'render', phi: false, lat: CITIES[s.city].lat, palette: s.palette, hour: 10 + i * 1.5, width: 600, height: 360, id: 's' + i }) + '</div>' +
      '<div class="body"><div class="meta"><span>' + esc(CITIES[s.city].name) + '</span><span class="chip ' + s.st[0] + '">' + s.st[1] + '</span></div><h3>' + esc(s.name) + '</h3><div class="meta"><span>' + s.floors + ' niveles · ' + STYLE_NAME[s.style] + '</span><span>' + s.date + '</span></div>' +
      '<button class="btn btn-ghost btn-sm" data-open="' + i + '">Abrir en el Estudio</button></div></article>';
  }).join('');
  $('#projGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]'); if (!b) return;
    var s = SAMPLES[+b.dataset.open]; p = Object.assign({}, DEFAULT, s); delete p.st; delete p.date;
    syncForm(); renderAll(); showView('studio'); toast('Abriste ' + s.name);
  });

  /* ---------- Presentación ---------- */
  function openPresent() {
    var r = last || compute();
    $('#presentPic').innerHTML = F.build({ floors: p.floors, bays: p.bays, style: p.style, mode: 'render', phi: false, lat: r.city.lat, month: p.month, hour: p.hour, palette: p.palette, width: 1000, height: 640, id: 'pp' });
    $('#presentName').textContent = p.name;
    var lead = (p.use === 'com' ? 'Edificio comercial' : 'Residencia') + ' de ' + p.floors + (p.floors === 1 ? ' nivel' : ' niveles') + ' de estilo ' + STYLE_NAME[p.style] + ' en ' + r.city.name + ', con ' + nf0.format(r.area) + ' m² de construcción y estructura verificada contra sismo.';
    $('#presentLead').textContent = lead;
    $('#presentFigs').innerHTML = [[nf0.format(r.area) + ' m²', 'Construcción'], [money(r.total, true), 'Presupuesto estimado'], [r.circ.length + ' circuitos', 'Instalación eléctrica'], [stateOf(r.worst) === 'bad' ? 'Revisar' : 'Aprobada', 'Estructura']]
      .map(function (f) { return '<div><b>' + esc(f[0]) + '</b><span>' + f[1] + '</span></div>'; }).join('');
    updateWa(lead, r);
    $('#present').classList.add('on'); document.body.style.overflow = 'hidden'; $('#presentClose').focus();
  }
  function updateWa(lead, r) {
    var client = $('#clientName').value.trim();
    var txt = (client ? 'Hola ' + client + ', ' : 'Hola, ') + 'te comparto la propuesta "' + p.name + '": ' + lead + ' Presupuesto estimado ' + money(r.total) + '. Diseñado con Rinova AI.';
    $('#waShare').href = 'https://wa.me/?text=' + encodeURIComponent(txt);
  }
  $('#clientName').addEventListener('input', function () { updateWa($('#presentLead').textContent, last || compute()); });
  function closePresent() { $('#present').classList.remove('on'); document.body.style.overflow = ''; }
  $$('[data-present]').forEach(function (b) { b.addEventListener('click', openPresent); });
  $('#presentClose').addEventListener('click', closePresent);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePresent(); });

  /* ---------- Exportar ---------- */
  $('#btnExport').addEventListener('click', function () {
    var svg = $('#planSvg'); if (!svg) return;
    var blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svg.outerHTML], { type: 'image/svg+xml' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'rinova-' + p.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-planta-' + ($('#planLevel').value || 0) + '.svg';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('Plano exportado en SVG. La exportación DXF por capas llega con el backend.');
  });

  var tt;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 3200); }

  syncForm(); renderAll();
  if (location.hash === '#proyectos') showView('projects');
  if (location.hash === '#presentar') openPresent();
})();
