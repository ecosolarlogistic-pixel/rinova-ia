/* RINOVAIA — Estudio de diseño (maqueta funcional).
   Toda la lógica corre en el navegador con fórmulas simplificadas de demostración.
   En producción, compute() se sustituye por llamadas a la API (ver docs/ARQUITECTURA.md):
     POST /api/v1/proyectos/{id}/generar  → render (difusión), FEA, vectores DXF/SVG y metrajes. */
(function () {
  'use strict';
  var F = window.RinovaFacade, PHI = F.PHI;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var PR = window.RinovaProyecto, PL = window.RinovaPlanos;
  function locOf(o) { var q = PR.normalizeLoc({ state: o.state, city: o.city }); return PR.loc(q.state, q.city); }
  var STYLE_NAME = { renacentista: 'clásico renacentista', mediterraneo: 'mediterráneo', moderno: 'contemporáneo' };
  var FINISH = { eco: { name: 'Económico', cm: 4.8, unit: 9800 }, med: { name: 'Medio', cm: 5.3, unit: 15200 }, pre: { name: 'Premium', cm: 5.9, unit: 23500 } };
  var MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var USD = 18.5;

  var DEFAULT = { name: 'Residencia Lomas', front: 18, depth: 22, floors: 3, bays: 7, style: 'moderno', use: 'res', finish: 'pre', state: 'cdmx', city: 'miguel-hidalgo',
    type: 'casa', beds: 3, baths: 3, halfBaths: 1, parking: 2, layout: 'abierto', flooring: 'porcelanato', units: 4, palette: 'concreto', month: 6, hour: 18.5, phi: false, line: false, cur: 'MXN' };
  var KEY = 'rinova.estudio.v2';
  var p = Object.assign({}, DEFAULT);
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) p = Object.assign(p, saved); } catch (e) { }
  function normalize(o) {
    PR.normalizeLoc(o);
    if (!PR.TIPOS[o.type]) o.type = o.use === 'com' ? 'comercial' : 'casa';
    o.use = PR.TIPOS[o.type].use;
    if (!PR.DISTRIBUCION[o.layout]) o.layout = 'abierto';
    if (!PR.PISOS[o.flooring]) o.flooring = 'porcelanato';
    if (!o.rooms || typeof o.rooms !== 'object' || Array.isArray(o.rooms)) o.rooms = {};
    if (!Array.isArray(o.extra)) o.extra = [];
    if (!Array.isArray(o.garden)) o.garden = [];
    if (!o.walls || typeof o.walls !== 'object') o.walls = {};
    if (!Array.isArray(o.walls.m)) o.walls.m = [];
    if (!Array.isArray(o.walls.x)) o.walls.x = [];
    o.energy = PR.energyOpts(o);
    return o;
  }
  normalize(p);
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
    normalize(p);
    var city = locOf(p), fin = FINISH[p.finish], T = PR.TIPOS[p.type];
    var W = p.front * 0.92, D = p.depth * 0.82;
    // El desplante se ajusta al programa: si sobra terreno, el fondo construido se reduce y el resto queda libre.
    var need = 0, flex = false;
    PR.program(p).forEach(function (lv) { var a = 0; lv.front.concat(lv.back).forEach(function (x) { if (x.flex) flex = true; else a += x.a; }); need = Math.max(need, a); });
    if (!flex && need) D = Math.min(D, Math.max(7, need * 1.2 / W));
    // Con jardín (alberca, palapa…) la casa se compacta hacia el frente para dejar patio posterior, sin bajar del programa.
    var gNeed = PR.gardenNeed(p);
    if (gNeed) { var Dg = p.depth - Math.min(3, p.depth * 0.15) - gNeed - 0.4; if (Dg < D) D = Math.max(Dg, Math.min(D, need * 1.05 / W), 6); }
    var surf = PL.parkingCapacity(p, { D: D }).surface;
    var footprint = W * D, area = footprint * p.floors;
    var L = W / p.bays;                       // claro en fachada
    var rows = Math.max(2, Math.round(D / 5.5));
    var Ly = D / rows;                         // claro perpendicular
    var CM = fin.cm, CV = p.use === 'ind' ? 6.0 : p.use === 'com' ? 3.5 : 1.9;
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
    var drift = 0.0035 + 0.0016 * p.floors * (city.c / 0.2) * (p.style === 'moderno' ? 0.85 : 1);
    var driftLim = 0.015;

    var elements = [
      { name: 'Viga principal V-1', sec: beam.s[0] + ' × ' + beam.s[1] + ' cm', dem: Mu, cap: beam.cap, unit: 'kN·m' },
      { name: 'Columna C-1 · planta baja', sec: col.s[0] + ' × ' + col.s[1] + ' cm', dem: Pu, cap: col.cap, unit: 'kN' }
    ];
    if (colUp) elements.push({ name: 'Columna C-2 · niveles superiores', sec: colUp.s[0] + ' × ' + colUp.s[1] + ' cm', dem: PuUp, cap: colUp.cap, unit: 'kN' });
    elements.push({ name: 'Losa de entrepiso L-1', sec: 'maciza h = ' + hs + ' cm', dem: MuS, cap: capS, unit: 'kN·m/m' });
    elements.push(found);
    elements.push({ name: 'Desplazamiento lateral', sec: p.style === 'moderno' ? 'marcos con muros de rigidez' : 'marcos dúctiles Q = 2', dem: drift, cap: driftLim, unit: 'Δ/h', ratio: true });
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
      if (p.use === 'ind') circ.push({ use: 'Fuerza nave ' + lvl, br: '3P-40A', kw: 6.0 });
      if (p.type === 'deptos' && i > 0) circ.push({ use: 'Alimentador deptos ' + lvl + ' (' + p.units + ')', br: '2P-40A', kw: 1.8 * p.units });
    }
    if (p.type === 'deptos' && p.floors >= 4) circ.push({ use: 'Elevador', br: '3P-30A', kw: 7.5 });
    if (p.use === 'ind') circ.push({ use: 'Andenes y niveladores', br: '3P-30A', kw: 1.5 * Math.max(1, p.units) });
    circ.push({ use: p.use !== 'res' ? 'Cocineta / servicio' : 'Cocina', br: '1P-20A', kw: 2.4 });
    circ.push({ use: 'Lavado y bombeo', br: '1P-20A', kw: 1.8 });
    var amen = PR.amenities(p, city.f);
    amen.circ.forEach(function (c) { circ.push(c); });
    var energy = PR.energy(p, { W: W, D: D, area: area, footprint: footprint, city: city });
    if (energy) energy.circ.forEach(function (c) { circ.push(c); });
    var kw = circ.reduce(function (s, c) { return s + c.kw; }, 0), kwd = kw * 0.6;
    var tri = kwd > 10;
    var I = kwd * 1000 / (tri ? 220 * 1.732 * 0.9 : 220 * 0.9);
    var MAIN = [40, 50, 63, 70, 100, 125, 150, 200, 250];
    var main = MAIN.filter(function (m) { return m >= I * 1.25; })[0] || 250;

    // Costos
    var styleF = { renacentista: 1.12, mediterraneo: 1.05, moderno: 1 }[p.style];
    var heightF = 1 + Math.max(0, p.floors - 3) * 0.03;
    var typeF = { casa: 1, deptos: 0.97, comercial: 1.06, bodega: 0.6 }[p.type];
    var floorK = (PR.PISOS[p.flooring] || PR.PISOS.porcelanato).k;
    var unit = fin.unit * styleF * city.f * heightF * typeF * (1 + floorK * 0.01);
    var total = unit * area;
    var parts = [
      ['Preliminares y cimentación', 11 + (found.name.indexOf('Losa') === 0 ? 3 : 0)],
      ['Estructura', 23 + (city.c >= 0.3 ? 2 : 0)],
      ['Albañilería y muros', 15],
      ['Instalación eléctrica', 7],
      ['Instalación hidrosanitaria', 7],
      ['Acabados interiores y pisos', 19 + (p.finish === 'pre' ? 4 : 0) + floorK],
      ['Fachada y ornamentación', 6 + (p.style === 'renacentista' ? 5 : p.style === 'mediterraneo' ? 2 : 0)],
      ['Honorarios, licencias e IA', 6]
    ];
    if (p.parking > 0 && p.type !== 'casa') parts.splice(6, 0, ['Estacionamiento y exteriores', 3 + Math.min(6, p.parking / 10)]);
    var sum = parts.reduce(function (s, x) { return s + x[1]; }, 0);
    parts = parts.map(function (x) { return { name: x[0], pct: x[1] / sum, v: total * x[1] / sum }; });
    // Amenidades y equipamiento (alberca, palapa, tina, jacuzzi…) se suman al presupuesto
    if (amen.total > 0) { total += amen.total; parts.push({ name: 'Amenidades y equipamiento', v: amen.total, items: amen.list }); }
    if (energy && energy.total > 0) { total += energy.total; parts.push({ name: 'Energía solar y movilidad eléctrica', v: energy.total, items: energy.items }); }
    parts.forEach(function (x) { x.pct = x.v / total; });

    return { city: city, fin: fin, W: W, D: D, L: L, Ly: Ly, rows: rows, footprint: footprint, area: area, Wu: Wu, CV: CV, V: V,
      elements: elements, worst: worst, beam: beam, col: col, circ: circ, kw: kw, kwd: kwd, tri: tri, main: main, unit: unit, total: total, parts: parts, drift: drift,
      type: T, parkSurface: surf, amen: amen, energy: energy, yard: PR.siteYard(p, { W: W, D: D }), parkFit: surf + (p.type === 'casa' ? Math.min(p.parking, 3) : p.type === 'deptos' && p.floors > 1 ? Math.floor(W * D * 0.55 / 25) : 0) };
  }
  function pick(list, capFn, dem) {
    for (var i = 0; i < list.length; i++) { var cap = capFn(list[i]); if (dem / cap <= 0.82) return { s: list[i], cap: cap }; }
    var l = list[list.length - 1]; return { s: l, cap: capFn(l) };
  }

  /* ---------- Render ---------- */
  // Con «Mejorar fachada» activa, todas las vistas usan la fachada mejorada (misma que lámina R-01, render 3D y recorrido)
  function fxActive() { var FXP = window.RinovaFachada; return !!(FXP && p.fx && p.fx.on); }
  function improvedSvg(r, id, hora) { var FXP = window.RinovaFachada; return FXP.svg(p, r, FXP.normalize(p.fx, p), { id: id, marks: false, hora: hora }).svg; }
  var FX_VARIANTS = [{ label: 'Día', v: 'dia' }, { label: 'Atardecer', v: 'tarde' }, { label: 'Noche', v: 'noche' }];
  function renderFacade(r) {
    if (fxActive() && !p.line) {
      $('#renderOut').innerHTML = improvedSvg(r, 'r');
      $('#sunChip').textContent = 'Fachada mejorada · ' + window.RinovaFachada.ESTILOS[p.fx.estilo].n;
      $('#sunChip').hidden = false;
      $('#phiChip').textContent = p.bays + ' crujías · ' + r.city.short;
      return;
    }
    $('#renderOut').innerHTML = F.build({ floors: p.floors, bays: p.bays, style: p.style, mode: p.line ? 'line' : 'render', phi: p.phi,
      lat: r.city.lat, month: p.month, hour: p.hour, palette: p.palette, width: 1000, height: 600, id: 'r', frontM: p.front });
    var s = F.sun(r.city.lat, p.month, p.hour);
    $('#sunChip').textContent = 'Sol ' + Math.round(Math.max(0, s.elevation)) + '° · ' + r.city.name;
    $('#phiChip').textContent = 'φ ' + PHI.toFixed(3) + ' · ' + p.bays + ' crujías';
    $('#renderOut').parentElement.style.setProperty('--f-line', '#2F4B7C');
    $('#sunChip').hidden = p.line;
  }
  var VARIANTS = [
    { label: 'Mañana', o: { hour: 9 } }, { label: 'Anochecer', o: { hour: 19 } },
    { label: 'Concreto aparente', o: { palette: 'concreto' } }, { label: 'Mármol', o: { palette: 'marmol' } }
  ];
  function renderVariants(r) {
    var vb = $('#variants');
    if (fxActive()) {
      vb.style.gridTemplateColumns = 'repeat(3,1fr)';
      vb.innerHTML = FX_VARIANTS.map(function (v, i) { return '<button type="button" data-fxh="' + v.v + '" aria-pressed="' + (p.fx.hora === v.v) + '">' + improvedSvg(r, 'vf' + i, v.v) + '<small>' + v.label + '</small></button>'; }).join('');
      return;
    }
    vb.style.gridTemplateColumns = '';
    vb.innerHTML = VARIANTS.map(function (v, i) {
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
    out.push('<line x1="10" y1="' + (H - m) + '" x2="' + (W - 10) + '" y2="' + (H - m) + '" stroke="#18202B" stroke-width="2"/>');
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
    for (i = 0; i <= bays; i++) out.push('<rect x="' + (m + bw * i - 7) + '" y="' + (H - m) + '" width="14" height="6" fill="#5A6475"/>');
    out.push('</svg>');
    $('#frameOut').innerHTML = out.join('');
  }

  /* ---------- Planos: juego completo de láminas ---------- */
  var plans = null, croquis = null;
  try { croquis = JSON.parse(localStorage.getItem(KEY + '.croquis') || 'null'); } catch (e) { }
  function layersOn() { var on = {}; $$('#layers input[data-layer]').forEach(function (c) { on[c.dataset.layer] = c.checked; }); return on; }
  function buildPlans(r) {
    var FXP = window.RinovaFachada, fxOn = FXP && p.fx && p.fx.on;
    plans = PL.build(p, r, { croquis: croquis, styleName: STYLE_NAME[p.style], unifilar: function () { return unifilarSvg(r); },
      fachada: fxOn ? { name: FXP.ESTILOS[FXP.normalize(p.fx, p).estilo].n, render: function () { return FXP.svg(p, r, p.fx, { id: 'shfx', marks: false }).svg; } } : null });
    r.planInfo = plans.info;
    var sel = $('#planSheet'), cur = sel.value;
    sel.innerHTML = plans.sheets.map(function (s) { return '<option value="' + s.code + '">' + s.code + ' · ' + esc(s.name) + '</option>'; }).join('');
    var firstPlan = plans.sheets.filter(function (s) { return s.kind === 'plan'; })[0];
    sel.value = plans.sheets.some(function (s) { return s.code === cur; }) ? cur : firstPlan.code;
    $('#sheetCount').textContent = plans.sheets.length + ' láminas';
  }
  function currentSheet() { var c = $('#planSheet').value; return plans.sheets.filter(function (s) { return s.code === c; })[0] || plans.sheets[0]; }
  function renderPlan() {
    if (!plans) return;
    var sh = currentSheet(), isPlan = sh.kind === 'plan';
    $$('#layers .lay').forEach(function (l) { l.hidden = !isPlan; });
    $('#planOut').innerHTML = sh.render(isPlan ? layersOn() : null);
  }
  function renderUnifilar(r) { $('#uniOut').innerHTML = unifilarSvg(r); }
  function unifilarSvg(r) {
    var n = r.circ.length, rowH = 26, H = 90 + n * rowH, W = 680, bus = 230, o = [];
    o.push('<svg viewBox="0 0 ' + W + ' ' + H + '" style="min-width:540px;width:100%" font-family="Inter,system-ui,sans-serif" font-size="12">');
    o.push('<g stroke="#18202B" stroke-width="1.6" fill="none"><path d="M20 50h50"/><circle cx="92" cy="50" r="22"/><path d="M114 50h40"/><rect x="154" y="34" width="56" height="32" rx="4"/><path d="M210 50h' + (bus - 210) + '"/><path d="M' + bus + ' 40V' + (60 + n * rowH) + '" stroke-width="4"/></g>');
    o.push('<g fill="#18202B"><text x="20" y="36" font-weight="700">CFE</text><text x="92" y="55" text-anchor="middle" font-weight="700">M</text><text x="182" y="54" text-anchor="middle" font-size="10" font-weight="700">' + (r.tri ? '3P' : '2P') + '-' + r.main + 'A</text>');
    o.push('<text x="20" y="90" fill="#5A6475">Acometida ' + (r.tri ? 'trifásica 220/127 V' : 'bifásica 220/127 V') + '</text><text x="20" y="108" fill="#5A6475">Carga instalada ' + nf1.format(r.kw) + ' kW</text><text x="20" y="126" fill="#5A6475">Demanda (FD 0.6) ' + nf1.format(r.kwd) + ' kW</text></g>');
    r.circ.forEach(function (c, i) {
      var y = 60 + i * rowH + rowH / 2;
      o.push('<g stroke="#B8932A" stroke-width="1.4" fill="none"><path d="M' + bus + ' ' + y + 'h40"/><path d="M' + (bus + 40) + ' ' + y + ' q10 -12 20 0"/><path d="M' + (bus + 60) + ' ' + y + 'h40"/></g>');
      o.push('<text x="' + (bus + 110) + '" y="' + (y + 4) + '" fill="#18202B"><tspan font-weight="700">C' + (i + 1) + '</tspan>  ' + esc(c.use) + '</text><text x="' + (W - 20) + '" y="' + (y + 4) + '" text-anchor="end" fill="#5A6475">' + c.br + ' · ' + nf1.format(c.kw) + ' kW</text>');
    });
    o.push('</svg>');
    return o.join('');
  }

  /* ---------- Costos ---------- */
  var COLORS = ['#0B0F17', '#3A4456', '#D4AF37', '#B8932A', '#2F4B7C', '#6b8fb8', '#8A93A5', '#C0C6D4'];
  function renderCosts(r) {
    var max = Math.max.apply(null, r.parts.map(function (x) { return x.pct; }));
    $('#costOut').innerHTML = r.parts.map(function (x, i) {
      return '<div class="cb"><span>' + esc(x.name) + '</span><div class="track"><i style="width:' + (x.pct / max * 100) + '%;background:' + COLORS[i % COLORS.length] + '"></i></div><b>' + money(x.v) + '</b></div>';
    }).join('');
    $('#costTotal').textContent = money(r.total);
    var ec = $('#energyCard'), en = r.energy;
    ec.hidden = !en;
    if (en) {
      var figs = [];
      if (en.kwp) figs.push([nf1.format(en.kwp) + ' kWp', en.panels + ' paneles de ' + PR.FV.panelW + ' W'], [nf0.format(en.gen) + ' kWh', 'Generación al mes · consumo ' + nf0.format(en.mensual)]);
      if (en.retorno) figs.push([money(en.ahorroMes * 12, true), 'Ahorro al año · retorno ' + nf1.format(en.retorno) + ' años']);
      if (en.co2) figs.push([nf1.format(en.co2) + ' t', 'CO₂ evitado al año']);
      if (en.kwh) figs.push([en.kwh + ' kWh', 'Baterías · ' + nf1.format(en.autonomia) + ' días de autonomía']);
      if (en.chargers) figs.push([en.chargers + ' × ' + en.chargerKw + ' kW', 'Cargadores para autos eléctricos']);
      ec.innerHTML = '<h4><span>Energía solar y movilidad eléctrica</span><b class="num">' + money(en.total) + '</b></h4>' +
        '<div class="en-figs">' + figs.slice(0, 8).map(function (x) { return '<div><b class="num">' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div>' +
        '<ul class="en-list">' + en.items.map(function (x) { return '<li><span>' + esc(x.n) + '</span><b class="num">' + money(x.v) + '</b></li>'; }).join('') + '</ul>' +
        '<p class="note">Horas solares pico en ' + esc(r.city.short) + ': ' + nf1.format(en.hsp) + ' h/día · rendimiento del sistema 78 % · tarifa de referencia $' + nf1.format(en.tarifa) + ' por kWh. ' + (en.kwp && !en.fits ? 'La azotea admite ' + en.roofMax + ' módulos; el sistema se limitó a ese número. ' : '') + 'Dimensionamiento preliminar: el proyecto ejecutivo lo valida un instalador certificado con los recibos de CFE.</p>';
    }
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
    energyHint(r);
    renderFacade(r); renderVariants(r); renderStructure(r);
    buildPlans(r); renderPlan(); renderUnifilar(r); renderCosts(r); renderAnalysis(r);
    save();
    document.dispatchEvent(new CustomEvent('rinova:change', { detail: { p: p, r: r } }));
  }

  /* ---------- Formulario ---------- */
  $('#pState').innerHTML = Object.keys(PR.ESTADOS).sort(function (a, b) { return PR.ESTADOS[a].n.localeCompare(PR.ESTADOS[b].n, 'es'); })
    .map(function (k) { return '<option value="' + k + '">' + esc(PR.ESTADOS[k].n) + '</option>'; }).join('');
  function syncForm() {
    $('#pName').value = p.name; $('#pFront').value = p.front; $('#pDepth').value = p.depth;
    $('#pFloors').value = p.floors; $('#pBays').value = p.bays; $('#pFinish').value = p.finish;
    $('#pType').value = p.type; $('#pBeds').value = p.beds; $('#pBaths').value = p.baths; $('#pHalf').value = p.halfBaths;
    $('#pParking').value = p.parking; $('#pLayout').value = p.layout; $('#pFlooring').value = p.flooring; $('#pUnits').value = p.units;
    $('#pState').value = p.state; fillCities(); $('#pCity').value = p.city; $('#pPalette').value = p.palette;
    typeUI(); energyUI(); $('#pMonth').value = p.month; $('#pHour').value = p.hour;
    $('#showPhi').checked = p.phi; $('#lineMode').checked = p.line;
    $$('#segStyle button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === p.style); });
    $$('#segCur button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === p.cur); });
    outputs();
  }
  function fillCities() {
    var e = PR.ESTADOS[p.state];
    $('#pCity').innerHTML = e.cities.map(function (c) { return '<option value="' + c.id + '">' + esc(c.n) + '</option>'; }).join('');
  }
  function typeUI() {
    var T = PR.TIPOS[p.type], res = p.type === 'casa' || p.type === 'deptos';
    $('#fUnits').hidden = !T.unitsLabel; if (T.unitsLabel) { $('#lUnits').textContent = T.unitsLabel; $('#pUnits').max = T.unitsMax; }
    $('#fBeds').hidden = !res; $('#fLayout').hidden = !res;
    $('#lBaths').textContent = res ? (p.type === 'deptos' ? 'Baños / depto' : 'Baños') : 'Sanitarios';
    $('#lHalf').textContent = 'Medios baños';
    $('#lBeds').textContent = p.type === 'deptos' ? 'Rec. / depto' : 'Recámaras';
    var locs = PR.loc(p.state, p.city); $('#locHint').textContent = 'Zona sísmica ' + locs.zone.toLowerCase() + ' · suelo ~' + locs.q + ' kPa · lat. ' + locs.lat.toFixed(2) + '°';
  }
  function energyUI() {
    var e = PR.energyOpts(p);
    $('#pSolar').checked = e.solar; $('#pCover').value = String(e.cover); $('#pBattery').value = e.battery; $('#pChargers').value = e.chargers;
    $('#pChargers').max = Math.max(0, p.parking | 0);
    $('#fCover').hidden = !(e.solar || e.battery === 'aislado');
  }
  function energyHint(r) {
    var el = $('#energyHint'); if (!el) return;
    var en = r.energy;
    if (!en) { el.textContent = 'Agrega paneles, baterías o cargadores para dimensionar el sistema y sumarlo al presupuesto.'; return; }
    var t = [];
    if (en.kwp) t.push(nf1.format(en.kwp) + ' kWp · ' + en.panels + ' paneles · ' + nf0.format(en.gen) + ' kWh/mes (' + Math.round(Math.min(9.99, en.cobertura) * 100) + ' % del consumo)' + (en.fits ? '' : ' · la azotea admite ' + en.roofMax));
    if (en.kwh) t.push(en.kwh + ' kWh de baterías');
    if (en.chargers) t.push(en.chargers + ' cargador(es) de ' + en.chargerKw + ' kW');
    if (en.opts.chargers > en.chargers) t.push('máximo un cargador por cajón');
    t.push(money(en.total));
    el.textContent = t.join(' · ');
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
    ['#pType', 'change', function (e) {
      p.type = e.target.value; p.use = PR.TIPOS[p.type].use;
      if (p.type === 'bodega') { p.floors = Math.min(p.floors, 2); p.units = Math.min(Math.max(p.units, 2), 12); }
      if (p.type === 'comercial') p.units = Math.max(p.units, 4);
      if (p.type === 'deptos') { p.units = Math.min(Math.max(p.units, 2), 8); p.floors = Math.max(p.floors, 3); }
      syncForm();
    }],
    ['#pBeds', 'input', function (e) { p.beds = clamp(e.target.value, 0, 10, 3) | 0; }],
    ['#pBaths', 'input', function (e) { p.baths = clamp(e.target.value, 0, 10, 2) | 0; }],
    ['#pHalf', 'input', function (e) { p.halfBaths = clamp(e.target.value, 0, 6, 1) | 0; }],
    ['#pParking', 'input', function (e) { p.parking = clamp(e.target.value, 0, 400, 2) | 0; energyUI(); }],
    ['#pUnits', 'input', function (e) { p.units = clamp(e.target.value, 1, 24, 4) | 0; }],
    ['#pLayout', 'change', function (e) { p.layout = e.target.value; }],
    ['#pSolar', 'change', function (e) { p.energy = Object.assign({}, p.energy, { solar: e.target.checked }); energyUI(); }],
    ['#pCover', 'change', function (e) { p.energy = Object.assign({}, p.energy, { cover: +e.target.value }); }],
    ['#pBattery', 'change', function (e) { p.energy = Object.assign({}, p.energy, { battery: e.target.value }); energyUI(); }],
    ['#pChargers', 'input', function (e) { p.energy = Object.assign({}, p.energy, { chargers: clamp(e.target.value, 0, 40, 0) | 0 }); }],
    ['#pFlooring', 'change', function (e) { p.flooring = e.target.value; }],
    ['#pState', 'change', function (e) { p.state = e.target.value; fillCities(); p.city = PR.ESTADOS[p.state].cities[0].id; $('#pCity').value = p.city; typeUI(); }],
    ['#pFinish', 'change', function (e) { p.finish = e.target.value; }],
    ['#pCity', 'change', function (e) { p.city = e.target.value; typeUI(); }],
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
  $('#variants').addEventListener('click', function (e) {
    var h = e.target.closest('button[data-fxh]'); if (h && p.fx) { p.fx.hora = h.dataset.fxh; renderAll(); return; }
    var b = e.target.closest('button[data-var]'); if (!b) return; Object.assign(p, VARIANTS[+b.dataset.var].o); syncForm(); renderAll(); });
  $('#layers').addEventListener('change', function () { renderPlan(); });
  $('#planSheet').addEventListener('change', function () { renderPlan(); });

  /* ---------- Generar con el comité ---------- */
  $('#params').addEventListener('submit', function (e) { e.preventDefault(); generate(); });
  function generate(msg, after) {
    var ov = $('#genOv'), items = $$('#genLog li'), bar = $('#genProg'), step = 0;
    items.forEach(function (li) { li.className = ''; }); bar.style.width = '0';
    ov.classList.add('on');
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, dt = reduce ? 150 : 650;
    (function next() {
      if (step > 0) items[step - 1].classList.add('done');
      if (step < items.length) { items[step].classList.add('on'); bar.style.width = ((step + 1) / items.length * 100) + '%'; step++; setTimeout(next, dt); }
      else { renderAll(); setTimeout(function () { ov.classList.remove('on'); toast(msg || 'Proyecto actualizado: visualización, estructura, planos y presupuesto sincronizados'); if (after) after(); }, 250); }
    })();
  }

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
  $$('[data-view-btn]').forEach(function (b) { b.addEventListener('click', function () { p = Object.assign({}, DEFAULT, { name: 'Proyecto nuevo', cur: p.cur }); syncForm(); renderAll(); showView('studio'); setTimeout(function () { $('#pName').focus(); $('#pName').select(); }, 50); }); });
  $$('[data-tab-jump]').forEach(function (b) { b.addEventListener('click', function () { showView('studio'); selectTab(b.dataset.tabJump); $('.out').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
  $('#mNav').addEventListener('change', function (e) {
    var v = e.target.value;
    if (v === 'present') { openPresent(); e.target.value = 'studio'; }
    else if (v === 'dist') { e.target.value = document.querySelector('.view.on').dataset.v; if (window.RinovaNube && window.RinovaNube.leave) window.RinovaNube.leave('distribuidores.html'); else location.href = 'distribuidores.html'; }
    else if (v === 'ai') { if (window.RinovaAI) window.RinovaAI.open(); e.target.value = document.querySelector('.view.on').dataset.v; }
    else showView(v);
  });

  /* ---------- Proyectos (cartera de ejemplo) ---------- */
  var STAGES = ['Diseño', 'Ingeniería', 'Presupuesto', 'Obra', 'Entregado'];
  var SAMPLES = [
    { name: 'Residencia Lomas', code: 'RV-0142', front: 18, depth: 22, floors: 3, bays: 7, style: 'moderno', city: 'cdmx', palette: 'concreto', finish: 'pre', use: 'res', hour: 18.5, stage: 3, prog: 68, owner: 'Arq. Lucía Méndez', st: ['ok', 'En tiempo'] },
    { name: 'Casa Valle Oriente', code: 'RV-0138', front: 14, depth: 20, floors: 2, bays: 5, style: 'moderno', city: 'mty', palette: 'marmol', finish: 'med', use: 'res', hour: 10, stage: 1, prog: 45, owner: 'Ing. Mario Cantú', st: ['warn', 'Revisión estructural'] },
    { name: 'Oficinas Andares', code: 'RV-0131', front: 26, depth: 30, floors: 5, bays: 9, style: 'moderno', city: 'gdl', palette: 'concreto', finish: 'pre', use: 'com', hour: 12, stage: 2, prog: 80, owner: 'Arq. Sofía Ramos', st: ['ok', 'Cotizando'] },
    { name: 'Casa Centro Mérida', code: 'RV-0127', front: 12, depth: 18, floors: 2, bays: 5, style: 'mediterraneo', city: 'mid', palette: 'travertino', finish: 'med', use: 'res', hour: 16, stage: 3, prog: 34, owner: 'Ing. Raúl Canché', st: ['bad', '3 días de atraso'] },
    { name: 'Torre Juriquilla', code: 'RV-0119', front: 22, depth: 26, floors: 6, bays: 7, style: 'moderno', city: 'qro', palette: 'concreto', finish: 'pre', use: 'com', hour: 19, stage: 0, prog: 20, owner: 'Arq. Daniel Ibarra', st: ['ok', 'Anteproyecto'] },
    { name: 'Hotel Boutique Tulum', code: 'RV-0104', front: 32, depth: 28, floors: 3, bays: 9, style: 'mediterraneo', city: 'cun', palette: 'terracota', finish: 'pre', use: 'com', hour: 17, stage: 4, prog: 100, owner: 'Arq. Lucía Méndez', st: ['ok', 'Entregado'] }
  ];
  function projectFigures(s) { var q = p; p = Object.assign({}, DEFAULT, s); var r = compute(); p = q; return r; }
  function renderProjects() {
    var total = 0, inWork = 0, issues = 0;
    $('#projGrid').innerHTML = SAMPLES.map(function (s, i) {
      var r = projectFigures(s); total += r.total; if (s.stage === 3) inWork++; if (s.st[0] !== 'ok') issues++;
      return '<article class="card pcard"><div class="thumb">' + F.build({ floors: s.floors, bays: s.bays, style: s.style, mode: 'render', phi: false, lat: locOf(s).lat, palette: s.palette, hour: s.hour, width: 600, height: 340, id: 's' + i }) +
        '<span class="stage">' + STAGES[s.stage] + '</span></div>' +
        '<div class="body"><div class="meta"><span>' + s.code + ' · ' + esc(locOf(s).short) + '</span><span class="chip ' + s.st[0] + '"><span class="dot"></span>' + esc(s.st[1]) + '</span></div><h3>' + esc(s.name) + '</h3>' +
        '<div class="prog-row"><div class="pbar" role="progressbar" aria-valuenow="' + s.prog + '" aria-valuemin="0" aria-valuemax="100" aria-label="Avance de la etapa"><i style="width:' + s.prog + '%"></i></div><b class="num">' + s.prog + ' %</b></div>' +
        '<div class="meta"><span>' + esc(s.owner) + '</span><span class="num">' + money(r.total, true) + '</span></div>' +
        '<button class="btn btn-ghost btn-sm" data-open="' + i + '">Abrir proyecto</button></div></article>';
    }).join('');
    $('#pfActive').textContent = SAMPLES.filter(function (s) { return s.stage < 4; }).length;
    $('#pfWork').textContent = inWork;
    $('#pfTotal').textContent = money(total, true);
    $('#pfIssues').textContent = issues;
  }
  renderProjects();
  $('#segCur').addEventListener('click', function () { setTimeout(renderProjects, 0); });
  $('#projGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]'); if (!b) return;
    var s = SAMPLES[+b.dataset.open]; p = Object.assign({}, DEFAULT, s, { cur: p.cur });
    ['st', 'code', 'stage', 'prog', 'owner'].forEach(function (k) { delete p[k]; });
    syncForm(); renderAll(); showView('studio'); toast('Abriste ' + s.name);
  });

  /* ---------- Presentación ---------- */
  function openPresent() {
    var r = last || compute();
    $('#presentPic').innerHTML = fxActive() ? improvedSvg(r, 'pp') : F.build({ floors: p.floors, bays: p.bays, style: p.style, mode: 'render', phi: false, lat: r.city.lat, month: p.month, hour: p.hour, palette: p.palette, width: 1000, height: 640, id: 'pp' });
    $('#presentName').textContent = p.name;
    var lead = ({ casa: 'Residencia', deptos: 'Edificio de departamentos', comercial: 'Centro comercial', bodega: 'Bodega' }[p.type]) + ' de ' + p.floors + (p.floors === 1 ? ' nivel' : ' niveles') + ' de estilo ' + (fxActive() ? window.RinovaFachada.ESTILOS[p.fx.estilo].n.toLowerCase() : STYLE_NAME[p.style]) + ' en ' + r.city.name + ', con ' + nf0.format(r.area) + ' m² de construcción y estructura revisada por ingeniería.';
    $('#presentLead').textContent = lead;
    $('#presentFigs').innerHTML = [[nf0.format(r.area) + ' m²', 'Construcción'], [money(r.total, true), 'Presupuesto estimado'], [r.circ.length + ' circuitos', 'Instalación eléctrica'], [stateOf(r.worst) === 'bad' ? 'Revisar' : 'Aprobada', 'Estructura']]
      .map(function (f) { return '<div><b>' + esc(f[0]) + '</b><span>' + f[1] + '</span></div>'; }).join('');
    updateWa(lead, r);
    $('#present').classList.add('on'); document.body.style.overflow = 'hidden'; $('#presentClose').focus();
  }
  function updateWa(lead, r) {
    var client = $('#clientName').value.trim();
    var txt = (client ? 'Hola ' + client + ', ' : 'Hola, ') + 'te comparto la propuesta "' + p.name + '": ' + lead + ' Presupuesto estimado ' + money(r.total) + '. Proyecto desarrollado con RINOVAIA.';
    $('#waShare').href = 'https://wa.me/?text=' + encodeURIComponent(txt);
  }
  $('#clientName').addEventListener('input', function () { updateWa($('#presentLead').textContent, last || compute()); });
  function closePresent() { $('#present').classList.remove('on'); document.body.style.overflow = ''; }
  $$('[data-present]').forEach(function (b) { b.addEventListener('click', openPresent); });
  $('#presentClose').addEventListener('click', closePresent);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePresent(); });

  /* ---------- Exportar ---------- */
  function fileSlug() { return p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function exportSheet() {
    var svg = $('#planOut svg'); if (!svg) return;
    var blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svg.outerHTML], { type: 'image/svg+xml' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'rinova-' + fileSlug() + '-' + currentSheet().code.toLowerCase() + '.svg';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('Lámina ' + currentSheet().code + ' exportada en SVG.');
  }
  $$('[data-export]').forEach(function (b) { b.addEventListener('click', function () { if (!$('#p-planos').classList.contains('on')) { selectTab('planos'); } exportSheet(); }); });
  // Juego completo: una lámina por página, listo para "Guardar como PDF"
  function printSet() {
    if (!plans) return;
    var box = $('#printSheets');
    box.innerHTML = plans.sheets.map(function (sh) { return '<div class="sheet">' + sh.render(sh.kind === 'plan' ? { arq: true, cot: true } : null) + '</div>'; }).join('');
    document.body.classList.add('printing-sheets');
    var done = function () { document.body.classList.remove('printing-sheets'); box.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); setTimeout(done, 1500); }, 60);
  }
  $$('[data-print-set]').forEach(function (b) { b.addEventListener('click', printSet); });

  /* ---------- Análisis experto ---------- */
  var aiRes = null, aiSig = '';
  function sig() { return JSON.stringify([p.energy, p.type, p.state, p.city, p.front, p.depth, p.floors, p.beds, p.baths, p.halfBaths, p.parking, p.layout, p.flooring, p.units, p.finish, p.style, p.bays, p.rooms, p.extra, p.garden, p.walls]); }
  var ST_ICON = { ok: '✓', warn: '!', bad: '×' };
  function md(t) {
    var html = [], list = false;
    esc(t).split(/\n/).forEach(function (ln) {
      var l = ln.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^\s*[-•*]\s+/.test(ln)) { if (!list) { html.push('<ul>'); list = true; } html.push('<li>' + l.replace(/^\s*[-•*]\s+/, '') + '</li>'); return; }
      if (list) { html.push('</ul>'); list = false; }
      if (/^#{1,4}\s/.test(ln)) html.push('<h5>' + l.replace(/^#+\s/, '') + '</h5>');
      else if (ln.trim()) html.push('<p>' + l + '</p>');
    });
    if (list) html.push('</ul>');
    return html.join('');
  }
  function renderAnalysis(r) {
    var A = r.analysis = PR.analyze(p, r, r.planInfo, { nf0: nf0, nf1: nf1, money: money });
    var st = A.score >= 80 ? 'ok' : A.score >= 62 ? 'warn' : 'bad';
    $('#tabExpertChip').className = 'chip ' + st; $('#tabExpertChip').textContent = A.score;
    $('#anScore').textContent = A.score; $('#anScore').style.color = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)' }[st];
    $('#anSummary').textContent = A.summary;
    var lbl = { programa: 'Programa', normativa: 'Normativa', clima: 'Clima y orientación', estructura: 'Estructura', costo: 'Costo' };
    $('#anBars').innerHTML = Object.keys(A.scores).map(function (k) { var v = Math.max(0, Math.min(100, Math.round(A.scores[k]))); return '<div class="cb"><span>' + lbl[k] + '</span><div class="track"><i style="width:' + v + '%;background:' + (v >= 80 ? 'var(--ok)' : v >= 62 ? 'var(--gold)' : 'var(--bad)') + '"></i></div><b>' + v + '</b></div>'; }).join('');
    $('#anRecs').innerHTML = A.recs.length ? A.recs.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') : '<li>Sin pendientes críticos en esta etapa.</li>';
    $('#anOut').innerHTML = A.sections.map(function (sc) {
      var h = '<div class="an-sec"><h4>' + esc(sc.title) + '</h4><ul class="an-list">' + sc.items.map(function (x) { return '<li class="' + x.st + '"><span class="ic">' + ST_ICON[x.st] + '</span><span>' + esc(x.t) + '</span></li>'; }).join('') + '</ul>';
      if (sc.table) h += '<div class="tscroll"><table class="t"><thead><tr>' + sc.table.head.map(function (x, i) { return '<th' + (i && i < 3 ? ' class="r"' : '') + '>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
        sc.table.rows.map(function (rw) { return '<tr><td>' + esc(rw[0]) + '</td><td class="r num">' + rw[1] + '</td><td class="r num">' + rw[2] + '</td><td><span class="chip ' + rw[3] + '"><span class="dot"></span>' + STATE_TXT[rw[3]] + '</span></td></tr>'; }).join('') + '</tbody></table></div>';
      return h + '</div>';
    }).join('');
    var box = $('#aiOut');
    if (aiRes) { box.hidden = false; $('#aiStale').hidden = aiSig === sig(); $('#aiBody').innerHTML = md(aiRes.texto || ''); $('#aiMeta').textContent = aiRes.meta || ''; }
  }
  function aiSummary(r) {
    return { proyecto: { nombre: p.name, tipo: PR.TIPOS[p.type].n, estado: r.city.stateName, ciudad: r.city.short, latitud: r.city.lat, frente_m: p.front, fondo_m: p.depth, niveles: p.floors,
      recamaras: p.beds, banos: p.baths, medios_banos: p.halfBaths, estacionamiento: p.parking, unidades_por_piso: p.units, distribucion: PR.DISTRIBUCION[p.layout], pisos: PR.PISOS[p.flooring].n, acabados: r.fin.name, estilo: STYLE_NAME[p.style] },
      resultados: { area_construida_m2: Math.round(r.area), desplante_m2: Math.round(r.footprint), costo_total_mxn: Math.round(r.total), costo_m2_mxn: Math.round(r.unit), zona_sismica: r.city.zone, coef_sismico: r.city.c, suelo_kpa: r.city.q,
        estructura: r.elements.map(function (e) { return e.name + ' ' + e.sec + ' uso ' + Math.round(e.u * 100) + '%'; }), espacios: r.planInfo },
      revision_por_reglas: { calificacion: r.analysis.score, hallazgos: r.analysis.sections.map(function (sc) { return { area: sc.title, puntos: sc.items.map(function (x) { return x.st + ': ' + x.t; }) }; }) } };
  }
  $('#btnAI').addEventListener('click', function () {
    var r = last || compute(), b = $('#btnAI');
    if (!window.RinovaIA) return;
    b.disabled = true; b.dataset.t = b.dataset.t || b.innerHTML; b.textContent = 'Analizando con RINOVAIA AI…';
    window.RinovaIA.analyze(aiSummary(r)).then(function (res) {
      aiRes = res; aiSig = sig(); renderAnalysis(r);
      $('#aiOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (err) {
      $('#aiOut').hidden = false; $('#aiStale').hidden = true; $('#aiMeta').textContent = '';
      $('#aiBody').innerHTML = '<p class="muted">' + esc(err && err.message ? err.message : 'No fue posible conectar con RINOVAIA AI.') + '</p>';
    }).then(function () { b.disabled = false; b.innerHTML = b.dataset.t; });
  });
  $$('[data-expert]').forEach(function (b) { b.addEventListener('click', function () { selectTab('analisis'); $('.out').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });

  var tt;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 3200); }

  /* ---------- API para los módulos Obra y RINOVAIA AI ---------- */
  window.RinovaEstudio = {
    project: function () { return p; }, result: function () { return last || compute(); },
    simulate: function (o) { var q = p; p = Object.assign({}, p, o); var r = compute(); p = q; return r; },
    money: money, pct: pct, esc: esc, toast: toast, stateOf: stateOf, showView: showView, selectTab: selectTab,
    cities: PR.ESTADOS, styleName: STYLE_NAME, nf0: nf0, nf1: nf1,
    // Para el módulo de croquis
    apply: function (o) { Object.assign(p, o); normalize(p); syncForm(); },
    // Cambio hecho desde otro módulo (editor de espacios): recalcula con el mismo retraso que el formulario
    changed: function () { changed(); },
    generate: generate, sheets: function () { return plans; },
    setCroquis: function (c) { croquis = c; try { if (c) localStorage.setItem(KEY + '.croquis', JSON.stringify(c)); else localStorage.removeItem(KEY + '.croquis'); } catch (e) { } },
    getCroquis: function () { return croquis; },
    showSheet: function (code) { $('#planSheet').value = code; renderPlan(); },
    refresh: function () { renderAll(); }
  };

  syncForm(); renderAll();
  if (location.hash === '#proyectos') showView('projects');
  if (location.hash === '#nuevo') { p = Object.assign({}, DEFAULT, { name: 'Proyecto nuevo', cur: p.cur }); syncForm(); renderAll(); setTimeout(function () { $('#pName').focus(); $('#pName').select(); }, 50); }
  if (location.hash === '#presentar') openPresent();
})();
