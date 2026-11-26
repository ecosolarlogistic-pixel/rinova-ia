/* RINOVAIA — SVG a multiformato (skill-svg-a-multiformato).
   Convierte una lámina SVG del juego de planos a DXF (AutoCAD) y el modelo del proyecto a IFC (Revit),
   todo en el navegador, sin servidor:

   1. SVG → geometría: recorre el SVG, aplica transformaciones (transform, <svg> anidados con viewBox, <use>),
      aplana trayectorias (curvas y arcos) y separa trazo, relleno y texto.
   2. Escala: si la lámina trae escala gráfica (data-pxm = px por metro) todo pasa a metros reales 1:1;
      si no, se conserva la unidad del SVG. El eje Y se invierte (en CAD Y crece hacia arriba).
   3. Capas: cada grupo puede declarar data-cad-layer="A-MUROS"; lo que no lo declara toma capa por color.
      Los rellenos claros (fondos de espacios) van a Z-RELLENOS, que se entrega apagada.
   4. DXF ASCII R12 (AC1009): LINE, POLYLINE, CIRCLE, SOLID y TEXT, con tabla de capas y tipo de línea DASHED.
      Es el DXF que abren todas las versiones de AutoCAD, BricsCAD, LibreCAD, DraftSight y que Revit vincula.
   5. IFC 2x3 (Coordination View): proyecto › terreno › edificio › niveles, con muros, losas y espacios
      extruidos a su altura. Revit lo abre con Abrir › IFC.

   DWG es un formato binario cerrado: no se escribe en el navegador. El DXF se abre en AutoCAD y se guarda como DWG. */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- matrices 2D [a b c d e f] */
  var I = [1, 0, 0, 1, 0, 0];
  function mul(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; }
  function ap(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function nums(s) { return (String(s || '').match(/-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || []).map(Number); }
  function parseTransform(t) {
    var m = I, re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g, k;
    while ((k = re.exec(t || ''))) {
      var a = nums(k[2]), n;
      switch (k[1]) {
        case 'matrix': n = a.length === 6 ? a : I; break;
        case 'translate': n = [1, 0, 0, 1, a[0] || 0, a[1] || 0]; break;
        case 'scale': n = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0]; break;
        case 'rotate':
          var r = (a[0] || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
          n = [c, s, -s, c, 0, 0];
          if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
          break;
        case 'skewX': n = [1, 0, Math.tan((a[0] || 0) * Math.PI / 180), 1, 0, 0]; break;
        case 'skewY': n = [1, Math.tan((a[0] || 0) * Math.PI / 180), 0, 1, 0, 0]; break;
      }
      m = mul(m, n);
    }
    return m;
  }
  // Transformación de un <svg> anidado: x/y + viewBox con preserveAspectRatio (meet/slice, alineación)
  function viewportMatrix(el) {
    var x = +el.getAttribute('x') || 0, y = +el.getAttribute('y') || 0, vb = nums(el.getAttribute('viewBox'));
    var w = parseFloat(el.getAttribute('width')), h = parseFloat(el.getAttribute('height'));
    if (vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0)) return [1, 0, 0, 1, x, y];
    if (!(w > 0)) w = vb[2]; if (!(h > 0)) h = vb[3];
    var par = (el.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim().split(/\s+/), al = par[0], sx = w / vb[2], sy = h / vb[3];
    if (al !== 'none') {
      var sc = par[1] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy); sx = sy = sc;
      var ex = w - vb[2] * sc, ey = h - vb[3] * sc;
      x += /xMid/.test(al) ? ex / 2 : /xMax/.test(al) ? ex : 0;
      y += /YMid/.test(al) ? ey / 2 : /YMax/.test(al) ? ey : 0;
    }
    return [sx, 0, 0, sy, x - vb[0] * sx, y - vb[1] * sy];
  }

  /* ---------------------------------------------------------------- estilo heredado */
  var INHERIT = ['stroke', 'fill', 'stroke-width', 'stroke-dasharray', 'font-size', 'text-anchor', 'visibility', 'font-weight'];
  function styleOf(el, parent) {
    var st = Object.assign({}, parent), css = {};
    (el.getAttribute('style') || '').split(';').forEach(function (d) { var i = d.indexOf(':'); if (i > 0) css[d.slice(0, i).trim()] = d.slice(i + 1).trim(); });
    INHERIT.forEach(function (k) { var v = css[k] != null ? css[k] : el.getAttribute(k); if (v != null && v !== '' && v !== 'inherit') st[k] = v; });
    var op = css.opacity != null ? css.opacity : el.getAttribute('opacity');
    if (op != null && parseFloat(op) === 0) st.hidden = true;
    if ((css.display || el.getAttribute('display')) === 'none') st.hidden = true;
    var lay = el.getAttribute('data-cad-layer'); if (lay) st.layer = lay;
    return st;
  }
  var NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080', yellow: '#ffff00', orange: '#ffa500', navy: '#000080', silver: '#c0c0c0' };
  function color(v) {
    if (!v) return null; v = String(v).trim().toLowerCase();
    if (v === 'none' || v === 'transparent' || v.indexOf('url(') === 0) return null;
    if (NAMED[v]) return NAMED[v];
    var m = /^#([0-9a-f]{3})$/.exec(v); if (m) return '#' + m[1].split('').map(function (c) { return c + c; }).join('');
    if (/^#[0-9a-f]{6}$/.test(v)) return v;
    m = /^rgba?\(([^)]*)\)/.exec(v);
    if (m) { var p = m[1].split(',').map(parseFloat); if (p.length > 3 && p[3] === 0) return null; return '#' + p.slice(0, 3).map(function (n) { return ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2); }).join(''); }
    return '#000000';
  }
  function lum(hex) { var n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; }

  /* ---------------------------------------------------------------- trayectorias SVG → polilíneas */
  function arcPts(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    if (!rx || !ry) return [[x2, y2]];
    rx = Math.abs(rx); ry = Math.abs(ry); phi = phi * Math.PI / 180;
    var c = Math.cos(phi), s = Math.sin(phi), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    var xp = c * dx + s * dy, yp = -s * dx + c * dy, L = xp * xp / (rx * rx) + yp * yp / (ry * ry);
    if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
    var num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp;
    var k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den)), cxp = k * rx * yp / ry, cyp = -k * ry * xp / rx;
    var cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
    function ang(ux, uy, vx, vy) { var a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; }
    var t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry), dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    var n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 12))), out = [];
    for (var i = 1; i <= n; i++) { var t = t1 + dt * i / n; out.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]); }
    return out;
  }
  function parsePath(d) {
    var tk = String(d || '').match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || [];
    var subs = [], cur = null, i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lq = null, N = 10;
    function num() { return +tk[i++]; }
    function isNum() { return i < tk.length && !/[a-z]/i.test(tk[i]); }
    function start(px, py) { cur = { pts: [[px, py]], closed: false }; subs.push(cur); }
    function to(px, py) { if (!cur) start(x, y); cur.pts.push([px, py]); }
    while (i < tk.length) {
      if (!isNum()) cmd = tk[i++];
      var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), bx = rel ? x : 0, by = rel ? y : 0, j, p0x, p0y;
      if (C === 'Z') { if (cur) { cur.closed = true; x = sx; y = sy; cur = null; } lq = null; continue; }
      if (!isNum()) { i++; continue; } // token sobrante
      switch (C) {
        case 'M': x = bx + num(); y = by + num(); sx = x; sy = y; start(x, y); cmd = rel ? 'l' : 'L'; lq = null; break;
        case 'L': x = bx + num(); y = by + num(); to(x, y); lq = null; break;
        case 'H': x = bx + num(); to(x, y); lq = null; break;
        case 'V': y = by + num(); to(x, y); lq = null; break;
        case 'C': case 'S': {
          var c1x, c1y;
          if (C === 'C') { c1x = bx + num(); c1y = by + num(); } else { c1x = lq && lq.c ? 2 * x - lcx : x; c1y = lq && lq.c ? 2 * y - lcy : y; }
          var c2x = bx + num(), c2y = by + num(), ex = bx + num(), ey = by + num();
          p0x = x; p0y = y;
          for (j = 1; j <= N; j++) { var t = j / N, u = 1 - t; to(u * u * u * p0x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex, u * u * u * p0y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey); }
          x = ex; y = ey; lcx = c2x; lcy = c2y; lq = { c: 1 }; break;
        }
        case 'Q': case 'T': {
          var qx, qy;
          if (C === 'Q') { qx = bx + num(); qy = by + num(); } else { qx = lq && lq.q ? 2 * x - lcx : x; qy = lq && lq.q ? 2 * y - lcy : y; }
          var qex = bx + num(), qey = by + num(); p0x = x; p0y = y;
          for (j = 1; j <= N; j++) { var t2 = j / N, u2 = 1 - t2; to(u2 * u2 * p0x + 2 * u2 * t2 * qx + t2 * t2 * qex, u2 * u2 * p0y + 2 * u2 * t2 * qy + t2 * t2 * qey); }
          x = qex; y = qey; lcx = qx; lcy = qy; lq = { q: 1 }; break;
        }
        case 'A': {
          var rx = num(), ry = num(), ph = num(), fa = num(), fs = num(), ax = bx + num(), ay = by + num();
          arcPts(x, y, rx, ry, ph, fa, fs, ax, ay).forEach(function (p) { to(p[0], p[1]); });
          x = ax; y = ay; lq = null; break;
        }
        default: i++;
      }
    }
    return subs.filter(function (s) { return s.pts.length > 1; });
  }

  /* ---------------------------------------------------------------- SVG → entidades (en unidades del lienzo) */
  var SKIP = { defs: 1, clippath: 1, mask: 1, symbol: 1, title: 1, desc: 1, metadata: 1, lineargradient: 1, radialgradient: 1, pattern: 1, style: 1, script: 1, marker: 1, filter: 1 };
  function extract(svg) {
    var ents = [], skipped = { image: 0, other: 0 }, root = svg;
    var vb = nums(root.getAttribute('viewBox'));
    function byId(id) { try { return root.querySelector('[id="' + id.replace(/"/g, '') + '"]'); } catch (e) { return null; } }
    function push(e, st, kind) {
      e.layer = st.layer || null; e.kind = kind; e.dash = !!(st['stroke-dasharray'] && st['stroke-dasharray'] !== 'none');
      ents.push(e);
    }
    // Una figura: trazo → contorno en su capa; relleno oscuro → sólido/contorno; relleno claro → Z-RELLENOS
    function shape(polys, st, m, isRect) {
      var sk = color(st.stroke), fl = st.fill == null ? '#000000' : color(st.fill);
      var T = polys.map(function (p) { return { pts: p.pts.map(function (q) { return ap(m, q[0], q[1]); }), closed: p.closed }; });
      if (sk) T.forEach(function (p) { push({ type: 'poly', pts: p.pts, closed: p.closed, color: sk }, st, 'stroke'); });
      if (fl && T.length) {
        if (lum(fl) > 0.86) { if (!sk) T.forEach(function (p) { if (p.closed) push({ type: 'poly', pts: p.pts, closed: true, color: fl }, Object.assign({}, st, { layer: 'Z-RELLENOS', 'stroke-dasharray': null }), 'fill'); }); }
        else if (isRect) push({ type: 'solid', pts: T[0].pts, color: fl }, st, 'fill');
        else if (!sk) T.forEach(function (p) { push({ type: 'poly', pts: p.pts, closed: true, color: fl }, st, 'fill'); });
      }
    }
    function walk(el, m, pst, depth) {
      if (el.nodeType !== 1 || depth > 40) return;
      var tag = (el.localName || el.nodeName).toLowerCase();
      if (SKIP[tag]) return;
      var st = styleOf(el, pst); if (st.hidden || st.visibility === 'hidden') return;
      var lm = el.getAttribute('transform') ? mul(m, parseTransform(el.getAttribute('transform'))) : m;
      var a = function (k) { return parseFloat(el.getAttribute(k)) || 0; }, k;
      switch (tag) {
        case 'svg': if (el !== root) lm = mul(lm, viewportMatrix(el)); // sigue a hijos
        // falls through
        case 'g': case 'a': case 'switch':
          for (k = el.firstChild; k; k = k.nextSibling) walk(k, lm, st, depth + 1);
          return;
        case 'use': {
          var href = el.getAttribute('href') || el.getAttribute('xlink:href') || '', ref = href.charAt(0) === '#' ? byId(href.slice(1)) : null;
          if (ref) {
            var um = mul(lm, [1, 0, 0, 1, a('x'), a('y')]);
            if ((ref.localName || '').toLowerCase() === 'symbol') { for (k = ref.firstChild; k; k = k.nextSibling) walk(k, um, st, depth + 1); }
            else walk(ref, um, st, depth + 1);
          }
          return;
        }
        case 'line': shape([{ pts: [[a('x1'), a('y1')], [a('x2'), a('y2')]], closed: false }], Object.assign({}, st, { fill: 'none' }), lm); return;
        case 'rect': {
          var w = a('width'), h = a('height'), x = a('x'), y = a('y'); if (!(w > 0 && h > 0)) return;
          shape([{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }], st, lm, true); return;
        }
        case 'polyline': case 'polygon': {
          var v = nums(el.getAttribute('points')), pts = [];
          for (k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]]);
          if (pts.length > 1) shape([{ pts: pts, closed: tag === 'polygon' }], tag === 'polyline' ? Object.assign({}, st, { fill: st.fill || 'none' }) : st, lm);
          return;
        }
        case 'circle': case 'ellipse': {
          var cx = a('cx'), cy = a('cy'), rx = tag === 'circle' ? a('r') : a('rx'), ry = tag === 'circle' ? a('r') : a('ry');
          if (!(rx > 0 && ry > 0)) return;
          var sc = Math.sqrt(Math.abs(lm[0] * lm[3] - lm[1] * lm[2])), uni = Math.abs(lm[0] - lm[3]) < 1e-6 && Math.abs(lm[1] + lm[2]) < 1e-6;
          if (tag === 'circle' && uni) {
            var ck = color(st.stroke), cf = st.fill == null ? '#000000' : color(st.fill);
            if (ck) push({ type: 'circle', c: ap(lm, cx, cy), r: rx * sc, color: ck }, st, 'stroke');
            else if (cf && lum(cf) <= 0.86) push({ type: 'circle', c: ap(lm, cx, cy), r: rx * sc, color: cf }, st, 'fill');
            else if (cf) push({ type: 'circle', c: ap(lm, cx, cy), r: rx * sc, color: cf }, Object.assign({}, st, { layer: 'Z-RELLENOS', 'stroke-dasharray': null }), 'fill');
            return;
          }
          var cp = []; for (k = 0; k < 48; k++) { var t = k / 48 * Math.PI * 2; cp.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
          shape([{ pts: cp, closed: true }], st, lm); return;
        }
        case 'path': shape(parsePath(el.getAttribute('d')), st, lm); return;
        case 'text': {
          var str = (el.textContent || '').replace(/\s+/g, ' ').trim(); if (!str) return;
          var fc = color(st.fill == null ? '#000000' : st.fill) || color(st.stroke); if (!fc) return;
          var tx = nums(el.getAttribute('x'))[0] || 0, ty = nums(el.getAttribute('y'))[0] || 0;
          var ts = el.querySelector && el.querySelector('tspan[x],tspan[y]');
          if (!el.getAttribute('x') && ts) { tx = nums(ts.getAttribute('x'))[0] || 0; ty = nums(ts.getAttribute('y'))[0] || 0; }
          var fs = parseFloat(st['font-size']) || 16, sc2 = Math.sqrt(Math.abs(lm[0] * lm[3] - lm[1] * lm[2]));
          push({ type: 'text', p: ap(lm, tx, ty), h: fs * 0.72 * sc2, rot: -Math.atan2(lm[1], lm[0]) * 180 / Math.PI, str: str, align: st['text-anchor'] || 'start', color: fc }, st, 'text');
          return;
        }
        case 'image': skipped.image++; return;
        default: skipped.other++;
      }
    }
    walk(root, I, { fill: null, stroke: null }, 0);
    return { ents: ents, skipped: skipped, vb: vb.length === 4 ? vb : [0, 0, +root.getAttribute('width') || 1000, +root.getAttribute('height') || 1000] };
  }

  /* ---------------------------------------------------------------- colores AutoCAD (ACI) */
  var ACI = (function () {
    var t = [[1, '#ff0000'], [2, '#ffff00'], [3, '#00ff00'], [4, '#00ffff'], [5, '#0000ff'], [6, '#ff00ff'], [8, '#808080'], [9, '#c0c0c0']];
    var VS = [[1, 1], [1, 0.5], [0.8, 1], [0.8, 0.5], [0.6, 1], [0.6, 0.5], [0.5, 1], [0.5, 0.5], [0.3, 1], [0.3, 0.5]];
    for (var n = 10; n <= 249; n++) {
      var h = Math.floor((n - 10) / 10) * 15, vs = VS[(n - 10) % 10], v = vs[0], s = vs[1];
      var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), mm = v - c, rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
      t.push([n, '#' + rgb.map(function (q) { return ('0' + Math.round((q + mm) * 255).toString(16)).slice(-2); }).join('')]);
    }
    [51, 91, 132, 173, 214].forEach(function (g, i) { var hx = ('0' + g.toString(16)).slice(-2); t.push([250 + i, '#' + hx + hx + hx]); });
    return t;
  })();
  function aci(hex) {
    if (!hex) return 7;
    if (lum(hex) < 0.22) return 7; // negro/grafito: blanco sobre fondo oscuro, negro al imprimir
    var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255, best = 7, bd = Infinity;
    ACI.forEach(function (e) { var m = parseInt(e[1].slice(1), 16), d = Math.pow(r - (m >> 16 & 255), 2) * 0.3 + Math.pow(g - (m >> 8 & 255), 2) * 0.59 + Math.pow(b - (m & 255), 2) * 0.11; if (d < bd) { bd = d; best = e[0]; } });
    return best;
  }

  /* ---------------------------------------------------------------- capas por color cuando el SVG no las declara */
  var COLOR_LAYER = { '#0b0f17': 'A-LINEAS', '#18202b': 'A-LINEAS', '#000000': 'A-LINEAS', '#b8932a': 'A-COTAS', '#d4af37': 'A-ACENTOS', '#c0c6d4': 'A-EJES', '#9aa3b2': 'A-AUXILIAR', '#2f4b7c': 'A-REFERENCIA', '#5a6475': 'A-NOTAS', '#2f6db0': 'IH-AGUA', '#c0492f': 'IH-DRENAJE' };
  function layerName(e) {
    var n = e.layer || (e.kind === 'text' ? 'A-TEXTO' : COLOR_LAYER[e.color] || ('SVG-' + String(e.color || '#000000').slice(1).toUpperCase()));
    if (e.layer && e.kind === 'text' && !/TEXTO|CUADRO/.test(e.layer)) n = e.layer + '-TEXTO';
    return String(n).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9_$-]+/g, '_').slice(0, 31) || '0';
  }

  /* ---------------------------------------------------------------- escritura DXF R12 */
  function fx(v) { var r = Math.round(v * 10000) / 10000; return (Object.is(r, -0) ? 0 : r).toString(); }
  // Texto DXF R12 en página de códigos ANSI_1252 (acentos, ñ, ², ·, × tal cual); lo demás como \U+XXXX
  var CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  function dxfText(s) {
    return String(s).replace(/[\x00-\x1f]/g, ' ').replace(/[^\x20-\x7e]/g, function (c) {
      var n = c.charCodeAt(0);
      return (n >= 0xA0 && n <= 0xFF) || CP1252[n] ? c : '\\U+' + ('000' + n.toString(16).toUpperCase()).slice(-4);
    });
  }
  function toAnsi(str) { var b = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) { var n = str.charCodeAt(i); b[i] = n < 0x80 || (n >= 0xA0 && n <= 0xFF) ? n : CP1252[n] || 0x3F; } return b; }

  function svgToDxf(svg, opt) {
    opt = opt || {};
    if (typeof svg === 'string') svg = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    var ex = extract(svg), vb = ex.vb;
    var pxm = parseFloat(opt.pxPerMeter) || 0;
    if (!pxm) { var sb = svg.querySelector('[data-pxm]'); if (sb) pxm = parseFloat(sb.getAttribute('data-pxm')) || 0; }
    var k = pxm > 0 ? 1 / pxm : 1, units = pxm > 0 ? 6 : 0, H = vb[1] + vb[3];
    function P(p) { return [(p[0] - vb[0]) * k, (H - p[1]) * k]; }
    var out = [], layers = {}, stats = { LINE: 0, POLYLINE: 0, CIRCLE: 0, SOLID: 0, TEXT: 0 }, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function g(code, val) { out.push(String(code), String(val)); }
    function bb(q) { if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0]; if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; }
    function head(type, e, L) { g(0, type); g(8, L); if (e.dash) g(6, 'DASHED'); g(62, aci(e.color)); }
    ex.ents.forEach(function (e) {
      var L = layerName(e);
      if (!layers[L]) layers[L] = { color: L === 'Z-RELLENOS' ? 254 : aci(e.color), off: L === 'Z-RELLENOS', n: 0 };
      layers[L].n++;
      if (e.type === 'poly') {
        var pts = e.pts.map(P), clean = [];
        pts.forEach(function (q) { var l = clean[clean.length - 1]; if (!l || Math.abs(l[0] - q[0]) > 1e-6 || Math.abs(l[1] - q[1]) > 1e-6) clean.push(q); });
        if (e.closed && clean.length > 2) { var f0 = clean[0], fl = clean[clean.length - 1]; if (Math.abs(f0[0] - fl[0]) < 1e-6 && Math.abs(f0[1] - fl[1]) < 1e-6) clean.pop(); }
        if (clean.length < 2) return;
        clean.forEach(bb);
        if (clean.length === 2 && !e.closed) {
          head('LINE', e, L); g(10, fx(clean[0][0])); g(20, fx(clean[0][1])); g(30, 0); g(11, fx(clean[1][0])); g(21, fx(clean[1][1])); g(31, 0); stats.LINE++;
        } else {
          head('POLYLINE', e, L); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, e.closed ? 1 : 0);
          clean.forEach(function (q) { g(0, 'VERTEX'); g(8, L); g(10, fx(q[0])); g(20, fx(q[1])); g(30, 0); });
          g(0, 'SEQEND'); g(8, L); stats.POLYLINE++;
        }
      } else if (e.type === 'solid') {
        var s = e.pts.map(P); s.forEach(bb);
        head('SOLID', e, L); // orden de vértices DXF: 1-2-4-3
        g(10, fx(s[0][0])); g(20, fx(s[0][1])); g(30, 0); g(11, fx(s[1][0])); g(21, fx(s[1][1])); g(31, 0);
        g(12, fx(s[3][0])); g(22, fx(s[3][1])); g(32, 0); g(13, fx(s[2][0])); g(23, fx(s[2][1])); g(33, 0); stats.SOLID++;
      } else if (e.type === 'circle') {
        var c = P(e.c), r = e.r * k; bb([c[0] - r, c[1] - r]); bb([c[0] + r, c[1] + r]);
        head('CIRCLE', e, L); g(10, fx(c[0])); g(20, fx(c[1])); g(30, 0); g(40, fx(r)); stats.CIRCLE++;
      } else if (e.type === 'text') {
        var t = P(e.p), h = e.h * k, al = e.align === 'middle' ? 1 : e.align === 'end' ? 2 : 0; bb(t);
        head('TEXT', e, L); g(10, fx(t[0])); g(20, fx(t[1])); g(30, 0); g(40, fx(h)); g(1, dxfText(e.str));
        if (Math.abs(e.rot) > 0.01) g(50, fx(e.rot));
        g(7, 'RINOVA');
        if (al) { g(72, al); g(11, fx(t[0])); g(21, fx(t[1])); g(31, 0); }
        stats.TEXT++;
      }
    });
    if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
    var dash = 5 * k, gap = 4 * k, d = [];
    function h(code, val) { d.push(String(code), String(val)); }
    h(0, 'SECTION'); h(2, 'HEADER');
    h(9, '$ACADVER'); h(1, 'AC1009');
    h(9, '$DWGCODEPAGE'); h(3, 'ANSI_1252');
    h(9, '$INSBASE'); h(10, 0); h(20, 0); h(30, 0);
    h(9, '$EXTMIN'); h(10, fx(minX)); h(20, fx(minY)); h(30, 0);
    h(9, '$EXTMAX'); h(10, fx(maxX)); h(20, fx(maxY)); h(30, 0);
    h(9, '$LIMMIN'); h(10, fx(minX)); h(20, fx(minY));
    h(9, '$LIMMAX'); h(10, fx(maxX)); h(20, fx(maxY));
    h(9, '$LTSCALE'); h(40, 1);
    h(9, '$INSUNITS'); h(70, units);
    h(0, 'ENDSEC');
    h(0, 'SECTION'); h(2, 'TABLES');
    h(0, 'TABLE'); h(2, 'LTYPE'); h(70, 2);
    h(0, 'LTYPE'); h(2, 'CONTINUOUS'); h(70, 0); h(3, 'Solid line'); h(72, 65); h(73, 0); h(40, 0);
    h(0, 'LTYPE'); h(2, 'DASHED'); h(70, 0); h(3, '__ __ __'); h(72, 65); h(73, 2); h(40, fx(dash + gap)); h(49, fx(dash)); h(49, fx(-gap));
    h(0, 'ENDTAB');
    var names = Object.keys(layers).sort();
    h(0, 'TABLE'); h(2, 'LAYER'); h(70, names.length + 1);
    h(0, 'LAYER'); h(2, '0'); h(70, 0); h(62, 7); h(6, 'CONTINUOUS');
    names.forEach(function (n) { h(0, 'LAYER'); h(2, n); h(70, 0); h(62, layers[n].off ? -layers[n].color : layers[n].color); h(6, 'CONTINUOUS'); });
    h(0, 'ENDTAB');
    h(0, 'TABLE'); h(2, 'STYLE'); h(70, 1);
    h(0, 'STYLE'); h(2, 'RINOVA'); h(70, 0); h(40, 0); h(41, 1); h(50, 0); h(71, 0); h(42, 1); h(3, 'arial.ttf'); h(4, '');
    h(0, 'ENDTAB');
    h(0, 'ENDSEC');
    h(0, 'SECTION'); h(2, 'ENTITIES');
    var text = d.concat(out).concat(['0', 'ENDSEC', '0', 'EOF']).join('\r\n') + '\r\n';
    return {
      text: text, bytes: toAnsi(text), units: units ? 'm' : 'unidades SVG', scale: pxm ? '1:1 en metros' : 'sin escala', layers: names.map(function (n) { return { name: n, count: layers[n].n, off: layers[n].off }; }),
      stats: stats, entities: stats.LINE + stats.POLYLINE + stats.CIRCLE + stats.SOLID + stats.TEXT, skipped: ex.skipped,
      size: [maxX - minX, maxY - minY]
    };
  }

  /* ---------------------------------------------------------------- IFC 2x3 para Revit */
  var B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  function guid() { // GUID IFC comprimido de 22 caracteres
    var b = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (var q = 0; q < 16; q++) b[q] = Math.random() * 256 | 0;
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var n = 0n; for (var i = 0; i < 16; i++) n = (n << 8n) | BigInt(b[i]);
    var s = ''; for (var j = 0; j < 22; j++) { s = B64[Number(n & 63n)] + s; n >>= 6n; }
    return s;
  }
  function ifcStr(s) { // texto IFC: apóstrofo doble y \X2\ para no-ASCII
    return "'" + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]+/g, function (run) {
      return '\\X2\\' + run.split('').map(function (c) { return ('000' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4); }).join('') + '\\X0\\';
    }) + "'";
  }
  function rn(v) { var r = Math.round(v * 10000) / 10000; r = Object.is(r, -0) ? 0 : r; var s = String(r); return /[.eE]/.test(s) ? s : s + '.'; }

  /* model = { name, site, W, D, levels: [{ name, elev, h, cells: [{ n, k, x, y, w, h }], walls: [{ x1, y1, x2, y2, t, ext }] }] }
     Medidas en metros; x a la derecha, y hacia abajo (como el plano). Se invierte a Y arriba. */
  function modelToIfc(model) {
    var L = [], id = 0;
    function E(s) { id++; L.push('#' + id + '=' + s + ';'); return '#' + id; }
    var now = new Date(), ts = Math.floor(now.getTime() / 1000), D = model.D;
    var person = E("IFCPERSON($,$,'RINOVAIA',$,$,$,$,$)"), org = E("IFCORGANIZATION($,'RINOVAIA','Arquitectura e ingenier\\X2\\00ED\\X0\\a',$,$)");
    var po = E('IFCPERSONANDORGANIZATION(' + person + ',' + org + ',$)'), app = E("IFCAPPLICATION(" + org + ",'1.0','RINOVAIA Estudio','RINOVAIA')");
    var OH = E('IFCOWNERHISTORY(' + po + ',' + app + ',$,.ADDED.,$,$,$,' + ts + ')');
    var u1 = E('IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)'), u2 = E('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'), u3 = E('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), u4 = E('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)');
    var units = E('IFCUNITASSIGNMENT((' + [u1, u2, u3, u4].join(',') + '))');
    var O = E('IFCCARTESIANPOINT((0.,0.,0.))'), Z = E('IFCDIRECTION((0.,0.,1.))'), X = E('IFCDIRECTION((1.,0.,0.))');
    var A0 = E('IFCAXIS2PLACEMENT3D(' + O + ',' + Z + ',' + X + ')');
    var TN = E('IFCDIRECTION((0.,1.))');
    var ctx = E("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05," + A0 + ',' + TN + ')');
    var body = E("IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*," + ctx + ',$,.MODEL_VIEW.,$)');
    var proj = E('IFCPROJECT(' + ifcStr(guid()) + ',' + OH + ',' + ifcStr(model.name || 'Proyecto') + ",'Exportado desde RINOVAIA',$,$,$,(" + ctx + '),' + units + ')');
    var siteLP = E('IFCLOCALPLACEMENT($,' + A0 + ')');
    var site = E('IFCSITE(' + ifcStr(guid()) + ',' + OH + ',' + ifcStr(model.site || 'Terreno') + ',$,$,' + siteLP + ',$,$,.ELEMENT.,$,$,$,$,$)');
    var bLP = E('IFCLOCALPLACEMENT(' + siteLP + ',' + A0 + ')');
    var bldg = E('IFCBUILDING(' + ifcStr(guid()) + ',' + OH + ',' + ifcStr(model.name || 'Edificio') + ',$,$,' + bLP + ',$,$,.ELEMENT.,$,$,$)');
    E('IFCRELAGGREGATES(' + ifcStr(guid()) + ',' + OH + ',$,$,' + proj + ',(' + site + '))');
    E('IFCRELAGGREGATES(' + ifcStr(guid()) + ',' + OH + ',$,$,' + site + ',(' + bldg + '))');
    var mat = E("IFCMATERIAL('Block de concreto')"), matS = E("IFCMATERIAL('Concreto armado')");
    var wallsAll = [], slabsAll = [], storeys = [], stats = { levels: 0, walls: 0, slabs: 0, spaces: 0 };
    function pt3(x, y, z) { return E('IFCCARTESIANPOINT((' + rn(x) + ',' + rn(y) + ',' + rn(z) + '))'); }
    function placement(rel, x, y, z, dx, dy) {
      var ax = E('IFCAXIS2PLACEMENT3D(' + pt3(x, y, z) + ',' + Z + ',' + (dx == null ? X : E('IFCDIRECTION((' + rn(dx) + ',' + rn(dy) + ',0.))')) + ')');
      return E('IFCLOCALPLACEMENT(' + rel + ',' + ax + ')');
    }
    function box(cx, cy, w, d, h) { // prisma rectangular centrado en (cx,cy) del sistema local, de z=0 a z=h
      var p2 = E('IFCAXIS2PLACEMENT2D(' + E('IFCCARTESIANPOINT((' + rn(cx) + ',' + rn(cy) + '))') + ',$)');
      var prof = E('IFCRECTANGLEPROFILEDEF(.AREA.,$,' + p2 + ',' + rn(w) + ',' + rn(d) + ')');
      var solid = E('IFCEXTRUDEDAREASOLID(' + prof + ',' + E('IFCAXIS2PLACEMENT3D(' + O + ',$,$)') + ',' + Z + ',' + rn(h) + ')');
      var rep = E('IFCSHAPEREPRESENTATION(' + body + ",'Body','SweptSolid',(" + solid + '))');
      return E('IFCPRODUCTDEFINITIONSHAPE($,$,(' + rep + '))');
    }
    model.levels.forEach(function (lv, li) {
      var sLP = placement(bLP, 0, 0, lv.elev);
      var st = E('IFCBUILDINGSTOREY(' + ifcStr(guid()) + ',' + OH + ',' + ifcStr(lv.name) + ',$,$,' + sLP + ',$,$,.ELEMENT.,' + rn(lv.elev) + ')');
      storeys.push(st); stats.levels++;
      var contained = [], spaces = [];
      // Losa del nivel (12 cm bajo el nivel de piso terminado)
      var slab = E('IFCSLAB(' + ifcStr(guid()) + ',' + OH + ',' + ifcStr('Losa ' + lv.name) + ',$,$,' + placement(sLP, 0, 0, -0.12) + ',' + box(model.W / 2, D / 2, model.W, D, 0.12) + ",$,.FLOOR.)");
      contained.push(slab); slabsAll.push(slab); stats.slabs++;
      (lv.walls || []).forEach(function (w) {
        var dx = w.x2 - w.x1, dy = -(w.y2 - w.y1), len = Math.sqrt(dx * dx + dy * dy); if (len < 0.05) return;
        var pl = placement(sLP, w.x1, D - w.y1, 0, dx / len, dy / len);
        var wall = E('IFCWALL(' + ifcStr(guid()) + ',' + OH + ',' + ifcStr(w.ext ? 'Muro exterior' : 'Muro interior') + ',$,' + ifcStr(w.ext ? 'Muro 20 cm' : 'Muro 12 cm') + ',' + pl + ',' + box(len / 2, 0, len, w.t, lv.h) + ',$)');
        contained.push(wall); wallsAll.push(wall); stats.walls++;
      });
      (lv.cells || []).forEach(function (c) {
        if (!(c.w > 0.2 && c.h > 0.2)) return;
        var sp = E('IFCSPACE(' + ifcStr(guid()) + ',' + OH + ',' + ifcStr(c.n) + ',$,$,' + placement(sLP, c.x, D - c.y - c.h, 0) + ',' + box(c.w / 2, c.h / 2, c.w, c.h, Math.max(0.5, lv.h - 0.12)) + ',' + ifcStr(c.n + ' · ' + (Math.round(c.w * c.h * 10) / 10) + ' m2') + ',.ELEMENT.,' + (c.k === 'ext' ? '.EXTERNAL.' : '.INTERNAL.') + ',$)');
        spaces.push(sp); stats.spaces++;
      });
      if (contained.length) E('IFCRELCONTAINEDINSPATIALSTRUCTURE(' + ifcStr(guid()) + ',' + OH + ',$,$,(' + contained.join(',') + '),' + st + ')');
      if (spaces.length) E('IFCRELAGGREGATES(' + ifcStr(guid()) + ',' + OH + ',$,$,' + st + ',(' + spaces.join(',') + '))');
      // Azotea sobre el último nivel
      if (li === model.levels.length - 1) {
        var roof = E('IFCSLAB(' + ifcStr(guid()) + ',' + OH + ",'Losa de azotea',$,$," + placement(sLP, 0, 0, lv.h - 0.12) + ',' + box(model.W / 2, D / 2, model.W, D, 0.12) + ',$,.ROOF.)');
        E('IFCRELCONTAINEDINSPATIALSTRUCTURE(' + ifcStr(guid()) + ',' + OH + ',$,$,(' + roof + '),' + st + ')');
        slabsAll.push(roof); stats.slabs++;
      }
    });
    E('IFCRELAGGREGATES(' + ifcStr(guid()) + ',' + OH + ',$,$,' + bldg + ',(' + storeys.join(',') + '))');
    if (wallsAll.length) E('IFCRELASSOCIATESMATERIAL(' + ifcStr(guid()) + ',' + OH + ',$,$,(' + wallsAll.join(',') + '),' + mat + ')');
    if (slabsAll.length) E('IFCRELASSOCIATESMATERIAL(' + ifcStr(guid()) + ',' + OH + ',$,$,(' + slabsAll.join(',') + '),' + matS + ')');
    var file = (model.file || 'rinova') + '.ifc', iso = now.toISOString().slice(0, 19);
    var head = ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');",
      'FILE_NAME(' + ifcStr(file) + ",'" + iso + "',('RINOVAIA'),('RINOVAIA'),'RINOVAIA Estudio','RINOVAIA Estudio','');", "FILE_SCHEMA(('IFC2X3'));", 'ENDSEC;', 'DATA;'];
    return { text: head.concat(L).concat(['ENDSEC;', 'END-ISO-10303-21;']).join('\n') + '\n', stats: stats };
  }

  /* Modelo IFC a partir del juego de planos de RINOVAIA (niveles de RinovaPlanos.build) */
  function modelFromPlans(levels, r, heights, wallSegments, name, site) {
    var W = r.W, D = r.D, te = 0.2, ti = 0.12, elev = 0;
    var out = levels.map(function (lv, i) {
      var h = heights[i] || 3, walls = [
        { x1: 0, y1: te / 2, x2: W, y2: te / 2, t: te, ext: true },
        { x1: 0, y1: D - te / 2, x2: W, y2: D - te / 2, t: te, ext: true },
        { x1: te / 2, y1: te, x2: te / 2, y2: D - te, t: te, ext: true },
        { x1: W - te / 2, y1: te, x2: W - te / 2, y2: D - te, t: te, ext: true }
      ];
      (wallSegments ? wallSegments(lv) : []).forEach(function (e) {
        if (e.off || (e.A && e.B && e.A.k === 'ext' && e.B.k === 'ext')) return;
        var lo = Math.max(e.lo, te), hi = Math.min(e.hi, e.o === 'v' ? D - te : W - te); if (hi - lo < 0.1) return;
        walls.push(e.o === 'v' ? { x1: e.c, y1: lo, x2: e.c, y2: hi, t: ti } : { x1: lo, y1: e.c, x2: hi, y2: e.c, t: ti });
      });
      var o = { name: i === 0 ? 'Planta baja' : 'Nivel ' + i, elev: elev, h: h, walls: walls, cells: lv.cells.map(function (c) { return { n: c.n, k: c.k, x: c.x, y: c.y, w: c.w, h: c.h }; }) };
      elev += h; return o;
    });
    return { name: name, site: site, W: W, D: D, levels: out };
  }

  window.RinovaMultiformato = { svgToDxf: svgToDxf, modelToIfc: modelToIfc, modelFromPlans: modelFromPlans, parsePath: parsePath, aci: aci };
})();
