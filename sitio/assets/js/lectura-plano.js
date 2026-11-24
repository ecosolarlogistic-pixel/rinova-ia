/* RINOVAIA — Lectura de planos en el navegador (sin IA).
   Detecta los muros de un plano o croquis (trazo grueso), el contorno construido y los espacios que encierran.
   Devuelve la geometría en fracciones del contorno (0 a 1) para escalarla con las cotas que confirme el usuario.
   También convierte la lectura de RINOVAIA AI (metros) al formato de planos de la app (p.sk). */
(function () {
  'use strict';

  /* ---------- Máscaras ---------- */
  function grayMask(canvas, max) {
    var k = Math.min(1, max / Math.max(canvas.width, canvas.height)), w = Math.round(canvas.width * k), h = Math.round(canvas.height * k);
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(canvas, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h).data, n = w * h, lum = new Uint8Array(n), hist = new Array(256).fill(0), sat = 0, white = 0;
    for (var i = 0; i < n; i++) {
      var R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2], L = (R * 0.3 + G * 0.59 + B * 0.11) | 0;
      lum[i] = L; hist[L]++; sat += Math.max(R, G, B) - Math.min(R, G, B); if (L > 225) white++;
    }
    // umbral de Otsu
    var sum = 0, sB = 0, wB = 0, best = 0, thr = 128, t;
    for (t = 0; t < 256; t++) sum += t * hist[t];
    for (t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue; var wF = n - wB; if (!wF) break;
      sB += t * hist[t]; var mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = t; }
    }
    thr = Math.min(thr, 170);
    var dark = new Uint8Array(n);
    for (i = 0; i < n; i++) dark[i] = lum[i] < thr ? 1 : 0;
    return { w: w, h: h, dark: dark, sat: sat / n, white: white / n };
  }
  // Dilatación / erosión separable con ventana cuadrada de radio r (sumas acumuladas)
  function filt(src, w, h, r, erode) {
    var tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), cs = new Int32Array(Math.max(w, h) + 1), x, y, a, b, n;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) cs[x + 1] = cs[x] + src[y * w + x];
      for (x = 0; x < w; x++) { a = Math.max(0, x - r); b = Math.min(w - 1, x + r); n = cs[b + 1] - cs[a]; tmp[y * w + x] = erode ? (n === b - a + 1 ? 1 : 0) : (n > 0 ? 1 : 0); }
    }
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) cs[y + 1] = cs[y] + tmp[y * w + x];
      for (y = 0; y < h; y++) { a = Math.max(0, y - r); b = Math.min(h - 1, y + r); n = cs[b + 1] - cs[a]; out[y * w + x] = erode ? (n === b - a + 1 ? 1 : 0) : (n > 0 ? 1 : 0); }
    }
    return out;
  }
  function components(m, w, h) {
    var lab = new Int32Array(w * h), comps = [null], stack = new Int32Array(w * h), id = 0;
    for (var i = 0; i < w * h; i++) {
      if (!m[i] || lab[i]) continue;
      id++; var sp = 0, cnt = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, edge = false; stack[sp++] = i; lab[i] = id;
      while (sp) {
        var q = stack[--sp], qx = q % w, qy = (q / w) | 0; cnt++;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        if (!qx || !qy || qx === w - 1 || qy === h - 1) edge = true;
        if (qx > 0 && m[q - 1] && !lab[q - 1]) { lab[q - 1] = id; stack[sp++] = q - 1; }
        if (qx < w - 1 && m[q + 1] && !lab[q + 1]) { lab[q + 1] = id; stack[sp++] = q + 1; }
        if (qy > 0 && m[q - w] && !lab[q - w]) { lab[q - w] = id; stack[sp++] = q - w; }
        if (qy < h - 1 && m[q + w] && !lab[q + w]) { lab[q + w] = id; stack[sp++] = q + w; }
      }
      comps.push({ id: id, n: cnt, x0: x0, y0: y0, x1: x1, y1: y1, edge: edge });
    }
    return { lab: lab, comps: comps };
  }

  /* ---------- Detección de espacios ----------
     Los muros, puertas (con su abatimiento) y ventanas cierran cada espacio; las zonas blancas encerradas son los
     espacios. Sus bordes se alinean a una retícula común y cada celda se asigna al espacio que la ocupa. */
  function detect(canvas, dbg) {
    var G = grayMask(canvas, 1000), w = G.w, h = G.h, best = null;
    [1, 2].forEach(function (rad) {
      var bar = filt(G.dark, w, h, rad, false), white = new Uint8Array(w * h);
      for (var i = 0; i < w * h; i++) white[i] = bar[i] ? 0 : 1;
      var res = rooms(G, w, h, white, dbg);
      if (res && (!best || res.score > best.score)) best = res;
    });
    return best;
  }
  function rooms(G, w, h, white, dbg) {
    var C = components(white, w, h), comps = C.comps, lab = C.lab, i;
    // contorno construido: todo lo encerrado de tamaño apreciable
    var inner = comps.filter(function (c) { return c && !c.edge && c.n > w * h * 0.002; });
    if (!inner.length) return null;
    var bx0 = w, by0 = h, bx1 = 0, by1 = 0;
    inner.forEach(function (c) { var fill = c.n / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)); if (fill < 0.2) return; bx0 = Math.min(bx0, c.x0); by0 = Math.min(by0, c.y0); bx1 = Math.max(bx1, c.x1); by1 = Math.max(by1, c.y1); });
    var BW = bx1 - bx0, BH = by1 - by0;
    if (BW < w * 0.25 || BH < h * 0.25) return null;
    var minSide = Math.min(BW, BH), A = BW * BH, tol0 = Math.max(6, minSide * 0.035);
    // espacios: zonas encerradas, amplias y no alargadas como el hueco entre dos líneas de muro
    var R = inner.filter(function (c) {
      var cw = c.x1 - c.x0 + 1, ch = c.y1 - c.y0 + 1, fill = c.n / (cw * ch);
      return c.n > A * 0.006 && Math.min(cw, ch) > minSide * 0.06 && fill > 0.3;
    });
    if (R.length < 2) return null;
    // ¿el borde va pegado a un muro? (doble línea o trazo grueso; un mueble es una línea sencilla)
    var span = Math.max(10, Math.round(minSide * 0.04));
    function walled(vertical, c0, lo, hi, dir) {
      var tot = 0, on = 0;
      for (var t = lo + 2; t <= hi - 2; t += 2) {
        tot++;
        var runs = [], cur = 0;
        for (var d = 1; d <= span; d++) {
          var p = c0 + dir * d, X = vertical ? p : t, Y = vertical ? t : p;
          var dk = X >= 0 && Y >= 0 && X < w && Y < h && G.dark[Y * w + X];
          if (dk) cur++; else if (cur) { runs.push(cur); cur = 0; if (runs.length >= 2) break; }
        }
        if (cur) runs.push(cur);
        if (runs.length && (runs[0] >= 3 || runs.length >= 2)) on++;
      }
      return tot && on / tot > 0.5;
    }
    R.forEach(function (c) {
      c.wl = walled(true, c.x0, c.y0, c.y1, -1); c.wr = walled(true, c.x1, c.y0, c.y1, 1);
      c.wt = walled(false, c.y0, c.x0, c.x1, -1); c.wb = walled(false, c.y1, c.x0, c.x1, 1);
    });
    R = R.filter(function (c) { return c.wl + c.wr + c.wt + c.wb >= (c.n > A * 0.08 ? 1 : 2); });
    if (R.length < 2) return null;
    // un recinto rodeado por otro (isla de cocina, cama, mesa) es parte de él
    var alias = {};
    function root(id) { while (alias[id]) id = alias[id]; return id; }
    R.forEach(function (c) {
      var pad = Math.max(4, tol0), votes = {}, n = 0;
      [0.25, 0.5, 0.75].forEach(function (f) {
        var px = Math.round(c.x0 + (c.x1 - c.x0) * f), py = Math.round(c.y0 + (c.y1 - c.y0) * f);
        [[px, c.y0 - pad], [px, c.y1 + pad], [c.x0 - pad, py], [c.x1 + pad, py]].forEach(function (pt) {
          var X = pt[0], Y = pt[1]; n++;
          if (X < 0 || Y < 0 || X >= w || Y >= h) return;
          var L = lab[Y * w + X]; if (L && L !== c.id) votes[L] = (votes[L] || 0) + 1;
        });
      });
      Object.keys(votes).forEach(function (k) { var o = comps[+k]; if (votes[k] >= n * 0.75 && o && !o.edge && o.x0 <= c.x0 && o.x1 >= c.x1 && o.y0 <= c.y0 && o.y1 >= c.y1) alias[c.id] = +k; });
    });
    R = R.filter(function (c) { return !alias[c.id]; });
    var isRoom = {}; R.forEach(function (c) { isRoom[c.id] = c; });
    Object.keys(alias).forEach(function (k) { var t = root(+k); if (isRoom[t]) isRoom[k] = isRoom[t]; });
    // retícula: bordes de los espacios agrupados (los dos lados de un muro quedan en su eje)
    var tol = Math.max(6, minSide * 0.035);
    function axis(vals, lo, hi) {
      vals.sort(function (a, b) { return a - b; });
      var out = [], grp = [];
      vals.forEach(function (v) { if (grp.length && v - grp[grp.length - 1] > tol) { out.push(avg(grp)); grp = []; } grp.push(v); });
      if (grp.length) out.push(avg(grp));
      if (out[0] - lo > tol) out.unshift(lo); else out[0] = lo;
      if (hi - out[out.length - 1] > tol) out.push(hi); else out[out.length - 1] = hi;
      return out;
    }
    function avg(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
    var ex = [], ey = [];
    R.forEach(function (c) {
      if (c.wl) ex.push(c.x0); if (c.wr) ex.push(c.x1); if (c.wt) ey.push(c.y0); if (c.wb) ey.push(c.y1);
    });
    var xs = axis(ex, bx0, bx1), ys = axis(ey, by0, by1);
    var nx = xs.length - 1, ny = ys.length - 1, cell = new Int32Array(nx * ny), cx, cy;
    for (cy = 0; cy < ny; cy++) for (cx = 0; cx < nx; cx++) {
      var cnt = {}, x0 = Math.round(xs[cx]), x1 = Math.round(xs[cx + 1]), y0 = Math.round(ys[cy]), y1 = Math.round(ys[cy + 1]), area = Math.max(1, (x1 - x0) * (y1 - y0)), stp = Math.max(1, Math.round(Math.sqrt(area / 400)));
      var tot = 0;
      for (var y = y0; y < y1; y += stp) for (var x = x0; x < x1; x += stp) { tot++; var L = lab[y * w + x], Rm = isRoom[L]; if (Rm) cnt[Rm.id] = (cnt[Rm.id] || 0) + 1; }
      var bl = 0, bv = 0; Object.keys(cnt).forEach(function (k) { if (cnt[k] > bv) { bv = cnt[k]; bl = +k; } });
      cell[cy * nx + cx] = bv >= tot * 0.18 ? bl : 0;
    }
    // muro sobre un tramo de la retícula: fracción con doble línea o trazo grueso cerca del eje
    function wallAt(vertical, c0, lo, hi) {
      var tot = 0, on = 0, half = Math.round(span * 0.7); c0 = Math.round(c0);
      for (var t = Math.round(lo) + 1; t < hi - 1; t += 2) {
        tot++;
        var runs = [], cur = 0;
        for (var d = -half; d <= half; d++) {
          var p = c0 + d, X = vertical ? p : t, Y = vertical ? t : p;
          if (X >= 0 && Y >= 0 && X < w && Y < h && G.dark[Y * w + X]) cur++; else if (cur) { runs.push(cur); cur = 0; }
        }
        if (cur) runs.push(cur);
        if (runs.some(function (r0) { return r0 >= 3; }) || runs.length >= 2) on++;
      }
      return tot ? on / tot : 0;
    }
    // celdas libres con etiqueta propia; luego se unen los espacios que no tienen muro entre sí
    var nf = -1; for (i = 0; i < nx * ny; i++) if (!cell[i]) cell[i] = nf--;
    var pairs = {};
    function pair(a, b, len, wl) { if (a === b) return; var k = a < b ? a + '|' + b : b + '|' + a, P = pairs[k] || (pairs[k] = { a: Math.min(a, b), b: Math.max(a, b), len: 0, wall: 0 }); P.len += len; P.wall += wl * len; }
    for (cy = 0; cy < ny; cy++) for (cx = 0; cx < nx; cx++) {
      var me = cell[cy * nx + cx];
      if (cx < nx - 1) { var L1 = ys[cy + 1] - ys[cy]; pair(me, cell[cy * nx + cx + 1], L1, wallAt(true, xs[cx + 1], ys[cy], ys[cy + 1])); }
      if (cy < ny - 1) { var L2 = xs[cx + 1] - xs[cx]; pair(me, cell[(cy + 1) * nx + cx], L2, wallAt(false, ys[cy + 1], xs[cx], xs[cx + 1])); }
    }
    var par = {};
    function fd(a) { while (par[a] != null && par[a] !== a) a = par[a]; return a; }
    function un(a, b) { a = fd(a); b = fd(b); if (a === b) return; if (a > 0 && b > 0 ? isRoom[a].n < isRoom[b].n : a < 0) par[a] = b; else par[b] = a; }
    Object.keys(pairs).map(function (k) { return pairs[k]; }).sort(function (p1, p2) { return p1.wall / p1.len - p2.wall / p2.len; }).forEach(function (P) {
      var r0 = P.wall / P.len, free = P.a < 0 || P.b < 0;
      if (r0 < 0.12 || (free && r0 < 0.4)) un(P.a, P.b);
    });
    for (i = 0; i < nx * ny; i++) cell[i] = fd(cell[i]);
    // rectángulos por espacio
    var used = new Uint8Array(nx * ny), out = [], gid = 0, groups = {}, SW = BW, SH = BH;
    for (cy = 0; cy < ny; cy++) for (cx = 0; cx < nx; cx++) {
      var id0 = cy * nx + cx; if (used[id0]) continue;
      var v0 = cell[id0], ex = cx;
      while (ex + 1 < nx && !used[cy * nx + ex + 1] && cell[cy * nx + ex + 1] === v0) ex++;
      var ey = cy, ok = true;
      while (ok && ey + 1 < ny) { for (var q = cx; q <= ex; q++) if (used[(ey + 1) * nx + q] || cell[(ey + 1) * nx + q] !== v0) { ok = false; break; } if (ok) ey++; }
      for (var yy = cy; yy <= ey; yy++) for (var xx = cx; xx <= ex; xx++) used[yy * nx + xx] = 1;
      if (groups[v0] == null) groups[v0] = ++gid;
      var rx0 = xs[cx], ry0 = ys[cy], rx1 = xs[ex + 1], ry1 = ys[ey + 1];
      out.push({ x: (rx0 - bx0) / SW, y: (ry0 - by0) / SH, w: (rx1 - rx0) / SW, h: (ry1 - ry0) / SH, g: groups[v0], free: v0 < 0,
        stair: v0 < 0 && stairs(rx0, ry0, rx1, ry1) });
    }
    // escalera: muchas franjas cerradas, iguales y en fila (las huellas)
    function stairs(x0, y0, x1, y1) {
      var strips = comps.filter(function (c) { return c && !isRoom[c.id] && c.x0 >= x0 - 2 && c.x1 <= x1 + 2 && c.y0 >= y0 - 2 && c.y1 <= y1 + 2 && c.n > 6; });
      var hz = strips.filter(function (c) { return (c.x1 - c.x0) > 3 * (c.y1 - c.y0); }).length, vt = strips.filter(function (c) { return (c.y1 - c.y0) > 3 * (c.x1 - c.x0); }).length;
      return Math.max(hz, vt) >= 6;
    }
    var count = {}; out.forEach(function (q) { count[q.g] = (count[q.g] || 0) + 1; });
    out.forEach(function (q) { if (count[q.g] === 1) q.g = null; });
    if (dbg) { (dbg.modes = dbg.modes || []).push({ R: R.length, xs: xs, ys: ys, n: out.length }); }
    var score = R.length + (BW * BH) / (w * h) * 4 - Math.max(0, out.length - 24);
    return { ratio: SH / SW, rooms: out, sat: G.sat, white: G.white, score: score, box: { x: bx0 / w, y: by0 / h, w: SW / w, h: SH / h } };
  }
  // ¿Foto de fachada o plano? Los planos son casi blancos y sin color.
  function looksLikeFacade(canvas) {
    var G = grayMask(canvas, 200);
    return G.white < 0.45 && G.sat > 28;
  }

  /* ---------- Nombres probables (sin IA) ---------- */
  function classify(geom, W, D, level) {
    var rooms = geom.rooms.map(function (q) { return Object.assign({}, q, { x: q.x * W, y: q.y * D, w: q.w * W, h: q.h * D }); });
    // cada espacio (grupo de rectángulos) se clasifica una vez con su área total y su rectángulo envolvente
    var grp = {}, list = [];
    rooms.forEach(function (q, i) {
      var key = q.g ? 'g' + q.g : 'r' + i, G = grp[key];
      if (!G) { G = grp[key] = { parts: [], x: q.x, y: q.y, x1: q.x + q.w, y1: q.y + q.h, A: 0, stair: false, free: q.free, g: q.g }; list.push(G); }
      G.parts.push(q); G.A += q.w * q.h; G.stair = G.stair || q.stair;
      G.x = Math.min(G.x, q.x); G.y = Math.min(G.y, q.y); G.x1 = Math.max(G.x1, q.x + q.w); G.y1 = Math.max(G.y1, q.y + q.h);
    });
    list.forEach(function (G) { G.w = G.x1 - G.x; G.h = G.y1 - G.y; });
    list.forEach(function (q) {
      var A = q.A, mn = Math.min(q.w, q.h), mx = Math.max(q.w, q.h);
      q.A = A;
      if (q.stair) { q.n = 'Escalera'; q.k = 'circ'; }
      else if (q.free && q.y + q.h >= D - 0.05 && mn < 2.4) { q.n = level ? 'Balcón' : 'Terraza'; q.k = 'ext'; }
      else if (level && q.y + q.h >= D - 0.05 && mn < 1.8 && mx / mn > 3) { q.n = 'Balcón'; q.k = 'ext'; }
      else if (A < 2.2) { q.n = 'Clóset'; q.k = 'serv'; }
      else if (mn < 1.5 && mx / mn > 2.2) { q.n = 'Pasillo'; q.k = 'circ'; }
      else if (A <= 7.5 && mn >= 1.1) { q.n = 'Baño'; q.k = 'bano'; }
      else if (A <= 24) { q.n = 'Recámara'; q.k = 'rec'; }
      else { q.n = level ? 'Estancia familiar' : 'Sala · comedor'; q.k = 'soc'; }
    });
    var nr = 0, nb = 0, recs = list.filter(function (q) { return q.k === 'rec'; }).length, bans = list.filter(function (q) { return q.k === 'bano'; }).length;
    list.sort(function (a2, b2) { return a2.y - b2.y || a2.x - b2.x; }).forEach(function (q) {
      if (q.k === 'rec' && recs > 1) q.n = 'Recámara ' + (++nr);
      if (q.k === 'bano' && bans > 1) q.n = 'Baño ' + (++nb);
    });
    var out = [];
    list.forEach(function (G) { G.parts.forEach(function (q) { out.push({ n: G.n, k: G.k, x: r2(q.x), y: r2(q.y), w: r2(q.w), h: r2(q.h), g: G.parts.length > 1 ? G.g : null }); }); });
    return out;
  }
  function touch(a, b) {
    var E = 0.05;
    if (Math.abs(a.x + a.w - b.x) < E || Math.abs(b.x + b.w - a.x) < E) return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    if (Math.abs(a.y + a.h - b.y) < E || Math.abs(b.y + b.h - a.y) < E) return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    return 0;
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  /* ---------- Lectura de RINOVAIA AI → formato de la app ---------- */
  var KIND = { sala: 'soc', comedor: 'soc', sala_comedor: 'soc', estancia: 'soc', estudio: 'soc', oficina: 'ofi', cocina: 'serv', lavado: 'serv', closet: 'serv', vestidor: 'rec', bodega: 'alm',
    recamara: 'rec', recamara_principal: 'rec', bano: 'bano', medio_bano: 'bano', pasillo: 'circ', vestibulo: 'circ', escalera: 'circ', cochera: 'coch', terraza: 'ext', balcon: 'ext', jardin: 'ext', patio: 'ext', local: 'com', otro: 'soc' };
  function fromAI(L) {
    var W = +L.frente_m, D = +L.fondo_m;
    if (!(W > 1 && D > 1)) return null;
    var rooms = (L.espacios || []).map(function (e) {
      var k = KIND[e.tipo] || 'soc', n = String(e.nombre || '').slice(0, 40) || 'Espacio';
      if (e.tipo === 'escalera' && !/^Escalera/i.test(n)) n = 'Escalera';
      if (e.tipo === 'medio_bano' && !/medio/i.test(n)) n = 'Medio baño';
      return { n: n, k: k, x: +e.x || 0, y: +e.y || 0, w: +e.ancho || 0, h: +e.fondo || 0, g: e.grupo > 0 ? e.grupo : null, t: e.tipo };
    }).filter(function (q) { return q.w > 0.2 && q.h > 0.2; });
    var doors = (L.puertas || []).map(function (d) { return { x: +d.x || 0, y: +d.y || 0, o: d.orientacion === 'v' ? 'v' : 'h', w: Math.max(0.6, Math.min(3, +d.ancho || 0.9)), main: !!d.principal }; });
    var g = rotate({ W: W, D: D, rooms: rooms, doors: doors }, L.calle);
    g.rooms.forEach(function (q) { // dentro del contorno
      q.x = clamp(q.x, 0, g.W - 0.3); q.y = clamp(q.y, 0, g.D - 0.3); q.w = Math.min(q.w, g.W - q.x); q.h = Math.min(q.h, g.D - q.y);
      q.x = r2(q.x); q.y = r2(q.y); q.w = r2(q.w); q.h = r2(q.h);
    });
    return g;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  // Gira la lectura para que la calle quede abajo
  function rotate(g, calle) {
    var W = g.W, D = g.D;
    if (calle === 'arriba') {
      g.rooms.forEach(function (q) { q.x = W - q.x - q.w; q.y = D - q.y - q.h; });
      g.doors.forEach(function (d) { if (d.o === 'h') { d.x = W - d.x - d.w; d.y = D - d.y; } else { d.x = W - d.x; d.y = D - d.y - d.w; } });
    } else if (calle === 'izquierda' || calle === 'derecha') {
      var L = calle === 'izquierda';
      g.rooms.forEach(function (q) { var x = q.x, y = q.y, w = q.w, h = q.h; q.w = h; q.h = w; q.x = L ? y : D - y - h; q.y = L ? W - x - w : x; });
      g.doors.forEach(function (d) {
        var x = d.x, y = d.y;
        if (d.o === 'h') { d.o = 'v'; d.x = L ? y : D - y; d.y = L ? W - x - d.w : x; }
        else { d.o = 'h'; d.x = L ? y : D - y - d.w; d.y = L ? W - x : x; }
      });
      g.W = D; g.D = W;
    }
    return g;
  }
  // Conteos para el formulario
  function counts(levels) {
    var c = { beds: 0, baths: 0, halfBaths: 0, parking: 0 };
    levels.forEach(function (lv) {
      var seen = {};
      lv.rooms.forEach(function (q) {
        if (q.g) { if (seen[q.g]) return; seen[q.g] = 1; }
        if (q.k === 'rec' && !/vestidor|cl[oó]set/i.test(q.n)) c.beds++;
        if (q.k === 'bano') { if (/medio|½/i.test(q.n) || q.t === 'medio_bano') c.halfBaths++; else c.baths++; }
        if (q.k === 'coch') c.parking += Math.max(1, Math.floor(q.w / 2.5));
      });
    });
    return c;
  }

  window.RinovaLecturaPlano = { detect: detect, looksLikeFacade: looksLikeFacade, classify: classify, fromAI: fromAI, rotate: rotate, counts: counts };
})();
