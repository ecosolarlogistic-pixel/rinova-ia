/* RINOVAIA — Juego de planos del anteproyecto.
   A partir del programa arquitectónico (recámaras, baños, estacionamiento, tipo de inmueble, distribución)
   reparte los espacios en la planta y dibuja cada lámina en SVG con su cuadro de datos:
   conjunto, plantas por nivel, fachada, corte, estructural, eléctrico, hidrosanitario y croquis de referencia. */
(function () {
  'use strict';
  var PR = window.RinovaProyecto, F = window.RinovaFacade;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n1(v) { return (Math.round(v * 10) / 10).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function n2(v) { return v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function f(v) { return Math.round(v * 10) / 10; }

  var NAVY = '#0B0F17', INK = '#18202B', MUTED = '#5A6475', GOLD = '#B8932A', TECH = '#2F4B7C', SILVER = '#C0C6D4', WATER = '#2f6db0', SEWER = '#c0492f';
  var FILL = { soc: '#FBF8EF', rec: '#F3F6FB', bano: '#EEF6FA', serv: '#F4F5F7', coch: '#F7F7F7', circ: '#FFFFFF', com: '#FBF8EF', alm: '#F6F6F4', ofi: '#F3F6FB', depto: '#FFFFFF', ext: '#F1F7F1' };

  /* ---------- Reparto de espacios (treemap ordenado "squarified") ---------- */
  function squarify(items, x, y, w, h, out) {
    if (!items.length || w <= 0 || h <= 0) return;
    if (items.length === 1) { out.push(Object.assign({}, items[0], { x: x, y: y, w: w, h: h })); return; }
    var side = Math.min(w, h), row = [items[0]], i = 1;
    function sum(r) { return r.reduce(function (s, a) { return s + a.area; }, 0); }
    function worst(r) { var s = sum(r), mx = 0, mn = Infinity; r.forEach(function (a) { mx = Math.max(mx, a.area); mn = Math.min(mn, a.area); }); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); }
    while (i < items.length && worst(row.concat(items[i])) <= worst(row)) { row.push(items[i]); i++; }
    var s = sum(row), k;
    if (w >= h) { var cw = s / h, yy = y; for (k = 0; k < row.length; k++) { var rh = row[k].area / cw; out.push(Object.assign({}, row[k], { x: x, y: yy, w: cw, h: rh })); yy += rh; } squarify(items.slice(i), x + cw, y, w - cw, h, out); }
    else { var rh2 = s / w, xx = x; for (k = 0; k < row.length; k++) { var ww = row[k].area / rh2; out.push(Object.assign({}, row[k], { x: xx, y: y, w: ww, h: rh2 })); xx += ww; } squarify(items.slice(i), x, y + rh2, w, h - rh2, out); }
  }
  // Ajusta las áreas objetivo al área disponible de la franja; los espacios "flex" absorben el resto.
  function fit(list, area, filler) {
    var fixed = 0, wsum = 0;
    list.forEach(function (r) { if (r.flex) wsum += r.w || 1; else fixed += r.a; });
    var items = list.map(function (r) { return Object.assign({}, r); }), scale = 1;
    if (wsum) {
      var rest = area - fixed;
      if (rest < area * 0.25 * Math.min(1, wsum)) { scale = (area * 0.75) / Math.max(1, fixed); rest = area * 0.25; }
      items.forEach(function (r) { r.area = r.flex ? rest * (r.w || 1) / wsum : r.a * scale; });
    } else {
      scale = area / Math.max(1, fixed);
      if (scale > 1.3 && filler) { items.push(Object.assign({ a: area - fixed * 1.15, k: 'ext' }, filler)); items.forEach(function (r) { r.area = r.k === 'ext' ? area - fixed * 1.15 : r.a * 1.15; }); }
      else items.forEach(function (r) { r.area = r.a * scale; });
    }
    // circulaciones primero para que el núcleo quede en la misma esquina en todos los niveles
    items.sort(function (a, b) { return (b.k === 'circ') - (a.k === 'circ'); });
    return items;
  }

  function layoutLevels(p, r) {
    var prog = PR.program(p), levels = [];
    prog.forEach(function (lv, li) {
      var fa = lv.front.reduce(function (s, x) { return s + (x.flex ? 30 * (x.w || 1) : x.a); }, 0);
      var ba = lv.back.reduce(function (s, x) { return s + (x.flex ? 30 * (x.w || 1) : x.a); }, 0);
      var W = r.W, D = r.D, cells = [];
      var hF = !ba ? D : !fa ? 0 : Math.max(0.36, Math.min(0.68, fa / (fa + ba))) * D, hB = D - hF;
      var top = li === 0 ? (p.type === 'casa' ? 'Jardín' : 'Área común') : 'Terraza';
      squarify(fit(lv.back, W * hB, { n: top }), 0, 0, W, hB, cells);
      squarify(fit(lv.front, W * hF, { n: li === 0 ? (p.type === 'casa' ? 'Jardín frontal' : 'Plaza de acceso') : 'Terraza' }), 0, hB, W, hF, cells);
      cells.forEach(function (c) { c.band = c.y < hB - 0.01 ? 'back' : 'front'; c.wk = c.id || 'k:' + c.n + ':' + c.band; });
      var removed = applyWalls(p, li, cells, W, D);
      cells.forEach(function (c) {
        c.m2 = c.w * c.h;
        if (c.unit) { c.sub = []; squarify(fit(unitRooms(p), c.m2 * 0.94), c.x, c.y, c.w, c.h, c.sub); c.sub.forEach(function (s) { s.m2 = s.w * s.h; }); }
      });
      levels.push({ cells: cells, yMid: hB, note: lv.note, removed: removed });
    });
    return levels;
  }
  /* ---------- Muros editables ----------
     p.walls = { m: [{ l, a, b, d }], x: [{ l, a, b }] }: a y b son las claves de los dos espacios que separa el
     muro. «m» desplaza la línea completa del muro d metros (positivo = derecha / hacia la calle) y «x» lo quita
     (los dos espacios quedan integrados). Si el programa cambia y los espacios ya no colindan, se ignora. */
  var WEPS = 0.03, WMIN = 1.2;
  function sharedEdge(A, B) {
    var o = null, c;
    if (Math.abs(A.x + A.w - B.x) < WEPS) { o = 'v'; c = B.x; } else if (Math.abs(B.x + B.w - A.x) < WEPS) { o = 'v'; c = A.x; }
    if (o) { var lo = Math.max(A.y, B.y), hi = Math.min(A.y + A.h, B.y + B.h); if (hi - lo > 0.05) return { o: o, c: c, lo: lo, hi: hi }; }
    o = null;
    if (Math.abs(A.y + A.h - B.y) < WEPS) { o = 'h'; c = B.y; } else if (Math.abs(B.y + B.h - A.y) < WEPS) { o = 'h'; c = A.y; }
    if (o) { var lo2 = Math.max(A.x, B.x), hi2 = Math.min(A.x + A.w, B.x + B.w); if (hi2 - lo2 > 0.05) return { o: o, c: c, lo: lo2, hi: hi2 }; }
    return null;
  }
  // Todos los espacios que tocan la misma línea de muro (recta continua) y de qué lado quedan
  function wallLine(cells, e) {
    var lo = e.lo, hi = e.hi, grow = true, mem = [];
    function span(c) { return e.o === 'v' ? [c.y, c.y + c.h] : [c.x, c.x + c.w]; }
    function side(c) { var a = e.o === 'v' ? c.x : c.y, l = e.o === 'v' ? c.w : c.h; return Math.abs(a + l - e.c) < WEPS ? -1 : Math.abs(a - e.c) < WEPS ? 1 : 0; }
    while (grow) {
      grow = false;
      cells.forEach(function (c) { if (!side(c)) return; var sp = span(c); if (Math.min(hi, sp[1]) - Math.max(lo, sp[0]) > 0.05 && (sp[0] < lo - 1e-6 || sp[1] > hi + 1e-6)) { lo = Math.min(lo, sp[0]); hi = Math.max(hi, sp[1]); grow = true; } });
    }
    cells.forEach(function (c) { var sd = side(c), sp = span(c); if (sd && Math.min(hi, sp[1]) - Math.max(lo, sp[0]) > 0.05) mem.push({ c: c, side: sd }); });
    var mn = -Infinity, mx = Infinity;
    mem.forEach(function (m) { var l = e.o === 'v' ? m.c.w : m.c.h; if (m.side < 0) mn = Math.max(mn, WMIN - l); else mx = Math.min(mx, l - WMIN); });
    return { mem: mem, lo: lo, hi: hi, min: Math.min(0, mn), max: Math.max(0, mx) };
  }
  function moveWall(cells, e, d) {
    var L = wallLine(cells, e); d = Math.max(L.min, Math.min(L.max, d)); if (Math.abs(d) < 1e-3) return 0;
    L.mem.forEach(function (m) {
      if (e.o === 'v') { if (m.side < 0) m.c.w += d; else { m.c.x += d; m.c.w -= d; } }
      else { if (m.side < 0) m.c.h += d; else { m.c.y += d; m.c.h -= d; } }
    });
    return d;
  }
  function byKey(cells, k) { for (var i = 0; i < cells.length; i++) if (cells[i].wk === k) return cells[i]; return null; }
  function applyWalls(p, li, cells) {
    var w = p.walls || {}, out = [];
    (w.m || []).forEach(function (m) {
      if (m.l !== li) return; var A = byKey(cells, m.a), B = byKey(cells, m.b), e = A && B && sharedEdge(A, B);
      if (e) moveWall(cells, e, +m.d || 0);
    });
    (w.x || []).forEach(function (x) { if (x.l === li && byKey(cells, x.a) && byKey(cells, x.b)) out.push({ a: x.a, b: x.b }); });
    return out;
  }
  function isRemoved(lv, a, b) { return (lv.removed || []).some(function (x) { return (x.a === a && x.b === b) || (x.a === b && x.b === a); }); }
  // Muros interiores entre espacios (un tramo por cada par que colinda)
  function wallSegments(lv) {
    var cells = lv.cells, out = [];
    for (var i = 0; i < cells.length; i++) for (var j = i + 1; j < cells.length; j++) {
      var e = sharedEdge(cells[i], cells[j]); if (!e) continue;
      var A = cells[i], B = cells[j];
      // a = izquierda/arriba, b = derecha/abajo
      var aFirst = e.o === 'v' ? A.x < B.x : A.y < B.y;
      e.a = (aFirst ? A : B).wk; e.b = (aFirst ? B : A).wk; e.A = aFirst ? A : B; e.B = aFirst ? B : A;
      e.off = isRemoved(lv, e.a, e.b); out.push(e);
    }
    return out;
  }
  function wallRange(lv, e) { var L = wallLine(lv.cells, e); return { min: L.min, max: L.max }; }
  // Lados de un espacio menos los tramos de muro quitados
  function sideLines(c, offs) {
    var sides = [['h', c.y, c.x, c.x + c.w], ['h', c.y + c.h, c.x, c.x + c.w], ['v', c.x, c.y, c.y + c.h], ['v', c.x + c.w, c.y, c.y + c.h]], out = [];
    sides.forEach(function (sd) {
      var parts = [[sd[2], sd[3]]];
      offs.forEach(function (e) {
        if (e.o !== sd[0] || Math.abs(e.c - sd[1]) > WEPS) return;
        var nx = []; parts.forEach(function (pt) { if (e.hi <= pt[0] || e.lo >= pt[1]) nx.push(pt); else { if (e.lo > pt[0] + 0.02) nx.push([pt[0], e.lo]); if (e.hi < pt[1] - 0.02) nx.push([e.hi, pt[1]]); } }); parts = nx;
      });
      parts.forEach(function (pt) { out.push(sd[0] === 'h' ? [pt[0], sd[1], pt[1], sd[1]] : [sd[1], pt[0], sd[1], pt[1]]); });
    });
    return out;
  }
  var SHORT = { 'Rec. principal': 'Rec. 1', 'Medio baño': '½ B', 'Lavado': 'Lav.', 'Estancia · comedor · cocina': 'Estancia' };
  function unitRooms(p) {
    return PR.deptoRooms(p.beds, p.baths, p.halfBaths, p.layout, p).map(function (r) {
      var renamed = p.rooms && p.rooms[r.id] && p.rooms[r.id].n;
      var n = renamed ? r.n : SHORT[r.n] || r.n.replace(/^Recámara (\d+)$/, 'Rec. $1').replace(/^Baño principal$/, 'Baño');
      return Object.assign({}, r, { n: n });
    });
  }
  /* ---------- Marco de lámina ---------- */
  var VW = 1100, VH = 780, TB = 74;
  function frame(body, meta) {
    var o = [];
    o.push('<svg class="plan-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" font-family="Inter,system-ui,sans-serif" data-sheet="' + esc(meta.code) + '">');
    o.push('<rect width="' + VW + '" height="' + VH + '" fill="#FFFFFF"/>');
    o.push('<rect x="10" y="10" width="' + (VW - 20) + '" height="' + (VH - 20) + '" fill="none" stroke="' + INK + '" stroke-width="1.2"/>');
    o.push(body);
    var y = VH - 10 - TB, x = 10;
    o.push('<g font-size="11" fill="' + MUTED + '">');
    o.push('<rect x="' + x + '" y="' + y + '" width="' + (VW - 20) + '" height="' + TB + '" fill="#FBFCFD" stroke="' + INK + '" stroke-width="1.2"/>');
    o.push('<rect x="' + x + '" y="' + y + '" width="190" height="' + TB + '" fill="' + NAVY + '"/>');
    o.push('<text x="' + (x + 20) + '" y="' + (y + 32) + '" font-family="Montserrat,Inter,sans-serif" font-size="17" font-weight="600" letter-spacing="4" fill="#FFFFFF">RINOVAIA</text>');
    o.push('<text x="' + (x + 20) + '" y="' + (y + 50) + '" font-size="8.5" letter-spacing="1" fill="#A9B1C1">ARQUITECTURA · INGENIERÍA</text>');
    o.push('<rect x="' + (x + 20) + '" y="' + (y + 58) + '" width="34" height="2" fill="#D4AF37"/>');
    var cols = [[210, 'PROYECTO', meta.project, 250], [470, 'UBICACIÓN', meta.loc, 200], [680, 'LÁMINA', meta.name, 230], [920, 'CLAVE', meta.code, 80]];
    cols.forEach(function (c) {
      o.push('<line x1="' + (x + c[0] - 10) + '" y1="' + y + '" x2="' + (x + c[0] - 10) + '" y2="' + (y + TB) + '" stroke="' + SILVER + '"/>');
      o.push('<text x="' + (x + c[0]) + '" y="' + (y + 20) + '" font-size="9" letter-spacing="1.2" font-weight="700">' + c[1] + '</text>');
      o.push('<text x="' + (x + c[0]) + '" y="' + (y + 40) + '" font-size="' + (c[1] === 'CLAVE' ? 18 : 13) + '" font-weight="700" fill="' + INK + '">' + esc(clip(c[2], c[3] / 7.2)) + '</text>');
    });
    o.push('<text x="' + (x + 210) + '" y="' + (y + 62) + '" font-size="10">' + esc(meta.sub || '') + '</text>');
    o.push('<text x="' + (x + 680) + '" y="' + (y + 62) + '" font-size="10">Escala gráfica · Fecha ' + esc(meta.date) + '</text>');
    o.push('<text x="' + (x + 920) + '" y="' + (y + 62) + '" font-size="9" fill="' + GOLD + '" font-weight="700">ANTEPROYECTO</text>');
    o.push('</g></svg>');
    return o.join('');
  }
  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, Math.max(3, n - 1)) + '…' : s; }
  function north(x, y) { return '<g transform="translate(' + x + ' ' + y + ')"><circle r="18" fill="#fff" stroke="' + INK + '"/><path d="M0 -15 L7 10 L0 5 L-7 10Z" fill="' + INK + '"/><text y="-22" text-anchor="middle" font-size="11" font-weight="700" fill="' + INK + '">N</text></g>'; }
  function scaleBar(s) { // s px/m, alineada a la derecha sobre el cuadro de datos
    var step = [1, 2, 5, 10, 20, 50].filter(function (v) { return v * s >= 28; })[0] || 50, w = 4 * step * s, x = VW - 30 - w, y = VH - TB - 30;
    var o = ['<g font-size="9" fill="' + MUTED + '">'];
    for (var i = 0; i < 4; i++) o.push('<rect x="' + f(x + i * step * s) + '" y="' + y + '" width="' + f(step * s) + '" height="5" fill="' + (i % 2 ? '#fff' : INK) + '" stroke="' + INK + '" stroke-width=".6"/>');
    o.push('<text x="' + f(x) + '" y="' + (y + 16) + '">0</text><text x="' + f(x + w) + '" y="' + (y + 16) + '" text-anchor="end">' + 4 * step + ' m</text></g>');
    return o.join('');
  }

  /* ---------- Planta arquitectónica / instalaciones ---------- */
  function planSheet(ctx, li, layers) {
    var p = ctx.p, r = ctx.r, lv = ctx.levels[li];
    var areaW = VW - 220, areaH = VH - TB - 160;
    var s = Math.min(areaW / r.W, areaH / r.D), W = r.W * s, D = r.D * s;
    var x0 = 110 + (areaW - W) / 2, y0 = 70 + (areaH - D) / 2;
    function X(m) { return f(x0 + m * s); } function Y(m) { return f(y0 + m * s); }
    var o = [], i, j, on = layers;
    var bx = r.W / p.bays;

    // Ejes y columnas
    if (on.arq || on.est) {
      o.push('<g stroke="' + SILVER + '" stroke-width=".8" stroke-dasharray="10 4 2 4">');
      for (i = 0; i <= p.bays; i++) o.push('<line x1="' + X(bx * i) + '" y1="' + f(y0 - 36) + '" x2="' + X(bx * i) + '" y2="' + f(y0 + D + 14) + '"/>');
      for (j = 0; j <= r.rows; j++) o.push('<line x1="' + f(x0 - 36) + '" y1="' + Y(r.D / r.rows * j) + '" x2="' + f(x0 + W + 14) + '" y2="' + Y(r.D / r.rows * j) + '"/>');
      o.push('</g><g font-size="10.5" font-weight="700" fill="' + TECH + '" text-anchor="middle">');
      for (i = 0; i <= p.bays; i++) o.push('<circle cx="' + X(bx * i) + '" cy="' + f(y0 - 48) + '" r="10.5" fill="#fff" stroke="' + TECH + '"/><text x="' + X(bx * i) + '" y="' + f(y0 - 44.5) + '">' + (i + 1) + '</text>');
      for (j = 0; j <= r.rows; j++) o.push('<circle cx="' + f(x0 - 48) + '" cy="' + Y(r.D / r.rows * j) + '" r="10.5" fill="#fff" stroke="' + TECH + '"/><text x="' + f(x0 - 48) + '" y="' + f(y0 + r.D / r.rows * j * s + 3.5) + '">' + String.fromCharCode(65 + j) + '</text>');
      o.push('</g>');
    }
    var faint = !on.arq;
    // Espacios
    o.push('<g>');
    lv.cells.forEach(function (c) {
      o.push('<rect' + (c.id ? ' data-rid="' + esc(c.id) + '"' : '') + ' x="' + X(c.x) + '" y="' + Y(c.y) + '" width="' + f(c.w * s) + '" height="' + f(c.h * s) + '" fill="' + (faint ? '#fff' : FILL[c.k] || '#fff') + '"/>');
      if (c.sub) c.sub.forEach(function (u) { if (u.id) o.push('<rect data-rid="' + esc(u.id) + '" x="' + X(u.x) + '" y="' + Y(u.y) + '" width="' + f(u.w * s) + '" height="' + f(u.h * s) + '" fill="transparent"/>'); });
    });
    o.push('</g>');
    // Mobiliario
    if (on.arq) o.push(furniture(lv.cells, X, Y, s, p, r));
    // Muros interiores
    o.push('<g fill="none" stroke="' + (faint ? '#9AA3B2' : INK) + '" stroke-linecap="square">');
    var segs = wallSegments(lv), offs = segs.filter(function (e) { return e.off; });
    lv.cells.forEach(function (c) {
      var attr = ' stroke-width="' + (c.k === 'ext' ? 1 : 2.6) + '"' + (c.k === 'ext' ? ' stroke-dasharray="4 3"' : '');
      if (!offs.length) o.push('<rect x="' + X(c.x) + '" y="' + Y(c.y) + '" width="' + f(c.w * s) + '" height="' + f(c.h * s) + '"' + attr + '/>');
      else sideLines(c, offs).forEach(function (q) { o.push('<line x1="' + X(q[0]) + '" y1="' + Y(q[1]) + '" x2="' + X(q[2]) + '" y2="' + Y(q[3]) + '"' + attr + '/>'); });
      if (c.sub) c.sub.forEach(function (u) { o.push('<rect x="' + X(u.x) + '" y="' + Y(u.y) + '" width="' + f(u.w * s) + '" height="' + f(u.h * s) + '" stroke-width="1.2"/>'); });
    });
    o.push('<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(W) + '" height="' + f(D) + '" stroke-width="5.5"/></g>');
    // Columnas
    if (on.arq || on.est) {
      var cs = Math.max(6, Math.min(14, (r.col.s[0] / 100) * s));
      o.push('<g fill="' + INK + '">');
      for (i = 0; i <= p.bays; i++) for (j = 0; j <= r.rows; j++) o.push('<rect x="' + f(X(bx * i) - cs / 2) + '" y="' + f(Y(r.D / r.rows * j) - cs / 2) + '" width="' + f(cs) + '" height="' + f(cs) + '"/>');
      o.push('</g>');
    }
    // Puertas y ventanas
    if (on.arq) o.push(openings(lv, X, Y, s, li, r, p));
    // Rótulos
    o.push('<g text-anchor="middle" fill="' + INK + '">');
    lv.cells.forEach(function (c) {
      var fs = c.w * s > 130 && c.h * s > 60 ? 13 : c.w * s > 70 ? 11 : 9.5, cx = X(c.x + c.w / 2), cy = Y(c.y + c.h / 2);
      if (c.sub) {
        o.push('<text x="' + cx + '" y="' + f(Y(c.y) + 15) + '" font-size="11" font-weight="800" fill="' + TECH + '">' + esc(c.n.toUpperCase()) + ' · ' + n1(c.m2) + ' m²</text>');
        if (on.arq) c.sub.forEach(function (u) { if (u.w * s > 34 && u.h * s > 22) o.push('<text x="' + X(u.x + u.w / 2) + '" y="' + f(Y(u.y + u.h / 2) + 3) + '" font-size="' + (u.w * s > 70 ? 10 : 8.5) + '" font-weight="600">' + esc(u.n) + '</text>'); });
        return;
      }
      if (c.w * s < 40 || c.h * s < 26) return;
      o.push('<text x="' + cx + '" y="' + f(cy - 2) + '" font-size="' + fs + '" font-weight="700">' + esc(clip(c.n, c.w * s / (fs * 0.58))) + '</text>');
      o.push('<text x="' + cx + '" y="' + f(cy + fs + 1) + '" font-size="' + (fs - 2) + '" fill="' + MUTED + '">' + n1(c.m2) + ' m²</text>');
    });
    o.push('</g>');
    if (on.ele) o.push(electric(lv, X, Y, s, li, x0, y0, D));
    if (on.hid) o.push(hydraulic(lv, X, Y, s, x0, y0, W, D));
    // Cotas
    if (on.cot) {
      o.push('<g stroke="' + GOLD + '" fill="' + GOLD + '" font-size="11.5" font-weight="600" stroke-width="1">');
      var cy2 = y0 + D + 40;
      o.push('<line x1="' + f(x0) + '" y1="' + f(cy2) + '" x2="' + f(x0 + W) + '" y2="' + f(cy2) + '"/>');
      for (i = 0; i <= p.bays; i++) o.push('<line x1="' + X(bx * i) + '" y1="' + f(cy2 - 5) + '" x2="' + X(bx * i) + '" y2="' + f(cy2 + 5) + '"/>');
      o.push('<text x="' + f(x0 + W / 2) + '" y="' + f(cy2 + 18) + '" text-anchor="middle" stroke="none">' + n2(r.W) + ' m</text>');
      if (bx * s > 46) for (i = 0; i < p.bays; i++) o.push('<text x="' + X(bx * (i + 0.5)) + '" y="' + f(cy2 - 5) + '" text-anchor="middle" stroke="none" font-size="9.5">' + n2(bx) + '</text>');
      var cx2 = x0 + W + 34;
      o.push('<line x1="' + f(cx2) + '" y1="' + f(y0) + '" x2="' + f(cx2) + '" y2="' + f(y0 + D) + '"/><line x1="' + f(cx2 - 5) + '" y1="' + f(y0) + '" x2="' + f(cx2 + 5) + '" y2="' + f(y0) + '"/><line x1="' + f(cx2 - 5) + '" y1="' + f(y0 + D) + '" x2="' + f(cx2 + 5) + '" y2="' + f(y0 + D) + '"/>');
      o.push('<text x="' + f(cx2 + 10) + '" y="' + f(y0 + D / 2) + '" stroke="none" transform="rotate(90 ' + f(cx2 + 10) + ' ' + f(y0 + D / 2) + ')" text-anchor="middle">' + n2(r.D) + ' m</text>');
      o.push('</g>');
    }
    if (li === 0 && on.arq) o.push('<text x="' + f(x0 + W / 2) + '" y="' + f(y0 + D + 72) + '" font-size="11" font-weight="700" letter-spacing="3" text-anchor="middle" fill="' + MUTED + '">— C A L L E —</text>');
    o.push(north(VW - 60, 62));
    o.push(scaleBar(s));
    o.push(legend(on));
    // Capa para tocar y arrastrar muros (solo en «Planos por nivel»)
    if (on.edit) {
      o.push('<g class="es-walls" data-s="' + f(s) + '" fill="none">');
      segs.forEach(function (e) {
        var rg = wallRange(lv, e), x1 = e.o === 'v' ? X(e.c) : X(e.lo), y1 = e.o === 'v' ? Y(e.lo) : Y(e.c), x2 = e.o === 'v' ? X(e.c) : X(e.hi), y2 = e.o === 'v' ? Y(e.hi) : Y(e.c);
        var nm = function (C) { return C.k === 'ext' ? C.n : (p.rooms && p.rooms[C.id] && p.rooms[C.id].n) || C.n; };
        o.push('<g data-wall="' + esc(e.a + '|' + e.b) + '" data-o="' + e.o + '" data-len="' + f(e.hi - e.lo) + '" data-min="' + f(rg.min) + '" data-max="' + f(rg.max) + '" data-na="' + esc(nm(e.A)) + '" data-nb="' + esc(nm(e.B)) + '"' + (e.off ? ' data-off="1"' : '') + '>' +
          (e.off ? '<line class="wl-off" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="#9AA3B2" stroke-width="1.2" stroke-dasharray="5 4"/>' : '') +
          '<line class="wl-mark" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="transparent" stroke-width="7" stroke-linecap="round"/>' +
          '<line class="wl-hit" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="transparent" stroke-width="22" pointer-events="stroke"/></g>');
      });
      o.push('</g>');
    }
    return o.join('');
  }
  function legend(on) {
    var it = [];
    if (on.ele) it.push(['<circle r="5" fill="#fff" stroke="' + GOLD + '"/><path d="M-3.5 -3.5l7 7M3.5 -3.5l-7 7" stroke="' + GOLD + '"/>', 'Luminaria'], ['<path d="M-2 -5 a5 5 0 0 1 0 10z" fill="#fff" stroke="' + GOLD + '"/>', 'Contacto'], ['<rect x="-6" y="-4" width="12" height="8" fill="' + GOLD + '"/>', 'Tablero']);
    if (on.hid) it.push(['<line x1="-8" x2="8" stroke="' + WATER + '" stroke-width="2"/>', 'Agua fría'], ['<line x1="-8" x2="8" stroke="' + SEWER + '" stroke-width="2" stroke-dasharray="4 3"/>', 'Drenaje'], ['<rect x="-5" y="-5" width="10" height="10" fill="#fff" stroke="' + SEWER + '"/>', 'Registro']);
    if (!it.length) return '';
    return '<g font-size="10" fill="' + MUTED + '">' + it.map(function (x, i) { return '<g transform="translate(' + (VW - 140) + ' ' + (120 + i * 22) + ')">' + x[0] + '<text x="14" y="3.5">' + x[1] + '</text></g>'; }).join('') + '</g>';
  }
  // Equipamiento agregado en el espacio (tina, jacuzzi, chimenea, isla…): símbolo a escala con rótulo
  var FXDIM = { tina: [1.7, 0.8], jacuzzi: [2.0, 2.0], regadera: [1.2, 1.0], lavabo2: [1.5, 0.55], vestidor: [2.0, 0.6], escritorio: [1.3, 0.6], estar: [2.0, 0.9], chimenea: [1.5, 0.45], bar: [2.2, 0.6], cava: [1.6, 0.5], isla: [2.2, 1.0], desayunador: [1.2, 1.2] };
  function fixtures(o, c, x, y, w, h, s) {
    var slots = [[1, 1], [0, 1], [1, 0.5], [0, 0.5]];
    c.fx.forEach(function (k, i) {
      var dm = FXDIM[k] || [1, 1], fw = Math.min(dm[0] * s, w * 0.42), fh = Math.min(dm[1] * s, h * 0.38), sl = slots[i % 4];
      var fx0 = sl[0] ? x + w - fw - 5 : x + 5, fy0 = sl[1] === 1 ? y + h - fh - 5 : y + h / 2 - fh / 2;
      var g = '<g stroke="' + TECH + '" stroke-width="1.1">';
      if (k === 'tina') g += '<rect x="' + f(fx0) + '" y="' + f(fy0) + '" width="' + f(fw) + '" height="' + f(fh) + '" rx="' + f(Math.min(fw, fh) * 0.25) + '" fill="#EEF6FA"/><rect x="' + f(fx0 + 3) + '" y="' + f(fy0 + 3) + '" width="' + f(fw - 6) + '" height="' + f(fh - 6) + '" rx="' + f(Math.min(fw, fh) * 0.3) + '"/>';
      else if (k === 'jacuzzi') { var rr = Math.min(fw, fh) / 2; g += '<rect x="' + f(fx0) + '" y="' + f(fy0) + '" width="' + f(rr * 2) + '" height="' + f(rr * 2) + '" rx="3" fill="#EEF6FA"/><circle cx="' + f(fx0 + rr) + '" cy="' + f(fy0 + rr) + '" r="' + f(rr * 0.78) + '"/><circle cx="' + f(fx0 + rr) + '" cy="' + f(fy0 + rr) + '" r="' + f(rr * 0.15) + '"/>'; fw = rr * 2; fh = rr * 2; }
      else if (k === 'chimenea') g += '<rect x="' + f(fx0) + '" y="' + f(fy0) + '" width="' + f(fw) + '" height="' + f(fh) + '" fill="#F3E6D8"/><path d="M' + f(fx0 + fw * 0.3) + ' ' + f(fy0 + fh) + 'l' + f(fw * 0.2) + ' ' + f(-fh * 0.8) + 'l' + f(fw * 0.2) + ' ' + f(fh * 0.8) + '"/>';
      else if (k === 'isla' || k === 'bar') g += '<rect x="' + f(fx0) + '" y="' + f(fy0) + '" width="' + f(fw) + '" height="' + f(fh) + '" fill="#F1EFEA"/><circle cx="' + f(fx0 + fw * 0.25) + '" cy="' + f(fy0 + fh + 5) + '" r="3.5"/><circle cx="' + f(fx0 + fw * 0.75) + '" cy="' + f(fy0 + fh + 5) + '" r="3.5"/>';
      else if (k === 'desayunador') g += '<circle cx="' + f(fx0 + fw / 2) + '" cy="' + f(fy0 + fh / 2) + '" r="' + f(Math.min(fw, fh) * 0.35) + '" fill="#F1EFEA"/>';
      else g += '<rect x="' + f(fx0) + '" y="' + f(fy0) + '" width="' + f(fw) + '" height="' + f(fh) + '" fill="#F4F6FA" stroke-dasharray="' + (k === 'vestidor' || k === 'cava' ? '3 2' : '0') + '"/>';
      g += '</g>';
      if (fw > 22 && fh > 9) g += '<text x="' + f(fx0 + fw / 2) + '" y="' + f(fy0 + fh / 2 + 3) + '" font-size="7.5" font-weight="700" text-anchor="middle" fill="' + TECH + '" stroke="none">' + esc(PR.EQUIPO[k] ? PR.EQUIPO[k].n.split(' ')[0] : k) + '</text>';
      o.push(g);
    });
  }
  function furniture(cells, X, Y, s, p, r) {
    var evLeft = r && r.energy ? r.energy.chargers : 0;
    var o = ['<g fill="none" stroke="#7D8696" stroke-width="1">'];
    function all(c) { return c.sub ? c.sub : [c]; }
    cells.forEach(function (c0) {
      all(c0).forEach(function (c) {
        var x = X(c.x), y = Y(c.y), w = c.w * s, h = c.h * s, m = Math.min(w, h);
        if (w < 26 || h < 26) return;
        var use = c.use || PR.useOf(c.n, c.k);
        if (c.fx && c.fx.length) fixtures(o, c, x, y, w, h, s);
        if (use === 'estudio' && (c.k === 'rec' || c.k === 'soc')) { // escritorio y librero
          var dw2 = Math.min(w * 0.5, 1.4 * s); o.push('<rect x="' + f(x + w / 2 - dw2 / 2) + '" y="' + f(y + 5) + '" width="' + f(dw2) + '" height="' + f(Math.min(h * 0.2, 0.65 * s)) + '"/><circle cx="' + f(x + w / 2) + '" cy="' + f(y + 5 + Math.min(h * 0.2, 0.65 * s) + 0.35 * s) + '" r="' + f(0.25 * s) + '"/><rect x="' + f(x + 5) + '" y="' + f(y + h * 0.3) + '" width="' + f(Math.min(w * 0.12, 0.36 * s)) + '" height="' + f(h * 0.5) + '"/>');
        } else if (use === 'gimnasio' && (c.k === 'rec' || c.k === 'soc')) {
          for (var gm = 0; gm < 3; gm++) o.push('<rect x="' + f(x + w * (0.12 + gm * 0.28)) + '" y="' + f(y + h * 0.3) + '" width="' + f(w * 0.18) + '" height="' + f(h * 0.4) + '" rx="3" stroke-dasharray="3 2"/>');
        } else if ((use === 'tv' || use === 'juegos') && (c.k === 'rec' || c.k === 'soc')) {
          var sw0 = Math.min(w * 0.55, 2.4 * s); o.push('<path d="M' + f(x + w / 2 - sw0 / 2) + ' ' + f(y + h - 0.95 * s) + 'h' + f(sw0) + 'v' + f(0.8 * s) + 'h' + f(-sw0) + 'z"/><line x1="' + f(x + w / 2 - sw0 * 0.4) + '" y1="' + f(y + 6) + '" x2="' + f(x + w / 2 + sw0 * 0.4) + '" y2="' + f(y + 6) + '" stroke-width="3"/>');
        } else if (c.k === 'rec' && c.n.indexOf('Vestidor') < 0) { // cama
          var bw = Math.min(w * 0.55, (use === 'principal' || c.n === 'Rec. 1' ? 1.9 : use === 'bebe' ? 0.8 : 1.35) * s), bh = Math.min(h * 0.6, (use === 'bebe' ? 1.3 : 2.0) * s);
          var bxp = x + (w - bw) / 2, byp = y + 6;
          o.push('<rect x="' + f(bxp) + '" y="' + f(byp) + '" width="' + f(bw) + '" height="' + f(bh) + '" rx="2"/><line x1="' + f(bxp) + '" y1="' + f(byp + bh * 0.22) + '" x2="' + f(bxp + bw) + '" y2="' + f(byp + bh * 0.22) + '"/>');
        } else if (c.k === 'bano') {
          var r1 = Math.min(0.22 * s, m * 0.16);
          o.push('<ellipse cx="' + f(x + w - r1 - 6) + '" cy="' + f(y + r1 * 1.4 + 6) + '" rx="' + f(r1) + '" ry="' + f(r1 * 1.3) + '"/><rect x="' + f(x + 6) + '" y="' + f(y + 6) + '" width="' + f(Math.min(0.5 * s, w * 0.3)) + '" height="' + f(Math.min(0.4 * s, h * 0.25)) + '" rx="3"/>');
          if (c.n.indexOf('Medio') < 0 && c.n !== '½ B' && h > 50) o.push('<rect x="' + f(x + 6) + '" y="' + f(y + h - Math.min(0.9 * s, h * 0.4) - 6) + '" width="' + f(Math.min(0.9 * s, w * 0.45)) + '" height="' + f(Math.min(0.9 * s, h * 0.4)) + '"/><path d="M' + f(x + 6) + ' ' + f(y + h - 6) + 'l' + f(Math.min(0.9 * s, w * 0.45)) + ' ' + f(-Math.min(0.9 * s, h * 0.4)) + '"/>');
        } else if (c.k === 'coch') {
          var cars = c.cars || 1, cw = 2.5 * s, ch = 5 * s, nfit = Math.max(1, Math.floor(w / cw)), rowsC = Math.max(1, Math.floor(h / (ch + (h > ch * 2 + 6 * s ? 0 : 0))));
          var cap = Math.min(cars, nfit * Math.min(rowsC, 2));
          for (var q = 0; q < cap; q++) { var ci = q % nfit, cr = Math.floor(q / nfit), cxp = x + ci * cw + cw * 0.12, cyp = cr === 0 ? y + h - ch + 0.3 * s : y + 0.3 * s; o.push('<rect x="' + f(cxp) + '" y="' + f(cyp) + '" width="' + f(cw * 0.76) + '" height="' + f(ch * 0.88) + '" rx="' + f(cw * 0.2) + '"/><line x1="' + f(cxp) + '" y1="' + f(cyp + ch * 0.3) + '" x2="' + f(cxp + cw * 0.76) + '" y2="' + f(cyp + ch * 0.3) + '"/>'); }
          c.drawnCars = cap;
          // cargadores para autos eléctricos en el muro del fondo de la cochera
          for (var ev = 0; ev < Math.min(evLeft, cap); ev++) { var ex = x + (ev % nfit) * cw + cw * 0.5, ey = y + 4; o.push('<g stroke="' + GOLD + '" stroke-width="1.3"><rect x="' + f(ex - 7) + '" y="' + f(ey) + '" width="14" height="9" fill="#FFF8E1"/><path d="M' + f(ex + 1) + ' ' + f(ey + 1.5) + 'l-3 3.5h3l-2 3" fill="none"/></g>'); }
          if (evLeft) o.push('<text x="' + f(x + w / 2) + '" y="' + f(y + 22) + '" font-size="8" font-weight="700" text-anchor="middle" fill="' + GOLD + '" stroke="none">CARGADOR EV</text>');
          evLeft = 0;
        } else if (c.k === 'circ' && c.n.indexOf('Escalera') === 0) {
          var stW = Math.min(w, 2.6 * s); o.push('<rect x="' + f(x + 4) + '" y="' + f(y + 4) + '" width="' + f(stW - 8) + '" height="' + f(h - 8) + '"/>');
          for (var st = 1; st < 14; st++) o.push('<line x1="' + f(x + 4) + '" y1="' + f(y + 4 + (h - 8) * st / 14) + '" x2="' + f(x + stW - 4) + '" y2="' + f(y + 4 + (h - 8) * st / 14) + '"/>');
          o.push('<path d="M' + f(x + stW / 2) + ' ' + f(y + h - 10) + 'V' + f(y + 14) + 'l-4 6m4 -6l4 6" stroke="' + INK + '"/>');
          if (c.n.indexOf('elevador') > -1 && w > stW + 1.8 * s) o.push('<rect x="' + f(x + stW + 6) + '" y="' + f(y + 6) + '" width="' + f(1.8 * s) + '" height="' + f(1.8 * s) + '"/><path d="M' + f(x + stW + 6) + ' ' + f(y + 6) + 'l' + f(1.8 * s) + ' ' + f(1.8 * s) + 'M' + f(x + stW + 6 + 1.8 * s) + ' ' + f(y + 6) + 'l' + f(-1.8 * s) + ' ' + f(1.8 * s) + '"/>');
        } else if (/Cocina/.test(c.n) || c.n === 'Estancia' || c.n === 'Estancia · comedor · cocina') {
          var kd = 0.6 * s; o.push('<path d="M' + f(x + 4) + ' ' + f(y + 4) + 'h' + f(Math.min(w * 0.6, 3.2 * s)) + 'v' + f(kd) + 'h' + f(-Math.min(w * 0.6, 3.2 * s) + kd) + 'v' + f(Math.min(h * 0.5, 2.2 * s)) + 'h' + f(-kd) + 'z"/>');
          o.push('<circle cx="' + f(x + 4 + kd * 1.6) + '" cy="' + f(y + 4 + kd / 2) + '" r="' + f(kd * 0.3) + '"/><circle cx="' + f(x + 4 + kd * 2.5) + '" cy="' + f(y + 4 + kd / 2) + '" r="' + f(kd * 0.3) + '"/>');
        } else if (/Comedor|Sala · comedor/.test(c.n)) {
          var tw = Math.min(w * 0.4, 1.8 * s), th = Math.min(h * 0.3, 1.0 * s); o.push('<rect x="' + f(x + w / 2 - tw / 2) + '" y="' + f(y + h * 0.62 - th / 2) + '" width="' + f(tw) + '" height="' + f(th) + '" rx="2"/>');
        } else if (/^Sala$|Estancia familiar/.test(c.n)) {
          var sw = Math.min(w * 0.55, 2.4 * s); o.push('<path d="M' + f(x + w / 2 - sw / 2) + ' ' + f(y + h - 0.95 * s) + 'h' + f(sw) + 'v' + f(0.8 * s) + 'h' + f(-sw) + 'z"/><rect x="' + f(x + w / 2 - sw * 0.3) + '" y="' + f(y + h - 2.1 * s) + '" width="' + f(sw * 0.6) + '" height="' + f(0.6 * s) + '" rx="2"/>');
        } else if (c.k === 'alm') {
          for (var rk = 0; rk * 3 * s < w - 2 * s; rk++) o.push('<rect x="' + f(x + s + rk * 3 * s) + '" y="' + f(y + 0.12 * h) + '" width="' + f(1.1 * s) + '" height="' + f(h * 0.76) + '" stroke-dasharray="3 2"/>');
        } else if (c.k === 'serv' && /Andenes/.test(c.n)) {
          var dk = c.docks || 1; for (var d = 0; d < dk; d++) { var dw = w / dk; o.push('<rect x="' + f(x + d * dw + dw * 0.15) + '" y="' + f(y + 3) + '" width="' + f(dw * 0.7) + '" height="' + f(Math.min(h * 0.35, 1.2 * s)) + '" fill="#E9EDF2"/>'); }
        } else if (c.k === 'ext') {
          for (var t = 0; t < 3; t++) o.push('<circle cx="' + f(x + w * (0.25 + t * 0.25)) + '" cy="' + f(y + h * (t % 2 ? 0.35 : 0.65)) + '" r="' + f(Math.min(m * 0.12, 0.9 * s)) + '" stroke="#7FA685"/>');
        }
      });
    });
    o.push('</g>');
    return o.join('');
  }
  function openings(lv, X, Y, s, li, r, p) {
    var offs = wallSegments(lv).filter(function (e) { return e.off; });
    var o = [], dw = Math.min(0.9 * s, 30);
    lv.cells.forEach(function (c) {
      if (c.k === 'ext') return;
      // puerta hacia la franja central (o hacia arriba si es interior de franja)
      var towardMid = c.band === 'front' ? c.y : c.y + c.h, dy = Y(towardMid);
      if (c.w * s < dw * 1.6) return;
      var dx = X(c.x + c.w / 2) - dw / 2, dir = c.band === 'front' ? 1 : -1;
      if (c.k === 'coch' || c.k === 'alm' || (c.k === 'com' && li === 0)) return;
      var mx = c.x + c.w / 2;
      if (offs.some(function (e) { return e.o === 'h' && Math.abs(e.c - towardMid) < WEPS && mx > e.lo && mx < e.hi; })) return;
      o.push('<rect x="' + f(dx) + '" y="' + f(dy - 3) + '" width="' + f(dw) + '" height="6" fill="#fff"/>');
      o.push('<path d="M' + f(dx) + ' ' + f(dy) + ' v' + f(dir * dw) + ' A' + f(dw) + ' ' + f(dw) + ' 0 0 ' + (dir > 0 ? 0 : 1) + ' ' + f(dx + dw) + ' ' + f(dy) + '" fill="none" stroke="' + MUTED + '" stroke-width="1"/>');
    });
    // ventanas en fachada y fondo para espacios habitables
    o.push('<g stroke="' + TECH + '" stroke-width="1.4">');
    lv.cells.forEach(function (c) {
      var hab = /soc|rec|ofi|depto|com/.test(c.k) || (c.k === 'serv' && /Cocina/.test(c.n));
      if (!hab) return;
      var edges = [];
      if (c.y + c.h >= r.D - 0.01) edges.push(Y(r.D)); if (c.y <= 0.01) edges.push(Y(0));
      edges.forEach(function (ey) {
        var wx = X(c.x + c.w * 0.2), ww = c.w * s * 0.6;
        o.push('<rect x="' + f(wx) + '" y="' + f(ey - 3) + '" width="' + f(ww) + '" height="6" fill="#fff" stroke="none"/><line x1="' + f(wx) + '" y1="' + f(ey - 2) + '" x2="' + f(wx + ww) + '" y2="' + f(ey - 2) + '"/><line x1="' + f(wx) + '" y1="' + f(ey + 2) + '" x2="' + f(wx + ww) + '" y2="' + f(ey + 2) + '"/>');
      });
    });
    o.push('</g>');
    if (li === 0) { // acceso principal
      var acc = lv.cells.filter(function (c) { return c.band === 'front' && c.k !== 'coch' && c.k !== 'ext'; })[0] || lv.cells[0];
      var ax = X(acc.x + acc.w / 2) - dw * 0.7, ay = Y(r.D);
      o.push('<rect x="' + f(ax) + '" y="' + f(ay - 4) + '" width="' + f(dw * 1.4) + '" height="8" fill="#fff"/><path d="M' + f(ax + dw * 0.7) + ' ' + f(ay + 26) + 'v-16" stroke="' + GOLD + '" stroke-width="2"/><path d="M' + f(ax + dw * 0.7 - 5) + ' ' + f(ay + 14) + 'l5 -6l5 6" fill="none" stroke="' + GOLD + '" stroke-width="2"/><text x="' + f(ax + dw * 0.7) + '" y="' + f(ay + 38) + '" font-size="10" font-weight="700" text-anchor="middle" fill="' + GOLD + '">ACCESO</text>');
      var coch = lv.cells.filter(function (c) { return c.k === 'coch'; })[0];
      if (coch) { var gx = X(coch.x + coch.w * 0.1), gw = coch.w * s * 0.8; o.push('<rect x="' + f(gx) + '" y="' + f(ay - 4) + '" width="' + f(gw) + '" height="8" fill="#fff"/><line x1="' + f(gx) + '" y1="' + f(ay) + '" x2="' + f(gx + gw) + '" y2="' + f(ay) + '" stroke="' + MUTED + '" stroke-dasharray="6 3"/>'); }
    }
    return o.join('');
  }
  function electric(lv, X, Y, s, li, x0, y0, D) {
    var o = [], tb = { x: x0 + 16, y: y0 + lv.yMid * s + 14 };
    var pts = [];
    lv.cells.forEach(function (c) { (c.sub || [c]).forEach(function (u) { if (u.w * s > 30 && u.h * s > 30 && u.k !== 'ext') pts.push(u); }); });
    o.push('<g stroke="' + GOLD + '" fill="none" stroke-width="1.1" opacity=".75">');
    pts.forEach(function (c) { var cx = X(c.x + c.w / 2), cy = Y(c.y + c.h * 0.3); o.push('<path d="M' + cx + ' ' + cy + ' Q' + f((cx + tb.x) / 2) + ' ' + f(Math.min(cy, tb.y) - 30) + ' ' + f(tb.x) + ' ' + f(tb.y) + '" stroke-dasharray="5 3"/>'); });
    o.push('</g><g stroke="' + GOLD + '" stroke-width="1.3" fill="#fff">');
    pts.forEach(function (c) {
      var cx = X(c.x + c.w / 2), cy = Y(c.y + c.h * 0.3);
      o.push('<circle cx="' + cx + '" cy="' + cy + '" r="6"/><path d="M' + f(cx - 4.2) + ' ' + f(cy - 4.2) + 'l8.4 8.4M' + f(cx + 4.2) + ' ' + f(cy - 4.2) + 'l-8.4 8.4"/>');
      [[X(c.x) + 6, Y(c.y + c.h * 0.72), 1], [X(c.x + c.w) - 6, Y(c.y + c.h * 0.72), 0]].forEach(function (pt) { o.push('<path d="M' + f(pt[0]) + ' ' + f(pt[1] - 5) + ' a5 5 0 0 ' + pt[2] + ' 0 10z"/>'); });
    });
    o.push('</g><rect x="' + f(tb.x - 9) + '" y="' + f(tb.y - 7) + '" width="18" height="14" fill="' + GOLD + '"/><text x="' + f(tb.x + 14) + '" y="' + f(tb.y + 4) + '" font-size="10" font-weight="700" fill="' + GOLD + '">TAB-' + (li === 0 ? 'PB' : 'N' + li) + '</text>');
    return o.join('');
  }
  function hydraulic(lv, X, Y, s, x0, y0, W, D) {
    var o = [], wet = [];
    lv.cells.forEach(function (c) { (c.sub || [c]).forEach(function (u) { if (u.k === 'bano' || /Cocina|Lav|Patio de servicio|Estancia|Sanitarios|Cuarto de máquinas/.test(u.n) || (u.fx || []).some(function (x) { return PR.EQUIPO[x] && PR.EQUIPO[x].wet; })) wet.push(u); }); });
    var tx = x0 + 12, ty = y0 + D + 30, mid = y0 + lv.yMid * s, reg = { x: x0 + W - 18, y: y0 + D + 22 };
    o.push('<g fill="none" stroke-width="1.8">');
    wet.forEach(function (c, k) {
      var cx = X(c.x + c.w * 0.3), cy = Y(c.y + c.h * 0.4), off = (k % 4) * 3;
      o.push('<path d="M' + f(tx) + ' ' + f(ty) + ' V' + f(mid + off) + ' H' + cx + ' V' + cy + '" stroke="' + WATER + '"/>');
      var sx = X(c.x + c.w * 0.7), sy = Y(c.y + c.h * 0.6);
      o.push('<path d="M' + sx + ' ' + sy + ' V' + f(mid - 6 - off) + ' H' + f(reg.x) + ' V' + f(reg.y) + '" stroke="' + SEWER + '" stroke-dasharray="6 4"/>');
    });
    o.push('</g><g fill="#fff" stroke-width="1.4">');
    wet.forEach(function (c) { o.push('<circle cx="' + X(c.x + c.w * 0.3) + '" cy="' + Y(c.y + c.h * 0.4) + '" r="4" stroke="' + WATER + '"/>'); });
    o.push('<rect x="' + f(reg.x - 7) + '" y="' + f(reg.y - 7) + '" width="14" height="14" stroke="' + SEWER + '"/></g>');
    o.push('<g font-size="9.5" font-weight="700"><text x="' + f(tx + 6) + '" y="' + f(ty + 4) + '" fill="' + WATER + '">TOMA Ø 19 mm</text><text x="' + f(reg.x - 10) + '" y="' + f(reg.y + 20) + '" text-anchor="end" fill="' + SEWER + '">REGISTRO · A COLECTOR</text></g>');
    return o.join('');
  }

  /* ---------- Conjunto ---------- */
  function siteSheet(ctx) {
    var p = ctx.p, r = ctx.r, o = [];
    var areaW = VW - 260, areaH = VH - TB - 150, s = Math.min(areaW / p.front, areaH / p.depth);
    var LW = p.front * s, LD = p.depth * s, x0 = 130 + (areaW - LW) / 2, y0 = 60 + (areaH - LD) / 2;
    var yard = PR.siteYard(p, r);
    var sideM = (p.front - r.W) / 2, rear = yard ? yard.rear : p.depth * 0.03, setback = p.depth - r.D - rear;
    var bx = x0 + sideM * s, by = y0 + rear * s;
    o.push('<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(LW) + '" height="' + f(LD) + '" fill="#F1F7F1" stroke="' + INK + '" stroke-width="1.5" stroke-dasharray="14 4 3 4"/>');
    o.push('<rect x="' + f(bx) + '" y="' + f(by) + '" width="' + f(r.W * s) + '" height="' + f(r.D * s) + '" fill="#E9EDF2" stroke="' + INK + '" stroke-width="3"/>');
    o.push('<g stroke="' + INK + '" stroke-width=".5" opacity=".35">');
    for (var h = -r.D * s; h < r.W * s; h += 10) o.push('<line x1="' + f(Math.max(bx, bx + h)) + '" y1="' + f(by + (h < 0 ? -h : 0)) + '" x2="' + f(Math.min(bx + r.W * s, bx + h + r.D * s)) + '" y2="' + f(by + Math.min(r.D * s, r.W * s - h)) + '"/>');
    o.push('</g>');
    if (r.energy && r.energy.layout) o.push(pvSvg(r.energy.layout, function (m) { return f(bx + m * s); }, function (m) { return f(by + m * s); }, s, 0.55));
    o.push('<text x="' + f(bx + r.W * s / 2) + '" y="' + f(by + r.D * s / 2) + '" text-anchor="middle" font-size="14" font-weight="800" fill="' + INK + '">' + esc(PR.TIPOS[p.type].n.toUpperCase()) + '</text>');
    o.push('<text x="' + f(bx + r.W * s / 2) + '" y="' + f(by + r.D * s / 2 + 18) + '" text-anchor="middle" font-size="11" fill="' + MUTED + '">' + p.floors + (p.floors === 1 ? ' nivel' : ' niveles') + ' · desplante ' + n1(r.footprint) + ' m²</text>');
    if (yard) o.push(gardenSvg(yard, function (m) { return f(x0 + m * s); }, function (m) { return f(by - m * s); }, s));
    // estacionamiento en el remetimiento frontal
    var fit = r.parkSurface || 0, extra = p.type === 'casa' ? 0 : Math.min(p.parking, fit);
    if (extra) {
      var cw = 2.5 * s, ch = 5 * s, sy = by + r.D * s + 0.4 * s;
      for (var i = 0; i < extra; i++) o.push('<rect x="' + f(x0 + 0.5 * s + i * cw) + '" y="' + f(sy) + '" width="' + f(cw) + '" height="' + f(ch) + '" fill="#fff" stroke="' + TECH + '"/><text x="' + f(x0 + 0.5 * s + i * cw + cw / 2) + '" y="' + f(sy + ch / 2 + 4) + '" font-size="9" text-anchor="middle" fill="' + TECH + '">' + (i + 1) + '</text>');
    }
    o.push('<g stroke="' + GOLD + '" fill="' + GOLD + '" font-size="11.5" font-weight="600">');
    o.push('<line x1="' + f(x0) + '" y1="' + f(y0 + LD + 28) + '" x2="' + f(x0 + LW) + '" y2="' + f(y0 + LD + 28) + '"/><text x="' + f(x0 + LW / 2) + '" y="' + f(y0 + LD + 44) + '" text-anchor="middle" stroke="none">Frente ' + n2(p.front) + ' m</text>');
    o.push('<line x1="' + f(x0 - 26) + '" y1="' + f(y0) + '" x2="' + f(x0 - 26) + '" y2="' + f(y0 + LD) + '"/><text x="' + f(x0 - 34) + '" y="' + f(y0 + LD / 2) + '" text-anchor="middle" stroke="none" transform="rotate(-90 ' + f(x0 - 34) + ' ' + f(y0 + LD / 2) + ')">Fondo ' + n2(p.depth) + ' m</text>');
    o.push('<line x1="' + f(x0 + LW + 22) + '" y1="' + f(by + r.D * s) + '" x2="' + f(x0 + LW + 22) + '" y2="' + f(y0 + LD) + '"/><text x="' + f(x0 + LW + 30) + '" y="' + f(by + r.D * s + setback * s / 2 + 4) + '" stroke="none" font-size="10">Restricción ' + n2(setback) + ' m</text>');
    o.push('</g>');
    o.push('<rect x="' + f(x0 - 60) + '" y="' + f(y0 + LD + 56) + '" width="' + f(LW + 120) + '" height="34" fill="#E9EDF2"/><text x="' + f(x0 + LW / 2) + '" y="' + f(y0 + LD + 78) + '" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="3" fill="' + MUTED + '">CALLE</text>');
    // cuadro de áreas
    if (yard) o.push('<line x1="' + f(x0 + LW + 22) + '" y1="' + f(y0) + '" x2="' + f(x0 + LW + 22) + '" y2="' + f(by) + '" stroke="' + GOLD + '"/><text x="' + f(x0 + LW + 30) + '" y="' + f(y0 + rear * s / 2 + 4) + '" font-size="10" font-weight="600" fill="' + GOLD + '">Jardín ' + n2(rear) + ' m</text>');
    var lot = p.front * p.depth, rows = [['Terreno', n1(lot) + ' m²'], ['Desplante', n1(r.footprint) + ' m²'], ['COS', Math.round(r.footprint / lot * 100) + ' %'], ['Construcción', n1(r.area) + ' m²'], ['CUS', n2(r.area / lot)], ['Área libre', n1(lot - r.footprint) + ' m²'], ['Cajones', p.parking + ' (req. ' + PR.parkingRequired(p, r.area) + ')']];
    o.push('<g font-size="11"><rect x="' + (VW - 215) + '" y="100" width="190" height="' + (30 + rows.length * 22) + '" fill="#FBFCFD" stroke="' + SILVER + '"/><text x="' + (VW - 203) + '" y="120" font-size="9.5" letter-spacing="1.2" font-weight="700" fill="' + MUTED + '">CUADRO DE ÁREAS</text>');
    rows.forEach(function (rw, k) { o.push('<text x="' + (VW - 203) + '" y="' + (144 + k * 22) + '" fill="' + MUTED + '">' + rw[0] + '</text><text x="' + (VW - 37) + '" y="' + (144 + k * 22) + '" text-anchor="end" font-weight="700" fill="' + INK + '">' + rw[1] + '</text>'); });
    o.push('</g>');
    o.push(north(VW - 60, 62), scaleBar(s));
    return o.join('');
  }

  // Módulos fotovoltaicos en planta (azotea)
  function pvSvg(list, X, Y, s, op) {
    var o = ['<g opacity="' + (op || 1) + '">'];
    list.forEach(function (q) {
      var x = +X(q.x), y = +Y(q.y), w = q.w * s, h = q.h * s;
      o.push('<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" fill="#1F3A66" stroke="#9FB4D6" stroke-width=".6"/>');
      if (h > 14) for (var k = 1; k < 3; k++) o.push('<line x1="' + f(x) + '" y1="' + f(y + h * k / 3) + '" x2="' + f(x + w) + '" y2="' + f(y + h * k / 3) + '" stroke="#6F8BB8" stroke-width=".4"/>');
    });
    o.push('</g>');
    return o.join('');
  }
  // Lámina FV-01: azotea con el arreglo fotovoltaico, equipos y cuadro del sistema
  function energySheet(ctx) {
    var p = ctx.p, r = ctx.r, en = r.energy, o = [];
    var areaW = VW - 470, areaH = VH - TB - 150, s = Math.min(areaW / r.W, areaH / r.D), W = r.W * s, D = r.D * s, x0 = 90 + (areaW - W) / 2, y0 = 70 + (areaH - D) / 2;
    o.push('<rect x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(W) + '" height="' + f(D) + '" fill="#F4F5F7" stroke="' + INK + '" stroke-width="4"/>');
    o.push('<rect x="' + f(x0 + 0.25 * s) + '" y="' + f(y0 + 0.25 * s) + '" width="' + f(W - 0.5 * s) + '" height="' + f(D - 0.5 * s) + '" fill="none" stroke="' + MUTED + '" stroke-dasharray="6 4"/>');
    if (en.layout) o.push(pvSvg(en.layout, function (m) { return f(x0 + m * s); }, function (m) { return f(y0 + m * s); }, s));
    if (p.fx && p.fx.on && p.fx.opts && p.fx.opts.pergola) o.push('<rect x="' + f(x0 + r.W * 0.06 * s) + '" y="' + f(y0 + (r.D - 0.4 - r.D * 0.55) * s) + '" width="' + f(r.W * 0.56 * s) + '" height="' + f(r.D * 0.55 * s) + '" fill="none" stroke="' + GOLD + '" stroke-dasharray="5 3"/><text x="' + f(x0 + r.W * 0.34 * s) + '" y="' + f(y0 + (r.D - 0.4 - r.D * 0.27) * s) + '" font-size="11" font-weight="700" text-anchor="middle" fill="' + GOLD + '">PÉRGOLA / TERRAZA</text>');
    o.push('<text x="' + f(x0 + W / 2) + '" y="' + f(y0 + D + 40) + '" font-size="11" font-weight="700" letter-spacing="3" text-anchor="middle" fill="' + MUTED + '">— C A L L E —</text>');
    o.push('<g stroke="' + GOLD + '" fill="' + GOLD + '" font-size="11.5" font-weight="600"><line x1="' + f(x0) + '" y1="' + f(y0 + D + 18) + '" x2="' + f(x0 + W) + '" y2="' + f(y0 + D + 18) + '"/><text x="' + f(x0 + W / 2) + '" y="' + f(y0 + D + 14) + '" text-anchor="middle" stroke="none">' + n2(r.W) + ' m</text></g>');
    // cuadro del sistema
    var rows = [];
    if (en.kwp) rows.push(['Potencia', n2(en.kwp) + ' kWp'], ['Módulos', en.panels + ' × ' + PR.FV.panelW + ' W'], ['Inversor', en.inversorKw + ' kW'], ['Generación', Math.round(en.gen).toLocaleString('es-MX') + ' kWh/mes'], ['Consumo est.', Math.round(en.mensual).toLocaleString('es-MX') + ' kWh/mes'], ['Horas sol pico', n1(en.hsp) + ' h']);
    if (en.kwh) rows.push(['Baterías LFP', en.kwh + ' kWh'], ['Inv. híbrido', en.hibridoKw + ' kW'], ['Autonomía', n1(en.autonomia) + ' días']);
    rows.push(['Esquema', PR.BATERIA[en.opts.battery] === PR.BATERIA.aislado ? 'Aislado (sin CFE)' : en.kwh ? 'Interconectado + respaldo' : en.kwp ? 'Interconectado a CFE' : '—']);
    if (en.chargers) rows.push(['Cargadores EV', en.chargers + ' × ' + en.chargerKw + ' kW']);
    var bx = VW - 330, by = 70;
    o.push('<g font-size="11"><rect x="' + bx + '" y="' + by + '" width="300" height="' + (34 + rows.length * 22) + '" fill="#FBFCFD" stroke="' + SILVER + '"/><text x="' + (bx + 12) + '" y="' + (by + 20) + '" font-size="9.5" letter-spacing="1.2" font-weight="700" fill="' + MUTED + '">SISTEMA FOTOVOLTAICO Y MOVILIDAD</text>');
    rows.forEach(function (rw, k) { o.push('<text x="' + (bx + 12) + '" y="' + (by + 44 + k * 22) + '" fill="' + MUTED + '">' + esc(rw[0]) + '</text><text x="' + (bx + 288) + '" y="' + (by + 44 + k * 22) + '" text-anchor="end" font-weight="700" fill="' + INK + '">' + esc(rw[1]) + '</text>'); });
    o.push('</g>');
    // diagrama simple
    var dy = by + 60 + rows.length * 22, items = [];
    if (en.kwp) items.push('Arreglo FV'); items.push(en.kwh ? 'Inversor híbrido' : 'Inversor'); if (en.kwh) items.push('Baterías'); items.push('Tablero'); if (en.opts.battery !== 'aislado') items.push('Medidor CFE');
    o.push('<g font-size="10" font-weight="700" text-anchor="middle">');
    items.forEach(function (t, k) { var yy = dy + k * 44; o.push('<rect x="' + (bx + 70) + '" y="' + yy + '" width="160" height="28" rx="6" fill="#fff" stroke="' + TECH + '"/><text x="' + (bx + 150) + '" y="' + (yy + 18) + '" fill="' + TECH + '">' + esc(t) + '</text>'); if (k) o.push('<line x1="' + (bx + 150) + '" y1="' + (yy - 16) + '" x2="' + (bx + 150) + '" y2="' + yy + '" stroke="' + TECH + '" stroke-width="1.5"/>'); });
    o.push('</g>');
    o.push(north(VW - 60, VH - TB - 60), scaleBar(s));
    return o.join('');
  }
  // Elementos del jardín en planta. X(m) desde el lindero izquierdo; Y(m) desde el muro posterior de la casa hacia el fondo.
  function gardenSvg(yard, X, Y, s) {
    var o = ['<g font-size="9" text-anchor="middle">'];
    yard.items.forEach(function (g) {
      var x = +X(g.x), y = +Y(g.y + g.d), w = g.w * s, h = g.d * s, cx = x + w / 2, cy = y + h / 2, bad = g.out, st = bad ? SEWER : TECH;
      var body = '';
      if (g.k === 'alberca' || g.k === 'chapoteadero' || g.k === 'espejo') body = '<rect x="' + f(x - (g.k === 'espejo' ? 0 : 0.5 * s)) + '" y="' + f(y - (g.k === 'espejo' ? 0 : 0.5 * s)) + '" width="' + f(w + (g.k === 'espejo' ? 0 : s)) + '" height="' + f(h + (g.k === 'espejo' ? 0 : s)) + '" fill="#E9E4DA" stroke="#B9B2A4"/><rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" rx="' + (g.k === 'espejo' ? f(h / 2) : 2) + '" fill="#BFE0F0" stroke="' + st + '" stroke-width="1.4"/><path d="M' + f(x + w * 0.15) + ' ' + f(cy) + 'q' + f(w * 0.1) + ' -4 ' + f(w * 0.2) + ' 0t' + f(w * 0.2) + ' 0t' + f(w * 0.2) + ' 0" fill="none" stroke="#5E9CC0"/>';
      else if (g.k === 'jacuzziExt') body = '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" rx="4" fill="#E9E4DA" stroke="' + st + '"/><circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(Math.min(w, h) * 0.38) + '" fill="#BFE0F0" stroke="#5E9CC0"/>';
      else if (g.k === 'palapa') body = '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" fill="#EFE2C2" stroke="' + st + '"/><path d="M' + f(x) + ' ' + f(y) + 'L' + f(x + w) + ' ' + f(y + h) + 'M' + f(x + w) + ' ' + f(y) + 'L' + f(x) + ' ' + f(y + h) + '" stroke="#B89A5A"/>';
      else if (g.k === 'fuente' || g.k === 'fogatero') body = '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(Math.min(w, h) / 2) + '" fill="' + (g.k === 'fuente' ? '#BFE0F0' : '#EADBD0') + '" stroke="' + st + '"/><circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(Math.min(w, h) / 5) + '" fill="#fff" stroke="' + (g.k === 'fuente' ? '#5E9CC0' : '#C0492F') + '"/>';
      else if (g.k === 'pergola') { body = '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" fill="#F6F1E7" stroke="' + st + '"/>'; for (var k = 1; k < 8; k++) body += '<line x1="' + f(x + w * k / 8) + '" y1="' + f(y) + '" x2="' + f(x + w * k / 8) + '" y2="' + f(y + h) + '" stroke="#B89A5A" stroke-width=".7"/>'; }
      else if (g.k === 'huerto') { body = '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" fill="#E3EFD9" stroke="' + st + '"/>'; for (var k2 = 1; k2 < 4; k2++) body += '<line x1="' + f(x) + '" y1="' + f(y + h * k2 / 4) + '" x2="' + f(x + w) + '" y2="' + f(y + h * k2 / 4) + '" stroke="#7FA685"/>'; }
      else body = '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" rx="2" fill="' + (g.k === 'asador' ? '#EDE7E1' : '#F3F0E6') + '" stroke="' + st + '"/>';
      if (bad) body = '<g stroke-dasharray="4 3" opacity=".75">' + body + '</g>';
      o.push(body);
      if (w > 26) o.push('<text x="' + f(cx) + '" y="' + f(cy + 3) + '" font-weight="700" fill="' + (bad ? SEWER : INK) + '">' + esc(clip(g.n, w / 5.4)) + '</text>');
      if (w > 40 && h > 22) o.push('<text x="' + f(cx) + '" y="' + f(cy + 13) + '" fill="' + MUTED + '" font-size="8">' + n1(g.w) + ' × ' + n1(g.d) + ' m</text>');
    });
    o.push('</g>');
    return o.join('');
  }

  /* ---------- Fachada ---------- */
  function facadeSheet(ctx) {
    var p = ctx.p, r = ctx.r;
    var svg = F.build({ floors: p.floors, bays: p.bays, style: p.style, mode: 'line', phi: false, lat: r.city.lat, month: p.month, hour: p.hour, palette: p.palette, width: 1000, height: 600, id: 'sh' + Math.random().toString(36).slice(2, 6), frontM: p.front });
    svg = svg.replace('<svg ', '<svg x="60" y="40" width="980" height="' + (VH - TB - 110) + '" preserveAspectRatio="xMidYMid meet" ');
    var o = [svg];
    o.push('<g font-size="11" fill="' + MUTED + '"><text x="60" y="' + (VH - TB - 50) + '" font-weight="700" fill="' + INK + '">FACHADA PRINCIPAL</text><text x="60" y="' + (VH - TB - 34) + '">Estilo ' + esc(ctx.styleName) + ' · ' + p.bays + ' crujías · frente ' + n2(p.front) + ' m · altura aprox. ' + n2(heights(p).total) + ' m · material ' + esc(p.palette) + '</text></g>');
    return o.join('');
  }
  function heights(p) {
    var hs = [], i;
    for (i = 0; i < p.floors; i++) hs.push(p.type === 'bodega' ? (i === 0 ? 9 : 3.5) : p.type === 'comercial' ? 4.5 : i === 0 ? 3.2 : 3.0);
    return { hs: hs, total: hs.reduce(function (a, b) { return a + b; }, 0) + 1.0 };
  }

  function fxSheet(fx) {
    var svg = fx.render().replace('<svg ', '<svg x="40" y="30" width="' + (VW - 80) + '" height="' + (VH - TB - 60) + '" preserveAspectRatio="xMidYMid meet" ');
    return svg + '<text x="60" y="' + (VH - TB - 14) + '" font-size="11" fill="' + MUTED + '"><tspan font-weight="700" fill="' + INK + '">FACHADA MEJORADA</tspan>  ·  Render de anteproyecto, estilo ' + esc(fx.name.toLowerCase()) + '</text>';
  }
  /* ---------- Corte ---------- */
  function sectionSheet(ctx) {
    var p = ctx.p, r = ctx.r, o = [], H = heights(p), lv = ctx.levels;
    var areaW = VW - 260, areaH = VH - TB - 150, s = Math.min(areaW / r.D, areaH / (H.total + 2.2));
    var x0 = 140 + (areaW - r.D * s) / 2, g = 60 + areaH - 1.4 * s; // nivel de terreno
    function Y(m) { return f(g - m * s); } function X(m) { return f(x0 + m * s); }
    o.push('<rect x="40" y="' + f(g) + '" width="' + (VW - 80) + '" height="' + f(1.6 * s) + '" fill="#EFE9DC"/>');
    o.push('<line x1="40" y1="' + f(g) + '" x2="' + (VW - 80) + '" y2="' + f(g) + '" stroke="' + INK + '" stroke-width="2"/>');
    var acc = 0, slab = Math.max(3, 0.15 * s), cs = Math.max(5, r.col.s[0] / 100 * s);
    // cimentación
    for (var j = 0; j <= r.rows; j++) { var cx = x0 + r.D / r.rows * j * s; o.push('<rect x="' + f(cx - 0.6 * s) + '" y="' + f(g + 0.9 * s) + '" width="' + f(1.2 * s) + '" height="' + f(0.35 * s) + '" fill="' + SILVER + '" stroke="' + INK + '"/><rect x="' + f(cx - cs / 2) + '" y="' + f(g) + '" width="' + f(cs) + '" height="' + f(0.9 * s) + '" fill="' + SILVER + '" stroke="' + INK + '"/>'); }
    H.hs.forEach(function (h, i) {
      var y1 = acc, y2 = acc + h;
      // columnas
      for (var j2 = 0; j2 <= r.rows; j2++) { var cx2 = x0 + r.D / r.rows * j2 * s; o.push('<rect x="' + f(cx2 - cs / 2) + '" y="' + Y(y2) + '" width="' + f(cs) + '" height="' + f(h * s - slab) + '" fill="#DDE2EA" stroke="' + INK + '" stroke-width="1"/>'); }
      // losa
      o.push('<rect x="' + f(x0 - 0.4 * s) + '" y="' + f(Y(y2) - slab) + '" width="' + f(r.D * s + 0.8 * s) + '" height="' + f(slab) + '" fill="' + INK + '"/>');
      // espacios cortados
      var cells = (lv[i] ? lv[i].cells : []).filter(function (c) { return c.x <= r.W / 2 && c.x + c.w >= r.W / 2; });
      cells.forEach(function (c) { o.push('<text x="' + X(c.y + c.h / 2) + '" y="' + f(Y(y1 + h / 2) + 4) + '" text-anchor="middle" font-size="10.5" font-weight="600" fill="' + INK + '">' + esc(clip(c.n, c.h * s / 6.5)) + '</text>'); });
      // nivel
      o.push('<g font-size="10.5" font-weight="700" fill="' + TECH + '"><path d="M' + f(x0 + r.D * s + 30) + ' ' + Y(y1) + 'l-6 -8h12z" fill="none" stroke="' + TECH + '"/><line x1="' + f(x0 + r.D * s + 24) + '" y1="' + Y(y1) + '" x2="' + f(x0 + r.D * s + 90) + '" y2="' + Y(y1) + '" stroke="' + TECH + '" stroke-width=".8"/><text x="' + f(x0 + r.D * s + 40) + '" y="' + f(Y(y1) - 4) + '">N' + (y1 >= 0 ? '+' : '') + n2(y1) + '</text></g>');
      // cotas de altura
      o.push('<g stroke="' + GOLD + '" fill="' + GOLD + '" font-size="10"><line x1="' + f(x0 - 30) + '" y1="' + Y(y1) + '" x2="' + f(x0 - 30) + '" y2="' + Y(y2) + '"/><line x1="' + f(x0 - 35) + '" y1="' + Y(y2) + '" x2="' + f(x0 - 25) + '" y2="' + Y(y2) + '"/><text x="' + f(x0 - 38) + '" y="' + f(Y(y1 + h / 2) + 3) + '" text-anchor="end" stroke="none">' + n2(h) + '</text></g>');
      acc = y2;
    });
    // pretil, escalera
    o.push('<rect x="' + f(x0 - 0.4 * s) + '" y="' + Y(acc + 1) + '" width="' + f(0.2 * s) + '" height="' + f(1 * s) + '" fill="' + INK + '"/><rect x="' + f(x0 + r.D * s + 0.2 * s) + '" y="' + Y(acc + 1) + '" width="' + f(0.2 * s) + '" height="' + f(1 * s) + '" fill="' + INK + '"/>');
    if (p.floors > 1) { var stx = x0 + 0.6 * s, ac2 = 0; H.hs.slice(0, -1).forEach(function (h) { o.push('<path d="M' + f(stx) + ' ' + Y(ac2) + ' L' + f(stx + 3.6 * s) + ' ' + Y(ac2 + h) + '" stroke="' + MUTED + '" stroke-width="2" fill="none"/>'); ac2 += h; }); }
    o.push('<g font-size="10.5" font-weight="700" fill="' + TECH + '"><line x1="' + f(x0 + r.D * s + 24) + '" y1="' + Y(acc) + '" x2="' + f(x0 + r.D * s + 90) + '" y2="' + Y(acc) + '" stroke="' + TECH + '" stroke-width=".8"/><text x="' + f(x0 + r.D * s + 40) + '" y="' + f(Y(acc) - 4) + '">N+' + n2(acc) + ' azotea</text></g>');
    o.push('<text x="60" y="' + (VH - TB - 34) + '" font-size="11" fill="' + MUTED + '"><tspan font-weight="700" fill="' + INK + '">CORTE LONGITUDINAL A-A\'</tspan>  ·  losa maciza h = ' + Math.max(10, Math.round(slab / s * 100)) + ' cm · columnas ' + r.col.s[0] + '×' + r.col.s[1] + ' cm · altura total ' + n2(H.total) + ' m</text>');
    o.push(scaleBar(s));
    return o.join('');
  }

  /* ---------- Estructural ---------- */
  function structSheet(ctx) {
    var p = ctx.p, r = ctx.r, o = [];
    var areaW = VW - 400, areaH = VH - TB - 130, s = Math.min(areaW / r.W, areaH / r.D);
    var W = r.W * s, D = r.D * s, x0 = 100 + (areaW - W) / 2, y0 = 70 + (areaH - D) / 2, bx = r.W / p.bays, i, j;
    var losa = r.elements.filter(function (e) { return /Losa de cimentación/.test(e.name); })[0], zap = r.elements.filter(function (e) { return /Zapata/.test(e.name); })[0];
    o.push('<g stroke="' + SILVER + '" stroke-width=".8" stroke-dasharray="10 4 2 4">');
    for (i = 0; i <= p.bays; i++) o.push('<line x1="' + f(x0 + bx * i * s) + '" y1="' + f(y0 - 34) + '" x2="' + f(x0 + bx * i * s) + '" y2="' + f(y0 + D + 14) + '"/>');
    for (j = 0; j <= r.rows; j++) o.push('<line x1="' + f(x0 - 34) + '" y1="' + f(y0 + D / r.rows * j) + '" x2="' + f(x0 + W + 14) + '" y2="' + f(y0 + D / r.rows * j) + '"/>');
    o.push('</g>');
    if (losa) o.push('<rect x="' + f(x0 - 0.5 * s) + '" y="' + f(y0 - 0.5 * s) + '" width="' + f(W + s) + '" height="' + f(D + s) + '" fill="#F3F5F7" stroke="' + TECH + '" stroke-dasharray="6 3"/>');
    o.push('<g stroke="' + TECH + '" stroke-width="4" opacity=".75">');
    for (j = 0; j <= r.rows; j++) o.push('<line x1="' + f(x0) + '" y1="' + f(y0 + D / r.rows * j) + '" x2="' + f(x0 + W) + '" y2="' + f(y0 + D / r.rows * j) + '"/>');
    for (i = 0; i <= p.bays; i++) o.push('<line x1="' + f(x0 + bx * i * s) + '" y1="' + f(y0) + '" x2="' + f(x0 + bx * i * s) + '" y2="' + f(y0 + D) + '"/>');
    o.push('</g>');
    var zs = zap ? parseFloat(String(zap.sec).replace(',', '.')) || 1.5 : 0, cs = Math.max(7, r.col.s[0] / 100 * s);
    for (i = 0; i <= p.bays; i++) for (j = 0; j <= r.rows; j++) {
      var cx = x0 + bx * i * s, cy = y0 + D / r.rows * j;
      if (zs) o.push('<rect x="' + f(cx - zs * s / 2) + '" y="' + f(cy - zs * s / 2) + '" width="' + f(zs * s) + '" height="' + f(zs * s) + '" fill="none" stroke="' + MUTED + '" stroke-dasharray="4 3"/>');
      o.push('<rect x="' + f(cx - cs / 2) + '" y="' + f(cy - cs / 2) + '" width="' + f(cs) + '" height="' + f(cs) + '" fill="' + INK + '"/>');
    }
    o.push('<g font-size="10" font-weight="700" fill="' + TECH + '"><text x="' + f(x0 + bx * s / 2) + '" y="' + f(y0 - 6) + '" text-anchor="middle">V-1</text><text x="' + f(x0 + 8) + '" y="' + f(y0 + D / r.rows / 2) + '">C-1</text></g>');
    var nx = VW - 280, ny = 90, rows = r.elements.map(function (e) { return [e.name, e.sec, Math.round(e.u * 100) + ' %']; });
    o.push('<g font-size="10.5"><rect x="' + nx + '" y="' + ny + '" width="255" height="' + (60 + rows.length * 34 + 90) + '" fill="#FBFCFD" stroke="' + SILVER + '"/><text x="' + (nx + 12) + '" y="' + (ny + 22) + '" font-size="9.5" letter-spacing="1.2" font-weight="700" fill="' + MUTED + '">CUADRO DE ELEMENTOS</text>');
    rows.forEach(function (rw, k) { var yy = ny + 46 + k * 34; o.push('<text x="' + (nx + 12) + '" y="' + yy + '" font-weight="700" fill="' + INK + '">' + esc(clip(rw[0], 30)) + '</text><text x="' + (nx + 12) + '" y="' + (yy + 14) + '" fill="' + MUTED + '">' + esc(rw[1]) + '</text><text x="' + (nx + 243) + '" y="' + (yy + 7) + '" text-anchor="end" font-weight="700" fill="' + INK + '">' + rw[2] + '</text>'); });
    var ny2 = ny + 46 + rows.length * 34 + 6;
    ['Concreto f\'c = 250 kg/cm² · acero fy = 4,200 kg/cm²', 'Zona sísmica: ' + r.city.zone, 'Capacidad de suelo supuesta: ' + r.city.q + ' kPa', 'Validar con mecánica de suelos y memoria', 'de cálculo firmada por DRO / CSE.'].forEach(function (t, k) { o.push('<text x="' + (nx + 12) + '" y="' + (ny2 + k * 15) + '" fill="' + MUTED + '" font-size="9.5">' + esc(t) + '</text>'); });
    o.push('</g>');
    o.push('<text x="60" y="' + (VH - TB - 34) + '" font-size="11" fill="' + MUTED + '"><tspan font-weight="700" fill="' + INK + '">PLANTA ESTRUCTURAL Y DE CIMENTACIÓN</tspan>  ·  ' + (losa ? 'losa de cimentación' : 'zapatas aisladas ' + esc(zap ? zap.sec : '')) + ' · columnas ' + r.col.s[0] + '×' + r.col.s[1] + ' cm · vigas ' + r.beam.s[0] + '×' + r.beam.s[1] + ' cm</text>');
    o.push(scaleBar(s), north(VW - 60, 52));
    return o.join('');
  }

  /* ---------- Croquis ---------- */
  function sketchSheet(ctx) {
    var c = ctx.croquis, o = [];
    o.push('<rect x="40" y="40" width="' + (VW - 80) + '" height="' + (VH - TB - 110) + '" fill="#F3F5F7"/>');
    o.push('<image href="' + c.img + '" x="50" y="50" width="' + (VW - 100) + '" height="' + (VH - TB - 130) + '" preserveAspectRatio="xMidYMid meet"/>');
    o.push('<text x="60" y="' + (VH - TB - 34) + '" font-size="11" fill="' + MUTED + '"><tspan font-weight="700" fill="' + INK + '">CROQUIS DE REFERENCIA</tspan>  ·  ' + esc(c.name) + (c.by ? ' · lectura: ' + esc(c.by) : '') + '</text>');
    return o.join('');
  }

  /* ---------- API ---------- */
  function build(p, r, opts) {
    opts = opts || {};
    var levels = layoutLevels(p, r);
    var date = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    var ctx = { p: p, r: r, levels: levels, croquis: opts.croquis, styleName: opts.styleName || p.style };
    var meta = function (code, name, sub) { return { code: code, name: name, sub: sub, project: p.name, loc: r.city.name, date: date }; };
    var lvName = function (i) { return i === 0 ? 'Planta baja' : 'Nivel ' + i; };
    var sheets = [];
    if (opts.croquis) sheets.push({ code: 'A-00', name: 'Croquis de referencia', kind: 'img', render: function () { return frame(sketchSheet(ctx), meta('A-00', 'Croquis de referencia', 'Base para el anteproyecto')); } });
    sheets.push({ code: 'A-01', name: 'Planta de conjunto', kind: 'site', render: function () { return frame(siteSheet(ctx), meta('A-01', 'Planta de conjunto', 'Terreno ' + n1(p.front * p.depth) + ' m²')); } });
    levels.forEach(function (lv, i) {
      sheets.push({ code: 'A-' + String(2 + i).padStart(2, '0'), name: 'Arquitectónica · ' + lvName(i), kind: 'plan', level: i, render: function (layers) { var c = 'A-' + String(2 + i).padStart(2, '0'); return frame(planSheet(ctx, i, layers || { arq: true, cot: true }), meta(c, 'Planta arquitectónica · ' + lvName(i), PR.TIPOS[p.type].n + ' · ' + n1(r.footprint) + ' m² por planta')); } });
    });
    var nA = 2 + levels.length;
    sheets.push({ code: 'A-' + String(nA).padStart(2, '0'), name: 'Fachada principal', kind: 'elev', render: function () { return frame(facadeSheet(ctx), meta('A-' + String(nA).padStart(2, '0'), 'Fachada principal', 'Alzado sur / a calle')); } });
    if (opts.fachada) sheets.push({ code: 'R-01', name: 'Fachada mejorada', kind: 'render', render: function () { return frame(fxSheet(opts.fachada), meta('R-01', 'Fachada mejorada · render', 'Estilo ' + opts.fachada.name.toLowerCase())); } });
    sheets.push({ code: 'A-' + String(nA + 1).padStart(2, '0'), name: 'Corte longitudinal', kind: 'sect', render: function () { return frame(sectionSheet(ctx), meta('A-' + String(nA + 1).padStart(2, '0'), 'Corte longitudinal A-A\'', 'Niveles y alturas')); } });
    sheets.push({ code: 'E-01', name: 'Estructural y cimentación', kind: 'struct', render: function () { return frame(structSheet(ctx), meta('E-01', 'Estructural y cimentación', 'Prediseño · ' + r.city.zone)); } });
    levels.forEach(function (lv, i) {
      var c1 = 'IE-' + String(1 + i).padStart(2, '0'), c2 = 'IH-' + String(1 + i).padStart(2, '0');
      sheets.push({ code: c1, name: 'Eléctrica · ' + lvName(i), kind: 'inst', level: i, render: function () { return frame(planSheet(ctx, i, { ele: true, cot: false }), meta(c1, 'Instalación eléctrica · ' + lvName(i), 'Alumbrado y contactos')); } });
      sheets.push({ code: c2, name: 'Hidrosanitaria · ' + lvName(i), kind: 'inst', level: i, render: function () { return frame(planSheet(ctx, i, { hid: true, cot: false }), meta(c2, 'Instalación hidrosanitaria · ' + lvName(i), 'Agua fría y drenaje')); } });
    });
    if (r.energy) sheets.push({ code: 'FV-01', name: 'Azotea · sistema solar', kind: 'fv', render: function () { return frame(energySheet(ctx), meta('FV-01', 'Azotea y sistema fotovoltaico', r.energy.kwp ? n2(r.energy.kwp) + ' kWp · ' + r.energy.panels + ' módulos' : 'Movilidad eléctrica y respaldo')); } });
    if (opts.unifilar) sheets.push({ code: 'IE-U', name: 'Diagrama unifilar', kind: 'uni', render: function () { return frame('<g transform="translate(60 40)">' + opts.unifilar().replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</g>', meta('IE-U', 'Diagrama unifilar', 'Tablero general')); } });
    var info = levels.map(function (lv) { return lv.cells.map(function (c) { return { n: c.n, k: c.k, m2: c.m2, unit: !!c.unit, id: c.id }; }); });
    return { sheets: sheets, levels: levels, info: info };
  }
  // Cajones que caben en superficie (remetimiento frontal) y dentro de planta baja
  function parkingCapacity(p, r) {
    var rear = p.depth * 0.03, setback = p.depth - r.D - rear, surf = setback >= 5 ? Math.floor((p.front - 1) / 2.5) : 0;
    return { surface: surf };
  }
  window.RinovaPlanos = { build: build, parkingCapacity: parkingCapacity, heights: heights, layoutLevels: layoutLevels, wallSegments: wallSegments, siteSheet: function (p, r) { return siteSheet({ p: p, r: r }); }, frame: frame, VW: VW, VH: VH, TB: TB };
})();
