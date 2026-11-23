/* RINOVAIA — Recorrido virtual del interior, por planta.
   Levanta cada nivel a partir de la distribución del juego de planos (RinovaPlanos.build → levels[].cells):
   muros con puertas, vanos y ventanas, pisos y plafones por tipo de espacio, escalera, y amuebla cada
   espacio (sala, comedor, cocina, recámaras, vestidor, baños, estudio, lavado, cochera, jardín…) con
   piezas modeladas aquí mismo y materiales PBR. Todas las texturas (madera, mármol, tela, azulejo,
   tapetes y cuadros) se generan por procedimiento en el navegador: no hay archivos de terceros.
   Iluminación: mapa de entorno (PMREM), sol con sombras a través de las ventanas, luces interiores
   por espacio y oclusión de contacto simulada. Controles en primera persona: arrastrar para mirar,
   W A S D o joystick táctil para caminar, clic o toque en el piso para ir a ese punto. */
(function (global) {
  'use strict';

  /* ================= Utilidades ================= */
  function RNG(seed) { var s = (seed | 0) % 2147483647; if (s <= 0) s += 2147483646; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function hashStr(t) { var h = 2166136261; t = String(t); for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 2147483645) + 1; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  var MOBILE = Math.min(screen.width, screen.height) < 700 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  /* ================= Texturas procedurales ================= */
  var TEXCACHE = null;
  function Textures(T, renderer) {
    if (TEXCACHE && TEXCACHE.T === T) return TEXCACHE;
    var N = MOBILE ? 512 : 1024, aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    var cache = {};
    function vn(n, fx, fy, seed, out, amp) {
      var r = RNG(seed), g = new Float32Array(fx * fy), i;
      for (i = 0; i < g.length; i++) g[i] = r();
      var sx = fx / n, sy = fy / n;
      for (var y = 0; y < n; y++) {
        var py = y * sy, iy = py | 0, ty = py - iy; ty = ty * ty * (3 - 2 * ty);
        var r0 = (iy % fy) * fx, r1 = ((iy + 1) % fy) * fx;
        for (var x = 0; x < n; x++) {
          var px = x * sx, ix = px | 0, tx = px - ix; tx = tx * tx * (3 - 2 * tx);
          var c0 = ix % fx, c1 = (ix + 1) % fx;
          var a = g[r0 + c0] + (g[r0 + c1] - g[r0 + c0]) * tx, b = g[r1 + c0] + (g[r1 + c1] - g[r1 + c0]) * tx;
          out[y * n + x] += (a + (b - a) * ty) * amp;
        }
      }
      return out;
    }
    function fbm(n, fx, fy, oct, seed) {
      var o = new Float32Array(n * n), amp = 0.5, tot = 0;
      for (var k = 0; k < oct; k++) { vn(n, Math.min(n, fx << k), Math.min(n, fy << k), seed + k * 131, o, amp); tot += amp; amp *= 0.5; }
      for (var i = 0; i < o.length; i++) o[i] /= tot;
      return o;
    }
    function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
    function pix(n, fn) { var c = canvas(n), g = c.getContext('2d'), id = g.createImageData(n, n); fn(id.data, n); g.putImageData(id, 0, 0); return c; }
    function tex(c, srgb, size) {
      var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = aniso;
      if (srgb) t.colorSpace = T.SRGBColorSpace;
      if (size) t.repeat.set(1 / size, 1 / size);
      return t;
    }
    function normal(h, n, str) {
      return pix(n, function (d) {
        for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
          var dx = h[y * n + (x + 1) % n] - h[y * n + (x - 1 + n) % n], dy = h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x];
          var nx = -dx * str, ny = dy * str, l = Math.sqrt(nx * nx + ny * ny + 1), i = (y * n + x) * 4;
          d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
        }
      });
    }
    function gray(v, n) { return pix(n, function (d) { for (var i = 0; i < n * n; i++) { var c = clamp(v[i], 0, 1) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = c; d[i * 4 + 3] = 255; } }); }
    function rgb(n, fn) { return pix(n, function (d) { var c = [0, 0, 0]; for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) { fn(x, y, c); var i = (y * n + x) * 4; d[i] = clamp(c[0], 0, 255); d[i + 1] = clamp(c[1], 0, 255); d[i + 2] = clamp(c[2], 0, 255); d[i + 3] = 255; } }); }
    function set(map, h, rough, size, nStr, n) { return { map: tex(map, true, size), normalMap: tex(normal(h, n, nStr), false, size), roughnessMap: rough ? tex(gray(rough, n), false, size) : null }; }

    var make = {
      // Duela de encino: 12 tablas por mosaico de 2.4 m, juntas desfasadas, veta y tono por tabla
      oak: function () {
        var n = N, grain = fbm(n, 96, 5, 4, 11), fine = fbm(n, 220, 14, 2, 17), r = RNG(5), planks = 12, pw = n / planks;
        var tint = [], joint = [];
        for (var p = 0; p < planks; p++) { tint.push(0.84 + r() * 0.26); joint.push(r() * n); }
        var h = new Float32Array(n * n), ro = new Float32Array(n * n);
        var c = rgb(n, function (x, y, o) {
          var p = Math.floor(x / pw), lx = x - p * pw, i = y * n + x, ly = (y - joint[p] + n) % (n / 2);
          var edge = lx < 1.2 || lx > pw - 1.2 || ly < 1.2 ? 1 : 0;
          var gv = grain[i] * 0.75 + fine[i] * 0.25, ring = Math.sin((gv * 18 + p * 1.7)) * 0.5 + 0.5;
          var k = tint[p] * (0.86 + gv * 0.22 - ring * 0.07);
          o[0] = 196 * k; o[1] = 152 * k; o[2] = 108 * k;
          if (edge) { o[0] *= 0.55; o[1] *= 0.52; o[2] *= 0.5; }
          h[i] = edge ? 0 : 0.6 + ring * 0.1 + fine[i] * 0.2; ro[i] = edge ? 0.85 : 0.42 + ring * 0.12 + (1 - tint[p]) * 0.3;
        });
        return set(c, h, ro, 2.4, 3, n);
      },
      // Veta neutra para muebles (se tiñe con el color del material)
      grain: function () {
        var n = N >> 1, a = fbm(n, 64, 4, 4, 23), b = fbm(n, 160, 10, 2, 29), h = new Float32Array(n * n);
        var c = rgb(n, function (x, y, o) { var i = y * n + x, v = Math.sin(a[i] * 22) * 0.5 + 0.5, k = 0.88 + a[i] * 0.08 + b[i] * 0.05 - v * 0.05; h[i] = v * 0.3 + b[i] * 0.3; o[0] = o[1] = o[2] = 255 * k; });
        return set(c, h, null, 1.0, 1.4, n);
      },
      // Mármol blanco con vetas grises (tileable)
      marble: function () {
        var n = N, w = fbm(n, 4, 4, 6, 41), cl = fbm(n, 8, 8, 4, 43), h = new Float32Array(n * n), ro = new Float32Array(n * n);
        var c = rgb(n, function (x, y, o) {
          var i = y * n + x, t = (x / n * 2 + y / n * 1) * Math.PI * 2 + w[i] * 9, v = Math.abs(Math.sin(t)), vein = 1 - sstep(0, 0.06, v), vein2 = (1 - sstep(0, 0.02, Math.abs(Math.sin(t * 3 + cl[i] * 5)))) * 0.45;
          var vv = Math.max(vein, vein2) * (0.5 + w[i] * 0.6), base = 243 - cl[i] * 14;
          o[0] = base - vv * 120; o[1] = base - vv * 118; o[2] = base - 3 - vv * 112;
          h[i] = 0.5 - vv * 0.08; ro[i] = 0.1 + vv * 0.12;
        });
        return set(c, h, ro, 1.6, 1, n);
      },
      // Tejido: trama y urdimbre con hilos irregulares (se tiñe)
      fabric: function () {
        var n = 256, s = fbm(n, 16, 64, 2, 51), h = new Float32Array(n * n), th = 64;
        var c = rgb(n, function (x, y, o) {
          var i = y * n + x, u = x / n * th * Math.PI, v = y / n * th * Math.PI, wv = Math.sin(u) * Math.sin(v) > 0 ? Math.abs(Math.sin(v)) : Math.abs(Math.sin(u));
          h[i] = wv * 0.7 + s[i] * 0.3; var k = 0.86 + wv * 0.1 + (s[i] - 0.5) * 0.12; o[0] = o[1] = o[2] = 255 * k;
        });
        return set(c, h, null, 0.12, 2.2, n);
      },
      // Aplanado fino pintado (piel de naranja)
      plaster: function () {
        var n = 256, a = fbm(n, 32, 32, 3, 61), b = fbm(n, 4, 4, 2, 67);
        var c = rgb(n, function (x, y, o) { var i = y * n + x, k = 0.965 + (a[i] - 0.5) * 0.03 + (b[i] - 0.5) * 0.04; o[0] = o[1] = o[2] = 255 * k; });
        return set(c, a, null, 1.2, 0.9, n);
      },
      concrete: function () {
        var n = N >> 1, a = fbm(n, 8, 8, 5, 71), p = fbm(n, 128, 128, 1, 73), h = new Float32Array(n * n), ro = new Float32Array(n * n);
        var c = rgb(n, function (x, y, o) { var i = y * n + x, pit = p[i] > 0.82 ? 1 : 0, k = 0.78 + a[i] * 0.22 - pit * 0.18; o[0] = 178 * k; o[1] = 176 * k; o[2] = 170 * k; h[i] = a[i] * 0.4 - pit * 0.4; ro[i] = 0.62 + a[i] * 0.25; });
        return set(c, h, ro, 2.0, 2, n);
      },
      grass: function () {
        var n = N >> 1, a = fbm(n, 6, 6, 4, 81), b = fbm(n, 128, 128, 2, 83), h = new Float32Array(n * n);
        var c = rgb(n, function (x, y, o) { var i = y * n + x, k = 0.7 + a[i] * 0.35 + (b[i] - 0.5) * 0.5; o[0] = 74 * k; o[1] = 116 * k; o[2] = 52 * k; h[i] = b[i]; });
        return set(c, h, null, 1.5, 3, n);
      },
      deck: function () {
        var n = N >> 1, a = fbm(n, 64, 4, 3, 91), r = RNG(9), pl = 8, pw = n / pl, t = [], h = new Float32Array(n * n);
        for (var p = 0; p < pl; p++) t.push(0.85 + r() * 0.25);
        var c = rgb(n, function (x, y, o) { var p = Math.floor(x / pw), lx = x - p * pw, i = y * n + x, e = lx < 2 || lx > pw - 2 ? 1 : 0, k = t[p] * (0.8 + a[i] * 0.3) * (e ? 0.4 : 1); o[0] = 150 * k; o[1] = 112 * k; o[2] = 80 * k; h[i] = e ? 0 : 0.5 + a[i] * 0.3; });
        return set(c, h, null, 1.2, 3, n);
      },
      // Azulejo / porcelanato: base (mármol o piedra) con juntas
      tileFloor: function () { return tiled('marble', 2, 1, 2.4, 1.2, [236, 233, 228], 0.18); },
      tileBath: function () { return tiled('stone', 4, 8, 1.2, 2.4, [232, 230, 226], 0.22); },
      tileBathFloor: function () { return tiled('stone', 2, 2, 1.2, 1.2, [118, 116, 112], 0.5); },
      tileKitchen: function () { return tiled('stone', 8, 16, 0.6, 1.2, [238, 236, 232], 0.12); }
    };
    function tiled(base, cols, rows, sw, sh, col, rough) {
      var n = N >> 1, a = fbm(n, 6, 6, 5, 101 + cols), w = fbm(n, 3, 3, 5, 107), h = new Float32Array(n * n), ro = new Float32Array(n * n), r = RNG(cols * 7 + rows), tv = [];
      for (var q = 0; q < cols * rows; q++) tv.push(0.95 + r() * 0.08);
      var c = rgb(n, function (x, y, o) {
        var cx = Math.floor(x / n * cols), cy = Math.floor(y / n * rows), lx = (x / n * cols) % 1, ly = (y / n * rows) % 1, i = y * n + x;
        var gw = 1.5 / (n / cols), gh = 1.5 / (n / rows), grout = lx < gw || ly < gh;
        var k = tv[cy * cols + cx], v = 0;
        if (base === 'marble') { var t = (x / n * 1 + y / n * 2) * Math.PI * 2 + w[i] * 8; v = (1 - sstep(0, 0.05, Math.abs(Math.sin(t)))) * 0.35; }
        var m = (0.94 + a[i] * 0.08) * k;
        o[0] = col[0] * m - v * 90; o[1] = col[1] * m - v * 88; o[2] = col[2] * m - v * 84;
        if (grout) { o[0] = o[1] = o[2] = col[0] > 200 ? 190 : 80; }
        h[i] = grout ? 0 : 0.6; ro[i] = grout ? 0.9 : rough + a[i] * 0.06;
      });
      var s = set(c, h, ro, 1, 3, n); s.map.repeat.set(1 / sw, 1 / sh); s.normalMap.repeat.set(1 / sw, 1 / sh); s.roughnessMap.repeat.set(1 / sw, 1 / sh);
      return s;
    }
    function get(k) { return cache[k] || (cache[k] = make[k]()); }

    /* Tapetes, cuadros, hojas y degradados (texturas UV 0–1) */
    var art = {};
    function rug(kind) {
      var k = 'rug' + kind; if (art[k]) return art[k];
      var n = 512, c = canvas(n), g = c.getContext('2d'), r = RNG(hashStr(k)), i;
      if (kind === 0) { // bereber crema con rombos grafito
        g.fillStyle = '#E8E1D4'; g.fillRect(0, 0, n, n); g.strokeStyle = 'rgba(40,40,44,.55)'; g.lineWidth = 3;
        for (i = -n; i < n * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + n / 2, n); g.stroke(); g.beginPath(); g.moveTo(i, n); g.lineTo(i + n / 2, 0); g.stroke(); }
      } else if (kind === 1) { // azul profundo con filete oro (manual de marca)
        g.fillStyle = '#1C2333'; g.fillRect(0, 0, n, n); g.strokeStyle = '#C9A445'; g.lineWidth = 7; g.strokeRect(34, 34, n - 68, n - 68); g.lineWidth = 2; g.strokeRect(52, 52, n - 104, n - 104);
      } else if (kind === 2) { // abstracto en tonos tierra
        g.fillStyle = '#CDBFA8'; g.fillRect(0, 0, n, n);
        for (i = 0; i < 9; i++) { g.fillStyle = ['rgba(176,120,86,.35)', 'rgba(90,82,74,.3)', 'rgba(240,232,220,.5)'][i % 3]; g.beginPath(); g.ellipse(r() * n, r() * n, 60 + r() * 160, 30 + r() * 90, r() * 3, 0, 7); g.fill(); }
      } else { // gris jaspeado
        g.fillStyle = '#9A9893'; g.fillRect(0, 0, n, n); for (i = 0; i < 3000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; g.fillRect(r() * n, r() * n, 2 + r() * 14, 2); }
      }
      // pelo del tapete
      var id = g.getImageData(0, 0, n, n), d = id.data; for (i = 0; i < d.length; i += 4) { var v = (r() - 0.5) * 22; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(id, 0, 0);
      return (art[k] = tex(c, true));
    }
    function painting(kind, seed) {
      var k = 'art' + kind + '-' + seed; if (art[k]) return art[k];
      var w = 512, h = 640, c = canvas(w, h), g = c.getContext('2d'), r = RNG(seed * 97 + kind), i;
      var pal = [['#1F2A44', '#C9A445', '#E9E4DA', '#8C6F5A'], ['#2F3B33', '#B8875C', '#EDE6DA', '#55606E'], ['#6E3B2E', '#D9B38C', '#F2EEE6', '#273042']][seed % 3];
      if (kind === 0) { // campos de color
        g.fillStyle = pal[2]; g.fillRect(0, 0, w, h);
        g.fillStyle = pal[0]; g.fillRect(40, 40, w - 80, h * 0.45); g.fillStyle = pal[3]; g.fillRect(40, h * 0.45 + 60, w - 80, h * 0.4);
        g.fillStyle = pal[1]; g.fillRect(40, h * 0.45 + 40, w - 80, 10);
      } else if (kind === 1) { // líneas y círculo oro
        g.fillStyle = pal[2]; g.fillRect(0, 0, w, h); g.strokeStyle = pal[0]; g.lineWidth = 3;
        for (i = 0; i < 7; i++) { g.beginPath(); g.moveTo(60, 120 + i * 60); g.bezierCurveTo(200, 60 + i * 70 + r() * 40, 320, 200 + i * 40, 460, 140 + i * 60); g.stroke(); }
        g.fillStyle = pal[1]; g.beginPath(); g.arc(w * 0.66, h * 0.3, 70, 0, 7); g.fill();
      } else if (kind === 2) { // paisaje al anochecer
        var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#273452'); gr.addColorStop(0.55, '#D59B6A'); gr.addColorStop(1, '#3A2C2A'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (i = 0; i < 4; i++) { g.fillStyle = ['#4A4E63', '#383C50', '#2A2D3C', '#1B1D27'][i]; g.beginPath(); g.moveTo(0, h); var y0 = h * (0.5 + i * 0.1); for (var x = 0; x <= w; x += 16) g.lineTo(x, y0 - Math.sin(x / 70 + i * 2 + r()) * 30 - r() * 14); g.lineTo(w, h); g.fill(); }
        g.fillStyle = '#F3D9A8'; g.beginPath(); g.arc(w * 0.7, h * 0.42, 26, 0, 7); g.fill();
      } else if (kind === 3) { // arcos (formas orgánicas)
        g.fillStyle = '#EFE8DC'; g.fillRect(0, 0, w, h);
        for (i = 0; i < 4; i++) { g.fillStyle = pal[i]; g.beginPath(); var cx = 120 + (i % 2) * 260, cy = 200 + Math.floor(i / 2) * 260; g.arc(cx, cy, 110, Math.PI, 0); g.lineTo(cx + 110, cy + 110); g.lineTo(cx - 110, cy + 110); g.fill(); }
      } else { // trazo de pincel
        g.fillStyle = '#F1EDE6'; g.fillRect(0, 0, w, h); g.lineCap = 'round';
        for (i = 0; i < 3; i++) { g.strokeStyle = [pal[0], pal[3], pal[1]][i]; g.lineWidth = 40 - i * 12; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(80 + r() * 60, 120 + i * 150); g.quadraticCurveTo(w / 2, 40 + i * 180 + r() * 80, w - 80, 160 + i * 140); g.stroke(); }
        g.globalAlpha = 1;
      }
      // textura de lienzo
      var id = g.getImageData(0, 0, w, h), d = id.data; for (i = 0; i < d.length; i += 4) { var v = ((i >> 2) % w % 3 === 0 ? -6 : 0) + (r() - 0.5) * 10; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(id, 0, 0);
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = aniso;
      return (art[k] = t);
    }
    function leaves(kind) {
      var k = 'leaf' + kind; if (art[k]) return art[k];
      var n = 256, c = canvas(n), g = c.getContext('2d'), r = RNG(kind * 31 + 7), i;
      var cnt = kind === 0 ? 5 : 16;
      for (i = 0; i < cnt; i++) {
        var x = n / 2 + (r() - 0.5) * n * (kind === 0 ? 0.35 : 0.7), y = n * (kind === 0 ? 0.25 + r() * 0.5 : 0.15 + r() * 0.7), a = (r() - 0.5) * 2.2, L = kind === 0 ? 70 + r() * 30 : 34 + r() * 16, Wd = kind === 0 ? 38 + r() * 12 : 9 + r() * 4;
        g.save(); g.translate(x, y); g.rotate(a);
        var gr = g.createLinearGradient(-Wd, 0, Wd, 0), base = kind === 0 ? [46 + r() * 20, 92 + r() * 30, 44] : [92 + r() * 20, 112 + r() * 20, 72];
        gr.addColorStop(0, 'rgb(' + (base[0] * 0.7 | 0) + ',' + (base[1] * 0.7 | 0) + ',' + (base[2] * 0.7 | 0) + ')'); gr.addColorStop(0.5, 'rgb(' + (base[0] | 0) + ',' + (base[1] | 0) + ',' + (base[2] | 0) + ')'); gr.addColorStop(1, 'rgb(' + (base[0] * 0.8 | 0) + ',' + (base[1] * 0.8 | 0) + ',' + (base[2] * 0.8 | 0) + ')');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, -L); g.quadraticCurveTo(Wd, -L * 0.2, 0, L * 0.6); g.quadraticCurveTo(-Wd, -L * 0.2, 0, -L); g.fill();
        g.strokeStyle = 'rgba(210,225,180,.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -L * 0.9); g.lineTo(0, L * 0.55); g.stroke();
        g.restore();
      }
      var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
      return (art[k] = t);
    }
    function grad(kind) { // 0: mancha radial (sombra de contacto) · 1: degradado vertical (oclusión en rincón)
      var k = 'grad' + kind; if (art[k]) return art[k];
      var n = 128, c = canvas(n), g = c.getContext('2d'), gr;
      if (kind === 0) { gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); }
      else { gr = g.createLinearGradient(0, n, 0, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.35, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); }
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
      return (art[k] = new T.CanvasTexture(c));
    }
    function sky(hora) {
      var c = canvas(16, 256), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      var st = hora === 'noche' ? [['#04060B', 0], ['#0B1222', 0.4], ['#1B2236', 0.5], ['#0A0D14', 0.53], ['#05070A', 1]]
        : hora === 'tarde' ? [['#2A3A5E', 0], ['#7C7393', 0.3], ['#EBAA7C', 0.46], ['#F8D6A4', 0.5], ['#6E6458', 0.53], ['#2E2C2A', 1]]
          : [['#4F8BCB', 0], ['#9CC2E8', 0.32], ['#E4EEF7', 0.49], ['#B9BCB4', 0.52], ['#6E736C', 1]];
      st.forEach(function (s) { gr.addColorStop(s[1], s[0]); }); g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
      var t = new T.CanvasTexture(c); t.mapping = T.EquirectangularReflectionMapping; t.colorSpace = T.SRGBColorSpace; return t;
    }
    TEXCACHE = { T: T, get: get, rug: rug, painting: painting, leaves: leaves, grad: grad, sky: sky };
    return TEXCACHE;
  }

  /* ================= Materiales ================= */
  function Materials(T, X) {
    var all = [], M = {};
    function reg(m, env) { m.userData.env = env == null ? 1 : env; all.push(m); return m; }
    function std(o, env) { return reg(new T.MeshStandardMaterial(o), env); }
    function phys(o, env) { return reg(new T.MeshPhysicalMaterial(o), env); }
    function tx(k) { return X.get(k); }
    var oak = tx('oak'), gr = tx('grain'), mb = tx('marble'), fb = tx('fabric'), pl = tx('plaster'), cn = tx('concrete');
    function wood(col, rough) { return std({ color: col, map: gr.map, normalMap: gr.normalMap, roughness: rough || 0.55, metalness: 0 }); }
    function fabric(col, sheen) { return phys({ color: col, map: fb.map, normalMap: fb.normalMap, normalScale: new T.Vector2(0.6, 0.6), roughness: 0.92, metalness: 0, sheen: sheen == null ? 0.6 : sheen, sheenRoughness: 0.6, sheenColor: new T.Color(col).lerp(new T.Color('#ffffff'), 0.35) }); }
    // Arquitectura
    M.floorWood = std({ map: oak.map, normalMap: oak.normalMap, roughnessMap: oak.roughnessMap, roughness: 1, metalness: 0 });
    M.floorTile = (function () { var t = tx('tileFloor'); return std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1 }); })();
    M.floorBath = (function () { var t = tx('tileBathFloor'); return std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1 }); })();
    M.wallBath = (function () { var t = tx('tileBath'); return std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1 }); })();
    M.backsplash = (function () { var t = tx('tileKitchen'); return std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, color: '#F4F1EA' }); })();
    M.concrete = std({ map: cn.map, normalMap: cn.normalMap, roughnessMap: cn.roughnessMap, roughness: 1 });
    M.grass = (function () { var t = tx('grass'); return std({ map: t.map, normalMap: t.normalMap, roughness: 0.95 }); })();
    M.deck = (function () { var t = tx('deck'); return std({ map: t.map, normalMap: t.normalMap, roughness: 0.75 }); })();
    M.paint = std({ color: '#EDE8E0', map: pl.map, normalMap: pl.normalMap, normalScale: new T.Vector2(0.12, 0.12), roughness: 0.9 });
    M.paintWarm = std({ color: '#DDD3C4', map: pl.map, normalMap: pl.normalMap, normalScale: new T.Vector2(0.12, 0.12), roughness: 0.9 });
    M.paintSage = std({ color: '#B9BFAE', map: pl.map, normalMap: pl.normalMap, normalScale: new T.Vector2(0.12, 0.12), roughness: 0.9 });
    M.paintNavy = std({ color: '#2A3346', map: pl.map, normalMap: pl.normalMap, normalScale: new T.Vector2(0.12, 0.12), roughness: 0.85 });
    M.facade = std({ color: '#E6E1D8', map: pl.map, normalMap: pl.normalMap, normalScale: new T.Vector2(0.3, 0.3), roughness: 0.92 });
    M.ceiling = std({ color: '#F6F4F0', roughness: 0.95 });
    M.trim = std({ color: '#F4F2EE', roughness: 0.45 });
    // Madera y lacas
    M.oak = wood('#D2AE84', 0.5); M.walnut = wood('#7A5539', 0.45); M.teak = wood('#A87B52', 0.6); M.ash = wood('#E2CDB0', 0.5);
    M.lacquer = std({ color: '#ECE8E1', roughness: 0.35 }); M.lacquerGreige = std({ color: '#B9AFA2', roughness: 0.4 }); M.lacquerNavy = std({ color: '#1E2638', roughness: 0.35 });
    // Piedra
    M.marble = std({ map: mb.map, normalMap: mb.normalMap, roughnessMap: mb.roughnessMap, roughness: 1 });
    M.quartz = std({ color: '#6F6D69', map: mb.map, roughness: 0.25 });
    M.travertine = std({ color: '#D9C9AE', map: cn.map, normalMap: cn.normalMap, roughness: 0.6 });
    // Metales
    M.brass = std({ color: '#C9A445', metalness: 1, roughness: 0.28 }, 2.2);
    M.brassIn = std({ color: '#C9A445', metalness: 1, roughness: 0.28, side: T.DoubleSide }, 2.2);
    M.black = std({ color: '#1A1B1E', metalness: 0.6, roughness: 0.45 });
    M.chrome = std({ color: '#E6E8EA', metalness: 1, roughness: 0.08 }, 2.4);
    M.steel = std({ color: '#C4C7CB', metalness: 0.85, roughness: 0.3 }, 2.6);
    M.alu = std({ color: '#2B2F36', metalness: 0.7, roughness: 0.4 });
    // Telas y piel
    M.linen = fabric('#CFC6B8', 0.4); M.velvetNavy = fabric('#243049', 1); M.boucle = fabric('#EAE5DC', 0.5); M.mustard = fabric('#C2913A', 0.8); M.terracotta = fabric('#A8583E', 0.7);
    M.sage = fabric('#8E9A84', 0.6); M.charcoal = fabric('#4A4C50', 0.6); M.bedWhite = fabric('#F4F2EE', 0.3); M.bedGreige = fabric('#C9BFB0', 0.4);
    M.leather = std({ color: '#8A5233', map: gr.map, roughness: 0.55 });
    M.curtain = phys({ color: '#EFEAE1', map: fb.map, normalMap: fb.normalMap, roughness: 0.95, side: T.DoubleSide, sheen: 0.4, sheenColor: new T.Color('#ffffff'), transparent: true, opacity: 0.94 });
    // Cerámica, vidrio, espejo
    M.ceramic = std({ color: '#F7F6F3', roughness: 0.12 }); M.ceramicMatte = std({ color: '#2B2B2D', roughness: 0.75 }); M.clay = std({ color: '#B98063', roughness: 0.8 }); M.stoneware = std({ color: '#D6CFC4', roughness: 0.7 });
    M.glass = phys({ color: '#E8F0F2', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.4 }, 1.6);
    M.glassDark = std({ color: '#151A20', roughness: 0.08, metalness: 0.3 });
    M.mirror = std({ color: '#D8DCDF', metalness: 1, roughness: 0.03 }, 2.6);
    M.screen = phys({ color: '#07080A', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
    M.carPaint = phys({ color: '#9AA2AE', metalness: 0.6, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06 }, 2);
    M.rubber = std({ color: '#151515', roughness: 0.9 });
    M.soil = std({ color: '#3A2C22', roughness: 1 });
    M.bark = std({ color: '#5A4636', map: gr.map, roughness: 0.9 });
    M.leafBig = std({ map: X.leaves(0), alphaTest: 0.5, side: T.DoubleSide, roughness: 0.6 });
    M.leafSmall = std({ map: X.leaves(1), alphaTest: 0.5, side: T.DoubleSide, roughness: 0.7 });
    M.hedge = std({ color: '#5F8048', roughness: 0.85 });
    M.books = ['#7E2E2A', '#1F2A44', '#C9A445', '#3F5A4A', '#D8CFC0', '#5B5F66', '#A8583E', '#EDE8E0'].map(function (c) { return std({ color: c, roughness: 0.7 }); });
    M.clothes = ['#EDEAE4', '#1F2A44', '#8C8F94', '#C9BFB0', '#2B2B2D', '#6E7F96', '#A8583E'].map(function (c) { return fabric(c, 0.3); });
    // Luz (emisivos): se ajustan según la hora
    M.glow = reg(new T.MeshStandardMaterial({ color: '#FFF3DC', emissive: '#FFD9A0', emissiveIntensity: 1.5, roughness: 1 }), 0); M.glow.userData.glow = 1;
    M.shade = reg(new T.MeshStandardMaterial({ color: '#F1E8D8', emissive: '#FFC98A', emissiveIntensity: 0.4, roughness: 0.9, side: T.DoubleSide }), 0.6); M.shade.userData.glow = 0.3;
    M.led = reg(new T.MeshStandardMaterial({ color: '#ffffff', emissive: '#FFE3BC', emissiveIntensity: 2, roughness: 1 }), 0); M.led.userData.glow = 1.3;
    M.tail = std({ color: '#5A0B0B', emissive: '#C0201A', emissiveIntensity: 0.6 });
    // Sombra de contacto y oclusión en rincones
    M.blob = new T.MeshBasicMaterial({ color: 0x000000, map: X.grad(0), transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    M.ao = new T.MeshBasicMaterial({ color: 0x000000, map: X.grad(1), transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    var rugs = {}, arts = {};
    M.rug = function (k) { return rugs[k] || (rugs[k] = std({ map: X.rug(k), normalMap: fb.normalMap, roughness: 0.95 })); };
    M.art = function (kind, seed) { var key = kind + '-' + seed; return arts[key] || (arts[key] = std({ map: X.painting(kind, seed), roughness: 0.8 })); };
    M.setLight = function (env, glow) {
      all.forEach(function (m) { if (m.userData.env != null) m.envMapIntensity = env * m.userData.env; if (m.userData.glow != null) m.emissiveIntensity = glow * m.userData.glow * (m === M.shade ? 1 : 1); });
      for (var k in rugs) rugs[k].envMapIntensity = env; for (k in arts) arts[k].envMapIntensity = env;
    };
    return M;
  }

  /* ================= Primitivas ================= */
  function Kit(T, M) {
    var gc = {};
    function key(a) { return a.map(function (v) { return typeof v === 'number' ? v.toFixed(3) : v; }).join(','); }
    function G(k, fn) { return gc[k] || (gc[k] = fn()); }
    function boxUV(geo, w, h, d) {
      var uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (var f = 0; f < 6; f++) for (var v = 0; v < 4; v++) { var i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
      return geo;
    }
    function mesh(g, geo, mat, x, y, z, o) {
      var m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
      if (o) { if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz; if (o.s) m.scale.set(o.s[0], o.s[1], o.s[2]); if (o.order) m.rotation.order = o.order; }
      m.castShadow = !(o && o.noShadow); m.receiveShadow = true; g.add(m); return m;
    }
    // y = base inferior de la pieza
    function box(g, w, h, d, mat, x, y, z, o) { return mesh(g, G(key(['b', w, h, d]), function () { return boxUV(new T.BoxGeometry(w, h, d), w, h, d); }), mat, x, (y || 0) + h / 2, z, o); }
    function rbox(g, w, h, d, r, mat, x, y, z, o) {
      var geo = G(key(['r', w, h, d, r]), function () {
        var b = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002), sw = w - 2 * b, sh = h - 2 * b, rc = Math.min(b * 0.6, sw / 2 - 0.001, sh / 2 - 0.001);
        var s = new T.Shape(), x0 = -sw / 2, y0 = -sh / 2;
        s.moveTo(x0 + rc, y0); s.lineTo(x0 + sw - rc, y0); s.quadraticCurveTo(x0 + sw, y0, x0 + sw, y0 + rc); s.lineTo(x0 + sw, y0 + sh - rc); s.quadraticCurveTo(x0 + sw, y0 + sh, x0 + sw - rc, y0 + sh);
        s.lineTo(x0 + rc, y0 + sh); s.quadraticCurveTo(x0, y0 + sh, x0, y0 + sh - rc); s.lineTo(x0, y0 + rc); s.quadraticCurveTo(x0, y0, x0 + rc, y0);
        var ge = new T.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 3 });
        ge.translate(0, 0, -(d - 2 * b) / 2); ge.computeVertexNormals(); return ge;
      });
      return mesh(g, geo, mat, x, (y || 0) + h / 2, z, o);
    }
    function cyl(g, rt, rb, h, mat, x, y, z, seg, o) { return mesh(g, G(key(['c', rt, rb, h, seg || 16, o && o.open ? 1 : 0]), function () { return new T.CylinderGeometry(rt, rb, h, seg || 16, 1, !!(o && o.open)); }), mat, x, (y || 0) + (o && (o.rx || o.rz) ? 0 : h / 2), z, o); }
    function sph(g, r, mat, x, y, z, o) { return mesh(g, G(key(['s', r, o && o.half ? 1 : 0]), function () { return o && o.half ? new T.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2) : new T.SphereGeometry(r, 18, 12); }), mat, x, y, z, o); }
    function lathe(g, k, pts, mat, x, y, z, o) { return mesh(g, G('l' + k, function () { return new T.LatheGeometry(pts.map(function (p) { return new T.Vector2(p[0], p[1]); }), 24); }), mat, x, y, z, o); }
    function plane(g, w, h, mat, x, y, z, o) { return mesh(g, G(key(['p', w, h, o && o.uvm ? 1 : 0]), function () { var p = new T.PlaneGeometry(w, h); if (o && o.uvm) { var uv = p.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h); } return p; }), mat, x, y, z, o); }
    function tube(g, pts, r, mat, o) { var c = new T.CatmullRomCurve3(pts.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); })); return mesh(g, new T.TubeGeometry(c, 24, r, 8, false), mat, 0, 0, 0, o); }
    function torus(g, r, t, mat, x, y, z, o) { return mesh(g, G(key(['t', r, t]), function () { return new T.TorusGeometry(r, t, 8, 24); }), mat, x, y, z, o); }
    return { box: box, rbox: rbox, cyl: cyl, sph: sph, lathe: lathe, plane: plane, tube: tube, torus: torus, G: G, boxUV: boxUV };
  }

  /* ================= Mobiliario (coordenadas locales: x a lo largo del muro, z hacia el espacio, y arriba;
     respaldo en z = 0, frente en z = d) ================= */
  function Furniture(T, M, K) {
    var box = K.box, rbox = K.rbox, cyl = K.cyl, sph = K.sph, lathe = K.lathe, plane = K.plane, tube = K.tube, torus = K.torus;
    function grp() { return new T.Group(); }
    var F = {};
    F.sofa = function (w, mat, acc) {
      var g = grp(), d = 0.95, a = 0.2, lh = 0.1, n = w > 2.2 ? 3 : 2, cw = (w - 2 * a) / n, i;
      [[-1, 0.1], [1, 0.1], [-1, d - 0.1], [1, d - 0.1]].forEach(function (p) { cyl(g, 0.02, 0.016, lh, M.brass, p[0] * (w / 2 - 0.1), 0, p[1], 8); });
      rbox(g, w, 0.22, d, 0.04, mat, 0, lh, d / 2);
      rbox(g, a, 0.36, d, 0.08, mat, -w / 2 + a / 2, lh + 0.16, d / 2); rbox(g, a, 0.36, d, 0.08, mat, w / 2 - a / 2, lh + 0.16, d / 2);
      rbox(g, w - 2 * a + 0.04, 0.5, 0.2, 0.06, mat, 0, lh + 0.16, 0.1);
      for (i = 0; i < n; i++) {
        var x = -w / 2 + a + cw * (i + 0.5);
        rbox(g, cw - 0.012, 0.16, d - 0.27, 0.06, mat, x, lh + 0.2, 0.25 + (d - 0.27) / 2);
        rbox(g, cw - 0.03, 0.44, 0.2, 0.09, mat, x, lh + 0.36, 0.3, { rx: -0.14 });
      }
      rbox(g, 0.46, 0.44, 0.14, 0.07, acc || M.mustard, -w / 2 + a + 0.32, lh + 0.38, 0.44, { rx: -0.28, rz: 0.12 });
      rbox(g, 0.46, 0.44, 0.14, 0.07, M.boucle, w / 2 - a - 0.32, lh + 0.38, 0.44, { rx: -0.28, rz: -0.1 });
      if (w > 2.2) rbox(g, 0.42, 0.4, 0.13, 0.07, acc || M.mustard, w / 2 - a - 0.72, lh + 0.38, 0.46, { rx: -0.3, rz: 0.06 });
      return g;
    };
    F.armchair = function (mat) {
      var g = grp(), w = 0.82, d = 0.82;
      [[-1, 0.1], [1, 0.1], [-1, d - 0.1], [1, d - 0.1]].forEach(function (p) { cyl(g, 0.018, 0.014, 0.12, M.walnut, p[0] * (w / 2 - 0.08), 0, p[1], 8); });
      rbox(g, w, 0.2, d, 0.05, mat, 0, 0.12, d / 2);
      rbox(g, 0.14, 0.32, d, 0.07, mat, -w / 2 + 0.07, 0.3, d / 2); rbox(g, 0.14, 0.32, d, 0.07, mat, w / 2 - 0.07, 0.3, d / 2);
      rbox(g, w, 0.5, 0.16, 0.07, mat, 0, 0.3, 0.08, { rx: -0.08 });
      rbox(g, w - 0.28, 0.14, d - 0.2, 0.06, mat, 0, 0.3, 0.12 + (d - 0.2) / 2);
      return g;
    };
    F.coffeeTable = function (w, d) {
      var g = grp();
      rbox(g, w, 0.04, d, 0.015, M.marble, 0, 0.34, d / 2);
      box(g, 0.08, 0.34, d - 0.14, M.walnut, -w / 2 + 0.16, 0, d / 2); box(g, 0.08, 0.34, d - 0.14, M.walnut, w / 2 - 0.16, 0, d / 2);
      box(g, 0.3, 0.03, 0.22, M.books[1], -w * 0.2, 0.38, d * 0.45, { ry: 0.2 }); box(g, 0.26, 0.03, 0.2, M.books[4], -w * 0.2, 0.41, d * 0.45, { ry: 0.05 });
      lathe(g, 'bowl', [[0, 0], [0.12, 0.005], [0.16, 0.06], [0.15, 0.065], [0.11, 0.015], [0, 0.012]], M.stoneware, w * 0.2, 0.38, d * 0.5);
      sph(g, 0.035, M.brass, w * 0.2, 0.42, d * 0.5);
      return g;
    };
    F.sideTable = function () {
      var g = grp();
      cyl(g, 0.24, 0.24, 0.03, M.travertine, 0, 0.52, 0.25, 32); cyl(g, 0.06, 0.09, 0.52, M.travertine, 0, 0, 0.25, 20);
      return g;
    };
    F.tableLamp = function (g, x, y, z) {
      lathe(g, 'lampbase', [[0, 0], [0.07, 0], [0.11, 0.08], [0.1, 0.2], [0.04, 0.3], [0.015, 0.34], [0, 0.34]], M.ceramicMatte, x, y, z);
      cyl(g, 0.15, 0.19, 0.22, M.shade, x, y + 0.32, z, 24, { open: true, noShadow: true });
      sph(g, 0.04, M.glow, x, y + 0.42, z, { noShadow: true });
    };
    F.floorLamp = function () {
      var g = grp();
      cyl(g, 0.17, 0.17, 0.05, M.marble, 0, 0, 0.2, 28);
      tube(g, [[0, 0.05, 0.2], [0, 1.2, 0.2], [0, 1.85, 0.5], [0, 1.95, 0.95], [0, 1.82, 1.35]], 0.012, M.brass);
      sph(g, 0.17, M.brassIn, 0, 1.68, 1.35, { half: true });
      sph(g, 0.05, M.glow, 0, 1.7, 1.35, { noShadow: true });
      return g;
    };
    F.tv = function (g, w, cy) {
      var h = w * 0.5625; box(g, w, h, 0.03, M.screen, 0, cy - h / 2, 0.03);
      box(g, w * 0.2, 0.01, 0.02, M.black, 0, cy - h / 2 - 0.012, 0.05);
    };
    F.console = function (w) {
      var g = grp(), h = 0.48, d = 0.42, i;
      rbox(g, w, h, d, 0.01, M.walnut, 0, 0.12, d / 2);
      for (i = 0; i < Math.floor(w / 0.045); i++) cyl(g, 0.012, 0.012, h - 0.06, M.walnut, -w / 2 + 0.03 + i * 0.045, 0.15, d + 0.002, 10);
      [-1, 1].forEach(function (s) { box(g, 0.03, 0.12, 0.03, M.brass, s * (w / 2 - 0.1), 0, 0.08); box(g, 0.03, 0.12, 0.03, M.brass, s * (w / 2 - 0.1), 0, d - 0.08); });
      lathe(g, 'vase1', [[0, 0], [0.06, 0], [0.09, 0.1], [0.07, 0.22], [0.035, 0.3], [0.04, 0.34], [0, 0.34]], M.ceramic, w / 2 - 0.25, 0.6, d / 2);
      box(g, 0.3, 0.08, 0.22, M.books[0], -w / 2 + 0.3, 0.6, d / 2); box(g, 0.26, 0.05, 0.2, M.books[6], -w / 2 + 0.3, 0.68, d / 2, { ry: 0.15 });
      sph(g, 0.07, M.brass, -w / 2 + 0.3, 0.8, d / 2);
      return g;
    };
    F.slats = function (g, w, h) {
      box(g, w, h, 0.012, M.charcoal, 0, 0, 0.006, { noShadow: true });
      for (var i = 0; i < Math.floor(w / 0.07); i++) box(g, 0.035, h, 0.03, M.oak, -w / 2 + 0.035 + i * 0.07, 0, 0.027, { noShadow: true });
    };
    F.rug = function (w, d, k) { var g = grp(); K.box(g, w, 0.012, d, M.rug(k), 0, 0.013, d / 2, { noShadow: true }); fixRugUV(g.children[0]); return g; };
    function fixRugUV(m) { // UV 0–1 en la cara superior
      var geo = m.geometry.clone(), uv = geo.attributes.uv, f = 2; for (var v = 0; v < 4; v++) { var j = f * 4 + v; uv.setXY(j, v % 2, v < 2 ? 1 : 0); }
      m.geometry = geo;
    }
    F.painting = function (w, h, kind, seed, frame) {
      var g = grp(), fr = frame || M.black, b = 0.03;
      box(g, w, h, 0.035, fr, 0, 0, 0.0175, { noShadow: true });
      plane(g, w - 2 * b, h - 2 * b, M.trim, 0, h / 2, 0.036, { noShadow: true });
      plane(g, w - 2 * b - (w > 0.8 ? 0.12 : 0.08), h - 2 * b - (w > 0.8 ? 0.12 : 0.08), M.art(kind, seed), 0, h / 2, 0.037, { noShadow: true });
      return g;
    };
    F.plant = function (tall, seed) {
      var g = grp(), r = RNG(seed || 3), i;
      lathe(g, 'pot' + (tall ? 1 : 0), tall ? [[0, 0], [0.17, 0], [0.2, 0.05], [0.21, 0.42], [0.19, 0.44], [0, 0.4]] : [[0, 0], [0.12, 0], [0.16, 0.25], [0.15, 0.27], [0, 0.24]], tall ? M.ceramicMatte : M.clay, 0, 0, 0.25);
      var top = tall ? 0.4 : 0.24;
      if (tall) {
        cyl(g, 0.018, 0.025, 0.9, M.bark, 0, top, 0.25, 8);
        for (i = 0; i < 9; i++) { var a = r() * 6.28, hh = top + 0.75 + r() * 0.75, rr = 0.05 + r() * 0.2; plane(g, 0.55, 0.55, M.leafBig, Math.cos(a) * rr, hh, 0.25 + Math.sin(a) * rr, { ry: a, rx: (r() - 0.5) * 0.8, noShadow: false }); }
      } else {
        for (i = 0; i < 7; i++) { var b = r() * 6.28; plane(g, 0.42, 0.42, M.leafBig, Math.cos(b) * 0.06, top + 0.18 + r() * 0.15, 0.25 + Math.sin(b) * 0.06, { ry: b, rx: -0.5 - r() * 0.4, order: 'YXZ' }); }
      }
      return g;
    };
    F.bookshelf = function (w, h, seed) {
      var g = grp(), d = 0.36, r = RNG(seed || 7), sh = Math.max(3, Math.floor((h - 0.1) / 0.38)), i, s;
      box(g, 0.03, h, d, M.oak, -w / 2 + 0.015, 0, d / 2); box(g, 0.03, h, d, M.oak, w / 2 - 0.015, 0, d / 2); box(g, w, 0.01, d, M.oak, 0, 0, 0.005);
      for (s = 0; s <= sh; s++) {
        var y = 0.06 + s * (h - 0.1) / sh; box(g, w - 0.06, 0.025, d, M.oak, 0, y, d / 2);
        if (s === sh) continue;
        var x = -w / 2 + 0.06;
        while (x < w / 2 - 0.12) {
          if (r() < 0.22) { // objeto decorativo
            if (r() < 0.5) lathe(g, 'vase2', [[0, 0], [0.05, 0], [0.07, 0.08], [0.04, 0.18], [0.045, 0.2], [0, 0.2]], r() < 0.5 ? M.ceramic : M.ceramicMatte, x + 0.08, y + 0.025, d / 2);
            else sph(g, 0.06, M.brass, x + 0.08, y + 0.085, d / 2);
            x += 0.2; continue;
          }
          var nb = 3 + Math.floor(r() * 7), lean = r() < 0.2;
          for (i = 0; i < nb && x < w / 2 - 0.08; i++) { var bw = 0.022 + r() * 0.025, bh = 0.2 + r() * 0.1; box(g, bw, bh, 0.2 + r() * 0.06, M.books[Math.floor(r() * 8)], x + bw / 2, y + 0.025, d / 2, lean && i === nb - 1 ? { rz: -0.2 } : null); x += bw + 0.002; }
          x += 0.04 + r() * 0.1;
        }
      }
      return g;
    };
    F.diningTable = function (w, d) {
      var g = grp();
      rbox(g, w, 0.045, d, 0.012, M.oak, 0, 0.73, d / 2);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { box(g, 0.07, 0.73, 0.07, M.walnut, p[0] * (w / 2 - 0.12), 0, d / 2 + p[1] * (d / 2 - 0.12)); });
      lathe(g, 'vase3', [[0, 0], [0.06, 0], [0.08, 0.12], [0.05, 0.24], [0.06, 0.28], [0, 0.28]], M.stoneware, 0, 0.775, d / 2);
      for (var i = 0; i < 5; i++) plane(g, 0.25, 0.32, M.leafSmall, (i - 2) * 0.03, 1.05, d / 2, { ry: i * 0.7, noShadow: true });
      return g;
    };
    F.chair = function (mat) {
      var g = grp();
      [[-1, 0.06], [1, 0.06], [-1, 0.42], [1, 0.42]].forEach(function (p) { cyl(g, 0.014, 0.012, 0.45, M.black, p[0] * 0.19, 0, p[1], 8); });
      rbox(g, 0.47, 0.07, 0.46, 0.03, mat, 0, 0.45, 0.24);
      rbox(g, 0.45, 0.4, 0.06, 0.03, mat, 0, 0.5, 0.03, { rx: -0.1 });
      return g;
    };
    F.pendant = function (g, x, y, z, kind) {
      if (kind === 'linear') {
        box(g, 1.3, 0.04, 0.06, M.brass, x, y - 0.9, z, { noShadow: true });
        [-0.45, 0, 0.45].forEach(function (o) { sph(g, 0.1, M.glow, x + o, y - 1.0, z, { noShadow: true }); });
        cyl(g, 0.003, 0.003, 0.86, M.black, x - 0.5, y - 0.86, z, 4, { noShadow: true }); cyl(g, 0.003, 0.003, 0.86, M.black, x + 0.5, y - 0.86, z, 4, { noShadow: true });
      } else if (kind === 'dome') {
        cyl(g, 0.004, 0.004, 0.7, M.black, x, y - 0.7, z, 4, { noShadow: true });
        sph(g, 0.2, M.brassIn, x, y - 0.92, z, { half: true, noShadow: true }); sph(g, 0.05, M.glow, x, y - 0.9, z, { noShadow: true });
      } else {
        cyl(g, 0.004, 0.004, 0.75, M.black, x, y - 0.75, z, 4, { noShadow: true }); sph(g, 0.13, M.glow, x, y - 0.88, z, { noShadow: true });
      }
    };
    F.sideboard = function (w) {
      var g = grp(), d = 0.45, i, n = Math.max(2, Math.round(w / 0.5));
      rbox(g, w, 0.62, d, 0.01, M.walnut, 0, 0.16, d / 2);
      for (i = 1; i < n; i++) box(g, 0.004, 0.58, 0.004, M.black, -w / 2 + i * w / n, 0.18, d + 0.001, { noShadow: true });
      for (i = 0; i < n; i++) box(g, 0.12, 0.012, 0.015, M.brass, -w / 2 + (i + 0.5) * w / n, 0.62, d + 0.008, { noShadow: true });
      [-1, 1].forEach(function (s) { cyl(g, 0.015, 0.012, 0.16, M.brass, s * (w / 2 - 0.08), 0, 0.08, 8); cyl(g, 0.015, 0.012, 0.16, M.brass, s * (w / 2 - 0.08), 0, d - 0.08, 8); });
      F.tableLamp(g, -w / 2 + 0.3, 0.78, d / 2);
      lathe(g, 'vase4', [[0, 0], [0.08, 0], [0.12, 0.15], [0.06, 0.32], [0.05, 0.42], [0, 0.42]], M.clay, w / 2 - 0.3, 0.78, d / 2);
      tube(g, [[w / 2 - 0.3, 1.15, d / 2], [w / 2 - 0.36, 1.45, d / 2 - 0.05], [w / 2 - 0.5, 1.7, d / 2 - 0.1]], 0.006, M.bark);
      return g;
    };
    /* ---- Cocina ---- */
    F.kitchenRun = function (L, H, opts) {
      opts = opts || {};
      var g = grp(), d = 0.6, i, n = Math.max(1, Math.round(L / 0.6)), dw = L / n, front = opts.front || M.lacquer;
      box(g, L, 0.1, d - 0.08, M.black, 0, 0, (d - 0.08) / 2, { noShadow: true });
      box(g, L, 0.76, d - 0.02, M.lacquer, 0, 0.1, (d - 0.02) / 2);
      for (i = 0; i < n; i++) {
        var x = -L / 2 + (i + 0.5) * dw;
        box(g, dw - 0.006, 0.74, 0.02, front, x, 0.11, d - 0.01, { noShadow: true });
        box(g, Math.min(0.3, dw * 0.5), 0.012, 0.02, M.brass, x, 0.8, d + 0.008, { noShadow: true });
      }
      rbox(g, L + 0.02, 0.03, d + 0.02, 0.004, opts.top || M.marble, 0, 0.86, (d + 0.02) / 2);
      // salpicadero
      box(g, L, Math.max(0.5, Math.min(0.62, H - 1.5)), 0.012, opts.splash || M.backsplash, 0, 0.89, 0.006, { noShadow: true });
      // tira LED bajo alacenas
      return g;
    };
    F.upper = function (g, x0, x1, H, front) {
      var L = x1 - x0; if (L < 0.35) return;
      var n = Math.max(1, Math.round(L / 0.5)), dw = L / n, top = Math.min(H - 0.02, 2.35), h = top - 1.5;
      box(g, L, h, 0.35, M.lacquer, (x0 + x1) / 2, 1.5, 0.175); box(g, L - 0.06, 0.01, 0.02, M.led, (x0 + x1) / 2, 1.49, 0.3, { noShadow: true });
      for (var i = 0; i < n; i++) { var x = x0 + (i + 0.5) * dw; box(g, dw - 0.006, h - 0.01, 0.018, front || M.lacquer, x, 1.505, 0.359, { noShadow: true }); }
    };
    F.fridge = function (H) {
      var g = grp(), h = Math.min(2.1, H - 0.1);
      box(g, 0.9, h, 0.66, M.steel, 0, 0, 0.33);
      box(g, 0.004, h - 0.1, 0.004, M.black, 0, 0.05, 0.662, { noShadow: true });
      box(g, 0.02, 0.7, 0.03, M.chrome, -0.04, 0.9, 0.68); box(g, 0.02, 0.7, 0.03, M.chrome, 0.04, 0.9, 0.68);
      if (h < H - 0.2) box(g, 0.92, H - h, 0.6, M.lacquer, 0, h, 0.3);
      return g;
    };
    F.cooktop = function (g, x, top) {
      box(g, 0.62, 0.006, 0.52, M.glassDark, x, top, 0.32, { noShadow: true });
      [[-0.15, -0.12, 0.09], [0.15, -0.12, 0.07], [-0.15, 0.12, 0.07], [0.15, 0.12, 0.1]].forEach(function (b) { torus(g, b[2], 0.004, M.steel, x + b[0], top + 0.008, 0.32 + b[1], { rx: Math.PI / 2, noShadow: true }); });
      box(g, 0.58, 0.5, 0.02, M.glassDark, x, 0.25, 0.605, { noShadow: true }); box(g, 0.5, 0.015, 0.025, M.steel, x, 0.68, 0.62, { noShadow: true });
    };
    F.hood = function (g, x, H) {
      box(g, 0.9, 0.12, 0.5, M.steel, x, 1.65, 0.25); box(g, 0.3, H - 1.77, 0.28, M.steel, x, 1.77, 0.14);
    };
    F.sink = function (g, x, top) {
      box(g, 0.62, 0.006, 0.44, M.steel, x, top - 0.002, 0.3, { noShadow: true }); box(g, 0.54, 0.004, 0.36, M.black, x, top + 0.002, 0.3, { noShadow: true });
      cyl(g, 0.02, 0.025, 0.06, M.chrome, x, top, 0.08, 12);
      tube(g, [[x, top + 0.05, 0.08], [x, top + 0.36, 0.08], [x, top + 0.42, 0.18], [x, top + 0.3, 0.27]], 0.011, M.chrome);
    };
    F.island = function (L, d) {
      var g = grp();
      box(g, L - 0.04, 0.88, d - 0.1, M.lacquerNavy, 0, 0, d / 2);
      box(g, 0.03, 0.9, d, M.marble, -L / 2 + 0.015, 0, d / 2); box(g, 0.03, 0.9, d, M.marble, L / 2 - 0.015, 0, d / 2);
      box(g, L, 0.03, d, M.marble, 0, 0.9, d / 2);
      lathe(g, 'bowl2', [[0, 0], [0.1, 0.005], [0.17, 0.07], [0.16, 0.075], [0.09, 0.015], [0, 0.012]], M.walnut, -L * 0.2, 0.93, d / 2);
      [[-0.05, 0.03], [0.04, -0.02], [0.0, 0.05]].forEach(function (o) { sph(g, 0.04, M.mustard, -L * 0.2 + o[0], 0.98, d / 2 + o[1]); });
      return g;
    };
    F.stool = function () {
      var g = grp();
      cyl(g, 0.19, 0.19, 0.05, M.leather, 0, 0.66, 0.2, 20); cyl(g, 0.02, 0.02, 0.66, M.black, 0, 0, 0.2, 8); cyl(g, 0.17, 0.17, 0.015, M.black, 0, 0, 0.2, 20); torus(g, 0.15, 0.008, M.black, 0, 0.3, 0.2, { rx: Math.PI / 2 });
      return g;
    };
    /* ---- Recámaras ---- */
    F.bed = function (w, l, acc) {
      var g = grp(), i, hb = 1.2;
      rbox(g, w + 0.12, 0.3, l, 0.03, M.linen, 0, 0.04, l / 2);
      rbox(g, w, 0.24, l - 0.06, 0.06, M.bedWhite, 0, 0.3, (l - 0.06) / 2 + 0.03);
      rbox(g, w + 0.08, 0.1, l * 0.74, 0.05, M.bedGreige, 0, 0.5, l - l * 0.37);
      rbox(g, w + 0.1, 0.05, 0.5, 0.025, acc || M.velvetNavy, 0, 0.6, l - 0.42);
      var np = w > 1.5 ? 2 : 1, pw = (w - 0.1) / np;
      for (i = 0; i < np; i++) { rbox(g, pw - 0.06, 0.4, 0.16, 0.08, M.bedWhite, -w / 2 + 0.05 + pw * (i + 0.5), 0.52, 0.2, { rx: -0.35 }); rbox(g, pw - 0.16, 0.34, 0.14, 0.07, M.bedWhite, -w / 2 + 0.05 + pw * (i + 0.5), 0.52, 0.36, { rx: -0.3 }); }
      rbox(g, 0.42, 0.34, 0.12, 0.06, acc || M.velvetNavy, 0, 0.56, 0.5, { rx: -0.3 });
      // cabecera tapizada en canales
      var ns = Math.round((w + 0.5) / 0.2), sw = (w + 0.5) / ns;
      for (i = 0; i < ns; i++) rbox(g, sw - 0.008, hb, 0.08, 0.035, M.linen, -(w + 0.5) / 2 + sw * (i + 0.5), 0.04, 0.04);
      return g;
    };
    F.nightstand = function (lamp) {
      var g = grp();
      rbox(g, 0.48, 0.42, 0.4, 0.01, M.walnut, 0, 0.14, 0.2); box(g, 0.46, 0.004, 0.004, M.black, 0, 0.36, 0.401, { noShadow: true });
      box(g, 0.12, 0.012, 0.015, M.brass, 0, 0.44, 0.405, { noShadow: true });
      [-1, 1].forEach(function (s) { cyl(g, 0.012, 0.01, 0.14, M.brass, s * 0.19, 0, 0.06, 8); cyl(g, 0.012, 0.01, 0.14, M.brass, s * 0.19, 0, 0.34, 8); });
      if (lamp) F.tableLamp(g, 0.05, 0.56, 0.2);
      box(g, 0.14, 0.025, 0.2, M.books[2], -0.12, 0.56, 0.2, { ry: 0.3 });
      return g;
    };
    F.wardrobe = function (L, H, front) {
      var g = grp(), h = Math.min(H - 0.02, 2.6), d = 0.6, n = Math.max(1, Math.round(L / 0.55)), dw = L / n, i;
      box(g, L, h, d - 0.02, M.lacquer, 0, 0, (d - 0.02) / 2);
      for (i = 0; i < n; i++) {
        var x = -L / 2 + (i + 0.5) * dw; box(g, dw - 0.006, h - 0.1, 0.02, front || M.ash, x, 0.08, d - 0.01, { noShadow: true });
        box(g, 0.012, 0.6, 0.025, M.brass, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), 0.85, d + 0.012, { noShadow: true });
      }
      box(g, L, 0.08, 0.02, M.black, 0, 0, d - 0.03, { noShadow: true });
      return g;
    };
    F.openCloset = function (L, H, seed) {
      var g = grp(), h = Math.min(H - 0.02, 2.5), d = 0.55, r = RNG(seed || 5), i, n = Math.max(1, Math.round(L / 0.9)), sw = L / n;
      box(g, L, h, 0.02, M.walnut, 0, 0, 0.01);
      for (i = 0; i <= n; i++) box(g, 0.025, h, d, M.walnut, -L / 2 + i * sw + (i === 0 ? 0.0125 : i === n ? -0.0125 : 0), 0, d / 2);
      box(g, L, 0.025, d, M.walnut, 0, h - 0.025, d / 2);
      for (i = 0; i < n; i++) {
        var x0 = -L / 2 + i * sw + 0.03, x1 = x0 + sw - 0.06, mode = i % 3;
        if (mode === 2) { // cajones y zapatos
          for (var k = 0; k < 3; k++) box(g, sw - 0.06, 0.22, 0.02, M.lacquerGreige, (x0 + x1) / 2, 0.05 + k * 0.24, d - 0.02, { noShadow: true });
          for (k = 0; k < 4; k++) { box(g, sw - 0.06, 0.02, d - 0.04, M.walnut, (x0 + x1) / 2, 0.85 + k * 0.32, d / 2); for (var s = 0; s < 3; s++) rbox(g, 0.1, 0.08, 0.26, 0.03, M.clothes[Math.floor(r() * 7)], x0 + 0.1 + s * (sw - 0.2) / 2.2, 0.87 + k * 0.32, d / 2 + 0.05); }
        } else {
          box(g, sw - 0.06, 0.02, d - 0.04, M.walnut, (x0 + x1) / 2, h - 0.38, d / 2);
          cyl(g, 0.01, 0.01, sw - 0.06, M.brass, (x0 + x1) / 2, h - 0.5, d / 2, 8, { rz: Math.PI / 2 });
          for (var x = x0 + 0.05; x < x1 - 0.03; x += 0.045 + r() * 0.03) { var lh = mode ? 1.0 + r() * 0.15 : 0.6 + r() * 0.2; box(g, 0.025, lh, 0.42 + r() * 0.06, M.clothes[Math.floor(r() * 7)], x, h - 0.52 - lh, d / 2); }
          box(g, sw - 0.06, 0.02, d - 0.04, M.walnut, (x0 + x1) / 2, 0.25, d / 2);
          for (k = 0; k < 2; k++) rbox(g, (sw - 0.12) / 2, 0.18, 0.32, 0.03, M.lacquerGreige, x0 + 0.03 + (k + 0.5) * (sw - 0.08) / 2, 0.27, d / 2);
        }
      }
      return g;
    };
    F.dresser = function (w) {
      var g = grp(), d = 0.48, i, j;
      rbox(g, w, 0.72, d, 0.01, M.oak, 0, 0.1, d / 2);
      for (i = 0; i < 3; i++) for (j = 0; j < 2; j++) { box(g, w / 2 - 0.02, 0.22, 0.012, M.oak, (j - 0.5) * w / 2, 0.13 + i * 0.23, d + 0.003, { noShadow: true }); box(g, 0.1, 0.012, 0.015, M.brass, (j - 0.5) * w / 2, 0.24 + i * 0.23, d + 0.012, { noShadow: true }); }
      [-1, 1].forEach(function (s) { box(g, 0.04, 0.1, 0.04, M.black, s * (w / 2 - 0.06), 0, 0.06); box(g, 0.04, 0.1, 0.04, M.black, s * (w / 2 - 0.06), 0, d - 0.06); });
      lathe(g, 'vase1', [[0, 0], [0.06, 0], [0.09, 0.1], [0.07, 0.22], [0.035, 0.3], [0.04, 0.34], [0, 0.34]], M.ceramicMatte, w / 2 - 0.2, 0.82, d / 2);
      box(g, 0.24, 0.05, 0.18, M.books[3], -w / 2 + 0.25, 0.82, d / 2);
      return g;
    };
    F.roundMirror = function (g, r, y) { cyl(g, r + 0.02, r + 0.02, 0.02, M.brass, 0, y, 0.01, 40, { rx: Math.PI / 2, noShadow: true }); cyl(g, r, r, 0.022, M.mirror, 0, y, 0.012, 40, { rx: Math.PI / 2, noShadow: true }); };
    F.bench = function (w) { var g = grp(); rbox(g, w, 0.12, 0.42, 0.04, M.velvetNavy, 0, 0.32, 0.21); [-1, 1].forEach(function (s) { box(g, 0.03, 0.32, 0.38, M.brass, s * (w / 2 - 0.06), 0, 0.21); }); return g; };
    F.desk = function (w) {
      var g = grp(), d = 0.65;
      box(g, w, 0.03, d, M.oak, 0, 0.73, d / 2);
      [-1, 1].forEach(function (s) { box(g, 0.03, 0.73, d - 0.06, M.black, s * (w / 2 - 0.05), 0, d / 2); });
      box(g, 0.34, 0.012, 0.24, M.alu, -0.1, 0.76, d / 2 + 0.05); box(g, 0.34, 0.22, 0.008, M.alu, -0.1, 0.77, d / 2 - 0.07, { rx: -0.25 });
      box(g, 0.32, 0.2, 0.004, M.screen, -0.1, 0.775, d / 2 - 0.065, { rx: -0.25, noShadow: true });
      F.tableLamp(g, w / 2 - 0.2, 0.76, 0.2);
      box(g, 0.2, 0.04, 0.26, M.books[1], w / 2 - 0.45, 0.76, 0.2, { ry: 0.2 });
      return g;
    };
    F.officeChair = function () {
      var g = grp();
      for (var i = 0; i < 5; i++) { var a = i * Math.PI * 2 / 5; box(g, 0.03, 0.03, 0.3, M.black, Math.sin(a) * 0.13, 0.04, 0.3 + Math.cos(a) * 0.13, { ry: a }); }
      cyl(g, 0.025, 0.025, 0.4, M.chrome, 0, 0.05, 0.3, 10); rbox(g, 0.5, 0.08, 0.48, 0.03, M.charcoal, 0, 0.45, 0.3); rbox(g, 0.46, 0.5, 0.06, 0.03, M.charcoal, 0, 0.55, 0.05, { rx: -0.12 });
      return g;
    };
    /* ---- Baños ---- */
    F.vanity = function (w, H) {
      var g = grp(), d = 0.5, n = w >= 1.3 ? 2 : 1, i;
      rbox(g, w, 0.42, d, 0.01, M.walnut, 0, 0.42, d / 2); box(g, w - 0.04, 0.004, 0.004, M.black, 0, 0.62, d + 0.001, { noShadow: true });
      box(g, w + 0.02, 0.03, d + 0.02, M.marble, 0, 0.84, (d + 0.02) / 2);
      for (i = 0; i < n; i++) {
        var x = n === 1 ? 0 : (i - 0.5) * w / 2;
        lathe(g, 'vessel', [[0, 0], [0.12, 0], [0.19, 0.04], [0.21, 0.13], [0.2, 0.135], [0.18, 0.045], [0.1, 0.02], [0, 0.02]], M.ceramic, x, 0.87, d / 2 + 0.04);
        cyl(g, 0.018, 0.022, 0.08, M.brass, x, 0.87, 0.08, 12); tube(g, [[x, 0.94, 0.08], [x, 1.12, 0.08], [x, 1.14, 0.18], [x, 1.07, 0.24]], 0.01, M.brass);
        var mw = Math.min(0.8, w / n - 0.15);
        box(g, mw + 0.04, 0.94, 0.02, M.led, x, 1.18, 0.01, { noShadow: true }); rbox(g, mw, 0.9, 0.03, 0.06, M.mirror, x, 1.2, 0.035, { noShadow: true });
      }
      cyl(g, 0.03, 0.03, 0.16, M.ceramicMatte, w / 2 - 0.12, 0.87, 0.15, 12); cyl(g, 0.025, 0.025, 0.12, M.ceramic, w / 2 - 0.2, 0.87, 0.12, 12);
      rbox(g, 0.28, 0.06, 0.2, 0.03, M.bedWhite, -w / 2 + 0.18, 0.87, 0.14); rbox(g, 0.26, 0.06, 0.18, 0.03, M.bedGreige, -w / 2 + 0.18, 0.93, 0.14);
      return g;
    };
    F.toilet = function () {
      var g = grp();
      rbox(g, 0.5, 0.95, 0.16, 0.02, M.wallBathAlt || M.lacquer, 0, 0, 0.08);
      box(g, 0.2, 0.13, 0.01, M.chrome, 0, 0.98, 0.16, { noShadow: true });
      rbox(g, 0.37, 0.32, 0.54, 0.13, M.ceramic, 0, 0.12, 0.16 + 0.27);
      rbox(g, 0.36, 0.03, 0.5, 0.12, M.ceramic, 0, 0.44, 0.16 + 0.26);
      return g;
    };
    F.shower = function (g, w, d, H) { // espacio de regadera de w × d en la esquina (local)
      box(g, 0.01, 2.0, d - 0.02, M.glass, 0, 0, d / 2, { noShadow: true });
      box(g, 0.02, 0.02, d, M.black, 0, 2.0, d / 2, { noShadow: true }); box(g, 0.02, 2.0, 0.02, M.black, 0, 0, d - 0.01, { noShadow: true });
      cyl(g, 0.15, 0.15, 0.012, M.chrome, w / 2, Math.min(2.2, H - 0.25), 0.4, 24); cyl(g, 0.01, 0.01, 0.4, M.chrome, w / 2, Math.min(2.21, H - 0.24), 0.2, 8, { rx: Math.PI / 2 });
      cyl(g, 0.04, 0.04, 0.02, M.chrome, w / 2, 1.05, 0.01, 16, { rx: Math.PI / 2 });
      box(g, w - 0.2, 0.004, 0.06, M.steel, w / 2, 0.001, d - 0.2, { noShadow: true });
      box(g, 0.5, 0.7, 0.03, M.bedWhite, -0.4, 0.9, 0.04);
      cyl(g, 0.008, 0.008, 0.6, M.brass, -0.4, 1.62, 0.05, 8, { rz: Math.PI / 2 });
    };
    F.tub = function () {
      var g = grp();
      lathe(g, 'tub', [[0, 0.02], [0.3, 0.02], [0.37, 0.12], [0.4, 0.5], [0.39, 0.56], [0.36, 0.56], [0.35, 0.45], [0.3, 0.16], [0, 0.13]], M.ceramic, 0, 0, 0.42, { s: [2.05, 1, 1] });
      tube(g, [[0.95, 0, 0.42], [0.95, 0.85, 0.42], [0.95, 0.95, 0.42], [0.82, 0.92, 0.42]], 0.015, M.brass);
      return g;
    };
    /* ---- Servicio ---- */
    F.washer = function (stack) {
      var g = grp();
      [0, stack ? 0.86 : -1].forEach(function (y, i) {
        if (y < 0) return;
        rbox(g, 0.6, 0.84, 0.6, 0.02, M.lacquer, 0, y, 0.3); box(g, 0.56, 0.08, 0.01, M.alu, 0, y + 0.72, 0.605, { noShadow: true });
        torus(g, 0.17, 0.02, M.chrome, 0, y + 0.38, 0.61); cyl(g, 0.16, 0.16, 0.02, M.glassDark, 0, y + 0.38, 0.6, 24, { rx: Math.PI / 2, noShadow: true });
      });
      return g;
    };
    F.shelves = function (w, h, seed) {
      var g = grp(), r = RNG(seed || 1), i;
      [-1, 1].forEach(function (s) { box(g, 0.025, h, 0.35, M.black, s * (w / 2 - 0.0125), 0, 0.175); });
      for (i = 0; i < 4; i++) {
        var y = 0.2 + i * (h - 0.3) / 3; box(g, w, 0.02, 0.35, M.oak, 0, y, 0.175);
        for (var x = -w / 2 + 0.15; x < w / 2 - 0.12; x += 0.3) { if (r() < 0.35) continue; if (r() < 0.5) rbox(g, 0.26, 0.2, 0.3, 0.02, M.linen, x, y + 0.02, 0.17); else { cyl(g, 0.05, 0.05, 0.22, M.books[Math.floor(r() * 8)], x - 0.05, y + 0.02, 0.15, 10); cyl(g, 0.045, 0.045, 0.18, M.ceramic, x + 0.07, y + 0.02, 0.15, 10); } }
      }
      return g;
    };
    F.car = function () {
      var g = grp();
      rbox(g, 1.82, 0.62, 4.5, 0.26, M.carPaint, 0, 0.3, 2.25);
      rbox(g, 1.6, 0.5, 2.4, 0.22, M.glassDark, 0, 0.82, 2.45);
      [[-1, 0.8], [1, 0.8], [-1, 3.7], [1, 3.7]].forEach(function (p) { cyl(g, 0.34, 0.34, 0.24, M.rubber, p[0] * 0.8, 0.34, p[1], 24, { rz: Math.PI / 2 }); cyl(g, 0.21, 0.21, 0.25, M.steel, p[0] * 0.8, 0.34, p[1], 16, { rz: Math.PI / 2 }); });
      box(g, 1.5, 0.05, 0.02, M.led, 0, 0.72, 4.5, { noShadow: true }); box(g, 1.6, 0.06, 0.02, M.tail, 0, 0.78, 0.0, { noShadow: true });
      return g;
    };
    /* ---- Exterior ---- */
    F.lounger = function () {
      var g = grp();
      box(g, 0.7, 0.06, 1.9, M.teak, 0, 0.25, 0.95); [[-1, 0.1], [1, 0.1], [-1, 1.8], [1, 1.8]].forEach(function (p) { box(g, 0.05, 0.25, 0.05, M.teak, p[0] * 0.3, 0, p[1]); });
      rbox(g, 0.66, 0.08, 1.3, 0.03, M.boucle, 0, 0.31, 1.2); rbox(g, 0.66, 0.08, 0.6, 0.03, M.boucle, 0, 0.4, 0.3, { rx: 0.7 });
      return g;
    };
    F.outdoorSet = function () {
      var g = grp();
      box(g, 2.0, 0.3, 0.85, M.teak, 0, 0.05, 0.42); rbox(g, 1.9, 0.14, 0.75, 0.04, M.boucle, 0, 0.35, 0.45); rbox(g, 1.9, 0.4, 0.16, 0.05, M.boucle, 0, 0.4, 0.1);
      rbox(g, 0.4, 0.36, 0.12, 0.05, M.terracotta, -0.6, 0.48, 0.25, { rx: -0.25 }); rbox(g, 0.4, 0.36, 0.12, 0.05, M.sage, 0.6, 0.48, 0.25, { rx: -0.25 });
      cyl(g, 0.4, 0.4, 0.04, M.travertine, 0, 0.36, 1.55, 28); cyl(g, 0.3, 0.34, 0.36, M.travertine, 0, 0, 1.55, 28);
      return g;
    };
    F.tree = function (h, seed) {
      var g = grp(), r = RNG(seed || 2);
      cyl(g, 0.06, 0.1, h * 0.55, M.bark, 0, 0, 0, 8);
      for (var i = 0; i < 7; i++) { var a = r() * 6.28, rr = r() * h * 0.18; mesh(g, K.G('ico' + i, function () { return new T.IcosahedronGeometry(1, 1); }), M.hedge, Math.cos(a) * rr, h * (0.6 + r() * 0.3), Math.sin(a) * rr, h * (0.16 + r() * 0.08)); }
      return g;
    };
    function mesh(g, geo, mat, x, y, z, s) { var m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.scale.setScalar(s); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; }
    F.planter = function (w, d) {
      var g = grp(), r = RNG(w * 100 | 0);
      box(g, w, 0.45, d, M.concrete, 0, 0, d / 2); box(g, w - 0.08, 0.02, d - 0.08, M.soil, 0, 0.43, d / 2, { noShadow: true });
      for (var x = -w / 2 + 0.25; x < w / 2 - 0.1; x += 0.35) mesh(g, K.G('ico0', function () { return new T.IcosahedronGeometry(1, 1); }), M.hedge, x, 0.62, d / 2, 0.24 + r() * 0.08);
      return g;
    };
    return F;
  }

  /* ================= Modelo del nivel a partir de la planta ================= */
  var NAME = { 'Lav.': 'Lavado', '½ B': 'Medio baño', 'Rec. 1': 'Recámara principal' };
  function niceName(n) { return NAME[n] || String(n).replace(/^Rec\. (\d+)$/, 'Recámara $1'); }
  function buildModel(levels, hs, type) {
    return levels.map(function (lv, li) {
      var rooms = [], id = 0;
      lv.cells.forEach(function (c) {
        if (c.sub && c.sub.length) c.sub.forEach(function (s) { rooms.push({ id: id++, n: niceName(s.n), unit: c.n, k: s.k, x: s.x, y: s.y, w: s.w, h: s.h }); });
        else rooms.push({ id: id++, n: c.n, k: c.k, x: c.x, y: c.y, w: c.w, h: c.h, cars: c.cars });
      });
      rooms.forEach(function (r) { r.ext = r.k === 'ext'; r.area = r.w * r.h; r.label = r.unit ? r.unit + ' · ' + r.n : r.n; });
      return { index: li, rooms: rooms, H: hs[li], Hc: Math.max(2.4, hs[li] - (type === 'bodega' && li === 0 ? 0.6 : 0.28)), base: hs.slice(0, li).reduce(function (a, b) { return a + b; }, 0) };
    });
  }
  // Aristas compartidas entre espacios (y con el exterior)
  function edgesOf(rooms) {
    var edges = [], EPS = 0.03;
    rooms.forEach(function (A) {
      var sides = [
        { axis: 'x', c: A.y, a0: A.x, a1: A.x + A.w, out: -1 }, { axis: 'x', c: A.y + A.h, a0: A.x, a1: A.x + A.w, out: 1 },
        { axis: 'z', c: A.x, a0: A.y, a1: A.y + A.h, out: -1 }, { axis: 'z', c: A.x + A.w, a0: A.y, a1: A.y + A.h, out: 1 }];
      sides.forEach(function (sd) {
        var segs = [];
        rooms.forEach(function (B) {
          if (B === A) return;
          var bc = sd.axis === 'x' ? (sd.out > 0 ? B.y : B.y + B.h) : (sd.out > 0 ? B.x : B.x + B.w);
          if (Math.abs(bc - sd.c) > EPS) return;
          var b0 = sd.axis === 'x' ? B.x : B.y, b1 = b0 + (sd.axis === 'x' ? B.w : B.h), lo = Math.max(sd.a0, b0), hi = Math.min(sd.a1, b1);
          if (hi - lo > 0.05) segs.push({ lo: lo, hi: hi, B: B });
        });
        segs.sort(function (a, b) { return a.lo - b.lo; });
        var cur = sd.a0, all = [];
        segs.forEach(function (s) { if (s.lo - cur > 0.05) all.push({ lo: cur, hi: s.lo, B: null }); all.push(s); cur = Math.max(cur, s.hi); });
        if (sd.a1 - cur > 0.05) all.push({ lo: cur, hi: sd.a1, B: null });
        all.forEach(function (s) { if (s.B && s.B.id < A.id) return; edges.push({ axis: sd.axis, c: sd.c, lo: s.lo, hi: s.hi, A: A, B: s.B, out: sd.out, open: [] }); });
      });
    });
    return edges;
  }
  function other(e, R) { return e.A === R ? e.B : e.A; }
  function isInt(R) { return R && !R.ext; }
  // Puertas y vanos: árbol de recorrido desde el acceso; jardines con cancel corredizo
  function planOpenings(L, D, li) {
    var rooms = L.rooms, edges = L.edges, ints = rooms.filter(isInt);
    function shared(e) { return e.hi - e.lo; }
    function isKitchen(R) { return /Cocina/.test(R.n); }
    function isOpen(a, b) { if ((a.unit || b.unit) && a.unit !== b.unit) return false; return (a.k === 'soc' && b.k === 'soc' && !/Estudio|usos/.test(a.n + b.n)) || ((a.k === 'soc' && isKitchen(b)) || (b.k === 'soc' && isKitchen(a))) || ((a.k === 'circ' && b.k === 'soc' && !/Escalera/.test(a.n)) || (b.k === 'circ' && a.k === 'soc' && !/Escalera/.test(b.n))); }
    function cost(from, to, e) {
      var c = 10 - Math.min(shared(e), 4) * 0.5;
      if (from.k === 'bano') c += 200; if (from.k === 'coch') c += 25; if (from.k === 'serv' && !isKitchen(from)) c += 18;
      if (from.k === 'rec') c += /Vestidor/.test(to.n) || to.k === 'bano' ? -4 : 60;
      if (/Vestidor/.test(from.n)) c += to.k === 'bano' ? 0 : 80;
      if (to.k === 'bano') c += from.k === 'rec' ? (/principal/i.test(to.n) && /principal/i.test(from.n) ? -12 : 2) : from.k === 'circ' ? 0 : 6;
      if (/Vestidor/.test(to.n)) c += /principal/i.test(from.n) ? -15 : 40;
      if (to.k === 'rec' && !/Vestidor/.test(to.n)) c += from.k === 'circ' ? -4 : from.k === 'soc' ? 2 : 30;
      if (isOpen(from, to)) c -= 6;
      if (from.unit && to.unit && from.unit !== to.unit) c += 400;
      return c;
    }
    // acceso
    var start = null;
    if (li === 0) {
      var front = ints.filter(function (R) { return R.k !== 'coch' && edges.some(function (e) { return (e.A === R || e.B === R) && e.axis === 'x' && Math.abs(e.c - (R.y + R.h)) < 0.03 && (!other(e, R) || other(e, R).ext); }); });
      start = front.filter(function (R) { return R.k === 'soc' || R.k === 'circ'; })[0] || front[0];
    } else start = ints.filter(function (R) { return /Escalera/.test(R.n); })[0];
    start = start || ints.filter(function (R) { return R.k === 'circ'; })[0] || ints[0];
    if (!start) return;
    var reached = {}; reached[start.id] = true; start.depth = 0; L.start = start;
    var tree = [];
    for (;;) {
      var best = null, bc = Infinity;
      edges.forEach(function (e) {
        if (!isInt(e.A) || !isInt(e.B) || shared(e) < 0.95) return;
        var a = reached[e.A.id], b = reached[e.B.id]; if (!!a === !!b) return;
        var from = a ? e.A : e.B, to = a ? e.B : e.A, c = cost(from, to, e);
        if (c < bc) { bc = c; best = { e: e, from: from, to: to }; }
      });
      if (!best) break;
      reached[best.to.id] = true; best.to.parent = best.from; tree.push(best);
    }
    tree.forEach(function (t) {
      var e = t.e, len = shared(e);
      if (isOpen(t.from, t.to)) {
        var full = t.from.k === 'soc' && t.to.k === 'soc' && !(t.from.unit || t.to.unit);
        var w = full ? len : Math.min(len - 0.3, 3.2), lo = (e.lo + e.hi) / 2 - w / 2;
        e.open.push({ lo: lo, hi: lo + w, y0: 0, y1: full ? 99 : 2.4, kind: full ? 'none' : 'open' });
      } else {
        var dw = 0.9, pos = len < 2.2 ? (e.lo + e.hi) / 2 : e.lo + 0.2 + dw / 2;
        e.open.push({ lo: pos - dw / 2, hi: pos + dw / 2, y0: 0, y1: 2.15, kind: 'door', into: t.to });
      }
    });
    L.reached = reached;
    // Jardín / terraza: cancel corredizo desde el mejor espacio interior
    rooms.filter(function (R) { return R.ext; }).forEach(function (X) {
      var best = null, bs = -1;
      edges.forEach(function (e) {
        if (!(e.A === X || e.B === X)) return; var R = other(e, X); if (!isInt(R) || shared(e) < 1.6) return;
        var s = { soc: 5, rec: 3, circ: 2, ofi: 2, com: 2 }[R.k] || (isKitchen(R) ? 3 : 0); s += Math.min(shared(e), 4) * 0.3;
        if (s > bs && s >= 1.2) { bs = s; best = e; }
      });
      if (best) { var w = Math.min(shared(best) - 0.5, 3.2), m = (best.lo + best.hi) / 2; best.open.push({ lo: m - w / 2, hi: m + w / 2, y0: 0, y1: 2.4, kind: 'slide' }); X.reachable = true; }
    });
    // Acceso principal
    if (li === 0) {
      var en = null;
      edges.forEach(function (e) { if ((e.A === start || e.B === start) && !isInt(other(e, start)) && e.axis === 'x' && Math.abs(e.c - (start.y + start.h)) < 0.03 && !e.open.length && (!en || shared(e) > shared(en))) en = e; });
      if (!en) edges.forEach(function (e) { if ((e.A === start || e.B === start) && !isInt(other(e, start)) && !e.open.length && (!en || shared(e) > shared(en))) en = e; });
      if (en) { var ew = Math.min(1.2, shared(en) - 0.3), em = (en.lo + en.hi) / 2; en.open.push({ lo: em - ew / 2, hi: em + ew / 2, y0: 0, y1: 2.4, kind: 'entry' }); L.entry = en; }
    }
    // Portón de cochera hacia la calle
    rooms.filter(function (R) { return R.k === 'coch'; }).forEach(function (R) {
      var e = edges.filter(function (e) { return (e.A === R || e.B === R) && !isInt(other(e, R)) && e.axis === 'x' && Math.abs(e.c - (R.y + R.h)) < 0.03 && !e.open.length; }).sort(function (a, b) { return shared(b) - shared(a); })[0];
      if (!e) return; var w = Math.min(shared(e) - 0.6, (R.cars || 1) * 2.8), m = (e.lo + e.hi) / 2; if (w < 2.2) return;
      e.open.push({ lo: m - w / 2, hi: m + w / 2, y0: 0, y1: 2.4, kind: 'gdoor' });
    });
    // Ventanas en muros a exterior
    edges.forEach(function (e) {
      var R = isInt(e.A) && !isInt(e.B) ? e.A : isInt(e.B) && !isInt(e.A) ? e.B : null; if (!R || e.open.length) return;
      var hab = /soc|rec|ofi|com|depto/.test(R.k) || isKitchen(R) || /Escalera|Vestíbulo/.test(R.n), bano = R.k === 'bano';
      if (!(hab || bano) || /Vestidor/.test(R.n)) return;
      var len = shared(e); if (len < 1.1) return;
      if (bano) { var bw = Math.min(1.0, len * 0.5), bm = (e.lo + e.hi) / 2; e.open.push({ lo: bm - bw / 2, hi: bm + bw / 2, y0: 1.6, y1: 2.2, kind: 'win' }); return; }
      var n = len > 5 ? 2 : 1, ww = n === 1 ? Math.min(len * 0.62, 2.4) : Math.min((len - 1.4) / 2, 2.2), sill = isKitchen(R) ? 1.05 : R.k === 'soc' ? 0.45 : 0.9;
      for (var i = 0; i < n; i++) { var mm = e.lo + len * (i + 0.5) / n; e.open.push({ lo: mm - ww / 2, hi: mm + ww / 2, y0: sill, y1: 2.3, kind: 'win' }); }
    });
  }
  // Lados de un espacio (para amueblar): puertas, ventanas y si hay muro
  function sidesOf(R, edges) {
    var S = { N: { line: R.y, a0: R.x, a1: R.x + R.w, wall: [], doors: [], wins: [] }, S: { line: R.y + R.h, a0: R.x, a1: R.x + R.w, wall: [], doors: [], wins: [] }, W: { line: R.x, a0: R.y, a1: R.y + R.h, wall: [], doors: [], wins: [] }, E: { line: R.x + R.w, a0: R.y, a1: R.y + R.h, wall: [], doors: [], wins: [] } };
    edges.forEach(function (e) {
      if (e.A !== R && e.B !== R) return;
      var s = e.axis === 'x' ? (Math.abs(e.c - R.y) < 0.03 ? 'N' : 'S') : (Math.abs(e.c - R.x) < 0.03 ? 'W' : 'E'), o = other(e, R);
      var walled = !(R.ext && (!o || o.ext));
      if (walled) S[s].wall.push([e.lo, e.hi]);
      e.open.forEach(function (op) { if (op.kind === 'win') S[s].wins.push([op.lo, op.hi, op.y0]); else if (op.kind !== 'gdoor') S[s].doors.push([op.lo, op.hi]); });
      if (!walled) S[s].doors.push([e.lo, e.hi]);
    });
    return S;
  }

  /* ================= Escena ================= */
  function create(canvas, opts) {
    var T = global.THREE; opts = opts || {};
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, MOBILE ? 1.5 : 1.75));
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(70, 16 / 9, 0.05, 400);
    var X = Textures(T, renderer), M = Materials(T, X), K = Kit(T, M), F = Furniture(T, M, K);
    // Entorno para reflejos (habitación con ventanales y luminarias)
    var pmrem = new T.PMREMGenerator(renderer);
    scene.environment = (function () {
      var env = new T.Scene(), room = new T.Mesh(new T.BoxGeometry(12, 6, 12), new T.MeshStandardMaterial({ color: '#B8ADA0', side: T.BackSide, roughness: 1 }));
      room.position.y = 3; env.add(room);
      var fl = new T.Mesh(new T.PlaneGeometry(12, 12), new T.MeshStandardMaterial({ color: '#8A6E52', roughness: 1 })); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.01; env.add(fl);
      function panel(w, h, x, y, z, ry, k, col) { var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(col || '#ffffff').multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; env.add(m); }
      panel(5, 3, 0, 2.6, -5.95, 0, 6, '#EAF2FF'); panel(4, 3, 5.95, 2.6, 0, -Math.PI / 2, 4, '#EAF2FF');
      [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, 0]].forEach(function (p) { var m = new T.Mesh(new T.CircleGeometry(0.5, 16), new T.MeshBasicMaterial({ color: new T.Color('#FFE2B8').multiplyScalar(14) })); m.rotation.x = Math.PI / 2; m.position.set(p[0], 5.95, p[1]); env.add(m); });
      env.add(new T.AmbientLight('#ffffff', 1.2));
      var tex = pmrem.fromScene(env, 0.035).texture; return tex;
    })();
    var hemi = new T.HemisphereLight('#E8EEF5', '#9C8468', 0.5); scene.add(hemi);
    var sun = new T.DirectionalLight('#FFF1DC', 2.6); sun.castShadow = true; sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; scene.add(sun); scene.add(sun.target);
    var NL = MOBILE ? 4 : 6, pool = [];
    for (var i = 0; i < NL; i++) { var pl = new T.PointLight('#FFD8A8', 0, 0, 2); pl.userData = { room: null, cur: 0, want: 0 }; scene.add(pl); pool.push(pl); }
    var outdoor = new T.Group(); scene.add(outdoor);
    var levelGroup = null, model = null, L = null, li = 0, hora = 'tarde', W = 10, D = 20;
    var floors = [], picks = [], solids = [], blockers = [], lightSpots = [], furn = [];
    var pos = new T.Vector3(), yaw = 0, pitch = -0.05, eye = 1.6, keys = {}, path = null, tour = null, dirty = true, running = false, raf = 0, lastT = 0, curRoom = null;
    var ring = new T.Mesh(new T.RingGeometry(0.16, 0.22, 32), new T.MeshBasicMaterial({ color: '#D4AF37', transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
    var ringT = 0;

    /* ---------- Exterior (terreno, árboles) ---------- */
    function buildOutdoor() {
      while (outdoor.children.length) outdoor.remove(outdoor.children[0]);
      var gnd = new T.Mesh(new T.PlaneGeometry(160, 160), M.grass); gnd.rotation.x = -Math.PI / 2; gnd.position.set(W / 2, -0.03, D / 2); gnd.receiveShadow = true;
      var uv = gnd.geometry.attributes.uv; for (var k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 160, uv.getY(k) * 160); outdoor.add(gnd);
      var road = new T.Mesh(new T.PlaneGeometry(160, 9), M.concrete); road.rotation.x = -Math.PI / 2; road.position.set(W / 2, -0.02, D + 9); road.receiveShadow = true;
      uv = road.geometry.attributes.uv; for (k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 160, uv.getY(k) * 9); outdoor.add(road);
      var r = RNG(17);
      for (k = 0; k < 16; k++) {
        var a = k / 16 * Math.PI * 2, rr = Math.max(W, D) * 0.7 + 6 + r() * 10, t = F.tree(5 + r() * 4, k + 3);
        t.position.set(W / 2 + Math.cos(a) * rr, 0, D / 2 + Math.sin(a) * rr * 1.1); outdoor.add(t);
      }
      // vecinos (volúmenes simples)
      [[-12, 0.5, 7, 6.5, D * 0.8], [W + 5, 0.5, 7, 6.5, D * 0.8], [W / 2 - 8, -16, 16, 7, 6]].forEach(function (b) { var m = new T.Mesh(new T.BoxGeometry(b[2], b[3], b[4]), M.facade); m.position.set(b[0] + b[2] / 2, b[3] / 2, b[1] + (b[1] < 0 ? 0 : b[4] / 2)); m.receiveShadow = true; outdoor.add(m); });
    }

    /* ---------- Construcción de un nivel ---------- */
    function floorMat(R) {
      if (R.ext) return null;
      if (R.k === 'bano') return M.floorBath;
      if (R.k === 'coch' || R.k === 'alm' || (R.k === 'serv' && !/Cocina/.test(R.n))) return /Lav|Patio/.test(R.n) ? M.floorBath : M.concrete;
      if (/Cocina|Vestíbulo|Pasillo|Escalera|Sanitarios/.test(R.n) || R.k === 'com' || R.k === 'circ') return M.floorTile;
      return M.floorWood;
    }
    function wallMat(R, s) {
      if (!R || R.ext) return M.facade;
      if (R.k === 'bano') return M.wallBath;
      if (R.k === 'coch' || R.k === 'alm') return M.paint;
      var h = hashStr(R.label + s);
      if (R.k === 'rec' && !/Vestidor/.test(R.n)) return h % 3 === 0 ? M.paintSage : M.paintWarm;
      if (/Estudio/.test(R.n)) return M.paintNavy;
      return h % 5 === 0 ? M.paintWarm : M.paint;
    }
    function buildLevel(index) {
      if (levelGroup) { scene.remove(levelGroup); levelGroup.traverse(function (o) { if (o.isMesh && o.userData.merged) o.geometry.dispose(); }); }
      li = index; L = model[li];
      if (!L.edges) { L.edges = edgesOf(L.rooms); planOpenings(L, D, li); }
      var g = new T.Group(), Hc = L.Hc, Hl = L.H, raw = new T.Group(), pick = new T.Group();
      floors = []; picks = []; solids = []; blockers = []; furn = []; lightSpots = [];
      var ext = L.rooms.filter(function (R) { return R.ext; }), ints = L.rooms.filter(isInt);
      // Pisos y plafones
      L.rooms.forEach(function (R) {
        var fm = floorMat(R), y = 0;
        if (R.ext) fm = li === 0 ? M.grass : M.deck;
        var f = K.plane(pick, R.w, R.h, fm, R.x + R.w / 2, y + (R.ext ? 0.004 : 0.012), R.y + R.h / 2, { rx: -Math.PI / 2, uvm: true, noShadow: true });
        f.userData.room = R; floors.push(f);
        if (!R.ext) {
          K.plane(raw, R.w, R.h, M.ceiling, R.x + R.w / 2, Hc, R.y + R.h / 2, { rx: Math.PI / 2, uvm: true });
          K.box(raw, R.w, Hl - Hc, R.h, M.facade, R.x + R.w / 2, Hc + 0.002, R.y + R.h / 2);
          // luminarias empotradas
          var nx = Math.max(1, Math.round(R.w / 1.6)), nz = Math.max(1, Math.round(R.h / 1.6));
          if (R.k !== 'bano' || R.area > 3) for (var a = 0; a < nx; a++) for (var b = 0; b < nz; b++) {
            var px = R.x + R.w * (a + 0.5) / nx, pz = R.y + R.h * (b + 0.5) / nz;
            K.cyl(raw, 0.06, 0.06, 0.008, M.led, px, Hc - 0.007, pz, 16, { noShadow: true }); K.torus(raw, 0.066, 0.006, M.steel, px, Hc - 0.004, pz, { rx: Math.PI / 2, noShadow: true });
          }
          lightSpots.push({ x: R.x + R.w / 2, z: R.y + R.h / 2, R: R, d: Math.sqrt(R.w * R.w + R.h * R.h) });
        }
      });
      // Muros, vanos, carpintería
      L.edges.forEach(function (e) { wallsForEdge(e, raw, pick, Hc, Hl); });
      // Mobiliario
      L.rooms.forEach(function (R) { try { furnish(R, raw, Hc); } catch (err) { if (global.console) console.warn('Recorrido: no se pudo amueblar', R.label, err); } });
      // Escalera
      L.rooms.forEach(function (R) { if (/Escalera/.test(R.n)) stairs(R, raw, Hc, Hl); });
      // Unir geometría por material (pocas llamadas de dibujo)
      merge(raw, g); merge(pick, g, true);
      floors.forEach(function (f) { f.parent.remove(f); g.add(f); });
      g.position.y = L.base; levelGroup = g; scene.add(g);
      // sombras sólo cubren el nivel
      updateSun(); renderer.shadowMap.needsUpdate = true; dirty = true;
      if (opts.onLevel) opts.onLevel(L);
    }
    function merge(src, dst, pickable) {
      src.updateMatrixWorld(true);
      var buckets = {}, order = [];
      src.traverse(function (o) {
        if (!o.isMesh || o.userData.room) return;
        var k = o.material.uuid + (o.castShadow ? 's' : 'n');
        if (!buckets[k]) { buckets[k] = { mat: o.material, cast: o.castShadow, items: [] }; order.push(k); }
        buckets[k].items.push(o);
      });
      var ni = new T.Matrix3();
      order.forEach(function (k) {
        var bk = buckets[k], n = 0;
        var geos = bk.items.map(function (o) { var gg = o.geometry; if (gg.index) { gg.userData.ni = gg.userData.ni || gg.toNonIndexed(); gg = gg.userData.ni; } n += gg.attributes.position.count; return gg; });
        var P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), off = 0, v = new T.Vector3();
        bk.items.forEach(function (o, j) {
          var gg = geos[j], p = gg.attributes.position, nn = gg.attributes.normal, uv = gg.attributes.uv, m = o.matrixWorld; ni.getNormalMatrix(m);
          for (var q = 0; q < p.count; q++) {
            v.fromBufferAttribute(p, q).applyMatrix4(m); P[(off + q) * 3] = v.x; P[(off + q) * 3 + 1] = v.y; P[(off + q) * 3 + 2] = v.z;
            if (nn) { v.fromBufferAttribute(nn, q).applyMatrix3(ni).normalize(); N[(off + q) * 3] = v.x; N[(off + q) * 3 + 1] = v.y; N[(off + q) * 3 + 2] = v.z; }
            if (uv) { U[(off + q) * 2] = uv.getX(q); U[(off + q) * 2 + 1] = uv.getY(q); }
          }
          off += p.count;
        });
        var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(P, 3)); geo.setAttribute('normal', new T.BufferAttribute(N, 3)); geo.setAttribute('uv', new T.BufferAttribute(U, 2));
        geo.computeBoundingSphere(); geo.computeBoundingBox();
        var mesh = new T.Mesh(geo, bk.mat); mesh.castShadow = bk.cast;
        if (bk.mat.alphaTest > 0 && bk.cast) mesh.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: bk.mat.map, alphaTest: bk.mat.alphaTest }); mesh.receiveShadow = !bk.mat.transparent; mesh.userData.merged = true; dst.add(mesh);
        if (pickable && !bk.mat.transparent) picks.push(mesh);
      });
    }
    // Un tramo de muro (mitad del espesor del lado de cada espacio) con huecos
    function wallsForEdge(e, raw, pick, Hc, Hl) {
      var A = e.A, B = e.B, intA = isInt(A), intB = isInt(B), ti = 0.075, to = 0.12;
      // muros perimetrales en jardín o barandal en terraza
      if (!intA && !intB) {
        if (B) return; // jardín con jardín
        var fence = li === 0 ? (Math.abs(e.c - D) < 0.05 && e.axis === 'x' ? 1.1 : 1.9) : 1.0;
        piece(pick, e, e.lo, e.hi, 0, fence, e.out * 0.1, 0.2, li === 0 ? M.facade : M.glass);
        if (li > 0) piece(raw, e, e.lo, e.hi, fence, fence + 0.04, e.out * 0.1, 0.06, M.black);
        else if (fence > 1.5) for (var t = e.lo + 0.6; t < e.hi - 0.3; t += 0.9) { var hx = e.axis === 'x' ? t : e.c - e.out * 0.45, hz = e.axis === 'x' ? e.c - e.out * 0.45 : t; var hm = new T.Mesh(K.G('ico0', function () { return new T.IcosahedronGeometry(1, 1); }), M.hedge); hm.position.set(hx, 0.6, hz); hm.scale.set(0.55, 0.8, 0.55); hm.castShadow = hm.receiveShadow = true; raw.add(hm); }
        solids.push(seg(e, e.lo, e.hi, 0.2));
        return;
      }
      var holes = e.open.slice().sort(function (a, b) { return a.lo - b.lo; });
      [A, B].forEach(function (R, side) {
        var inward = side === 0 ? -e.out : e.out, isI = isInt(R);
        var H = isI ? Hc : Hl, th = isI ? ti : to, mat = isI ? wallMat(R, e.axis + e.c) : M.facade, off = inward * th / 2;
        var cur = e.lo - (isI ? 0 : to), end = e.hi + (isI ? 0 : to);
        holes.forEach(function (h) {
          if (h.kind === 'none') { piece(pick, e, cur, h.lo, 0, H, off, th, mat); cur = h.hi; return; }
          piece(pick, e, cur, h.lo, 0, H, off, th, mat);
          if (h.y0 > 0) piece(pick, e, h.lo, h.hi, 0, h.y0, off, th, mat);
          if (h.y1 < H) piece(pick, e, h.lo, h.hi, Math.min(h.y1, H), H, off, th, mat);
          cur = h.hi;
        });
        piece(pick, e, cur, end, 0, H, off, th, mat);
        if (!isI) return;
        // zoclo y oclusión en rincones (piso y plafón)
        var face = inward * (th + 0.006), c2 = e.lo, c3 = e.lo;
        holes.concat([{ lo: e.hi, hi: e.hi, y0: 0, kind: 'end' }]).forEach(function (h) {
          if (h.y0 === 0) {
            if (h.lo - c2 > 0.05) { piece(raw, e, c2, h.lo, 0, 0.09, face, 0.012, M.trim, true); aoStrip(raw, e, c2, h.lo, inward * (th + 0.008), inward, 0, 0.3); }
            c2 = h.hi;
          }
          if (h.kind === 'none' || h.kind === 'end') { if (h.lo - c3 > 0.05) aoStrip(raw, e, c3, h.lo, inward * (th + 0.008), inward, Hc, -0.26); c3 = h.hi; }
        });
      });
      // Colisión
      var cur2 = e.lo, sol = [];
      holes.forEach(function (h) { if (h.y0 < 0.3 && h.kind !== 'gdoor') { if (h.lo > cur2) sol.push([cur2, h.lo]); cur2 = h.hi; } });
      if (e.hi > cur2) sol.push([cur2, e.hi]);
      sol.forEach(function (s) { solids.push(seg(e, s[0], s[1], 0.15)); });
      holes.forEach(function (h) { joinery(raw, e, h, Hc); });
    }
    function seg(e, a, b, th) { return e.axis === 'x' ? { x0: a, z0: e.c, x1: b, z1: e.c, t: th / 2 } : { x0: e.c, z0: a, x1: e.c, z1: b, t: th / 2 }; }
    function piece(g, e, a, b, y0, y1, off, th, mat, noShadow) {
      var L2 = b - a, h = y1 - y0; if (L2 < 0.005 || h < 0.005) return;
      return e.axis === 'x' ? K.box(g, L2, h, th, mat, (a + b) / 2, y0, e.c + off, { noShadow: noShadow }) : K.box(g, th, h, L2, mat, e.c + off, y0, (a + b) / 2, { noShadow: noShadow });
    }
    // Degradado oscuro en la unión muro-piso / muro-plafón (h < 0: hacia abajo desde el plafón)
    function aoStrip(g, e, a, b, off, inward, y, h) {
      var L2 = b - a, hh = Math.abs(h), flip = h < 0 ? Math.PI : 0, ry = e.axis === 'x' ? (inward > 0 ? 0 : Math.PI) : (inward > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (e.axis === 'x') K.plane(g, L2, hh, M.ao, (a + b) / 2, y + h / 2, e.c + off, { ry: ry, rz: flip, noShadow: true });
      else K.plane(g, L2, hh, M.ao, e.c + off, y + h / 2, (a + b) / 2, { ry: ry, rz: flip, noShadow: true });
      if (h > 0) {
        if (e.axis === 'x') K.plane(g, L2, 0.3, M.ao, (a + b) / 2, 0.016, e.c + off + inward * 0.15, { rx: -Math.PI / 2, rz: inward > 0 ? Math.PI : 0, noShadow: true });
        else K.plane(g, L2, 0.3, M.ao, e.c + off + inward * 0.15, 0.016, (a + b) / 2, { rx: -Math.PI / 2, rz: inward > 0 ? -Math.PI / 2 : Math.PI / 2, noShadow: true });
      }
    }
    function joinery(g, e, h, Hc) {
      var w = h.hi - h.lo, mid = (h.lo + h.hi) / 2, A = e.A, B = e.B, X = e.axis === 'x';
      function at(t, off) { return X ? [t, e.c + off] : [e.c + off, t]; }
      function bx(along, h2, across, mat, t, off, y0, o) { var q = at(t, off); return K.box(g, X ? along : across, h2, X ? across : along, mat, q[0], y0, q[1], o); }
      if (h.kind === 'gdoor') { // portón seccional cerrado
        for (var k = 0; k < 6; k++) bx(w, 0.39, 0.04, M.alu, mid, 0, k * 0.4 + 0.005);
        bx(w + 0.1, 0.05, 0.12, M.black, mid, 0, h.y1 - 0.05);
        return;
      }
      if (h.kind === 'win' || h.kind === 'slide' || h.kind === 'entry') {
        var y0 = h.y0, y1 = h.y1, fw = 0.05;
        bx(fw, y1 - y0, 0.1, M.alu, h.lo + fw / 2, 0, y0); bx(fw, y1 - y0, 0.1, M.alu, h.hi - fw / 2, 0, y0);
        bx(w, fw, 0.1, M.alu, mid, 0, y1 - fw); bx(w, 0.03, 0.12, h.y0 > 0 ? M.marble : M.alu, mid, 0, y0);
        if (h.kind === 'entry') {
          // puerta pivotante de madera entreabierta hacia el vestíbulo
          var st = L.start, inw = st === e.A ? -e.out : e.out, dw = w - 0.1, pv = at(h.lo + 0.3, 0), leaf = new T.Group();
          K.box(leaf, dw, y1 - 0.06, 0.06, M.walnut, dw / 2 - 0.3, 0.02, 0);
          for (var s = 0; s < 6; s++) K.box(leaf, 0.012, y1 - 0.4, 0.01, M.black, -0.3 + 0.15 + s * (dw - 0.3) / 5, 0.2, 0.035, { noShadow: true });
          K.box(leaf, 0.03, 1.1, 0.05, M.brass, dw - 0.45, 0.6, 0.06);
          var th0 = X ? (inw > 0 ? -1.1 : 1.1) : (inw > 0 ? 1.1 : -1.1);
          leaf.position.set(pv[0], 0, pv[1]); leaf.rotation.y = (X ? 0 : -Math.PI / 2) + th0; g.add(leaf);
          return;
        }
        var panes = h.kind === 'slide' ? 2 : w > 1.4 ? 2 : 1;
        for (var i = 0; i < panes; i++) {
          var a = h.lo + fw + i * (w - 2 * fw) / panes, b = a + (w - 2 * fw) / panes, off = h.kind === 'slide' ? (i ? 0.025 : -0.025) : 0, sh = h.kind === 'slide' && i === 1 ? -(b - a) * 0.75 : 0;
          bx(b - a, y1 - y0 - fw, 0.012, M.glass, (a + b) / 2 + sh, off, y0 + 0.015, { noShadow: true });
          if (i < panes - 1 || h.kind === 'slide') bx(0.03, y1 - y0 - fw, 0.05, M.alu, b + sh, off, y0);
        }
        // cortinas en sala y recámaras
        [A, B].forEach(function (R, side) {
          if (!R || R.ext || !/soc|rec/.test(R.k) || /Vestidor|Estudio/.test(R.n) || h.y0 > 1.2) return;
          var inward = side === 0 ? -e.out : e.out, ch = Math.min(Hc - 0.08, 2.75), r0 = X ? R.x : R.y, r1 = X ? R.x + R.w : R.y + R.h;
          [-1, 1].forEach(function (sg) {
            var t = clamp(sg < 0 ? h.lo - 0.22 : h.hi + 0.22, r0 + 0.36, r1 - 0.36), q = at(t, inward * 0.16);
            var cm = new T.Mesh(curtainGeo(0.55, ch), M.curtain); cm.position.set(q[0], 0.03 + ch / 2, q[1]); cm.rotation.y = X ? 0 : Math.PI / 2; cm.castShadow = true; g.add(cm);
          });
          bx(Math.min(w + 1.2, r1 - r0 - 0.2), 0.02, 0.02, M.black, clamp(mid, r0 + 0.1 + Math.min(w + 1.2, r1 - r0 - 0.2) / 2, r1 - 0.1 - Math.min(w + 1.2, r1 - r0 - 0.2) / 2), inward * 0.16, ch + 0.05, { noShadow: true });
        });
        return;
      }
      if (h.kind === 'door' || h.kind === 'open') {
        // chambranas en ambas caras
        [A, B].forEach(function (R, side) {
          if (!isInt(R)) return; var o = (side === 0 ? -e.out : e.out) * 0.085;
          bx(0.06, h.y1 + 0.06, 0.02, M.trim, h.lo - 0.03, o, 0, { noShadow: true }); bx(0.06, h.y1 + 0.06, 0.02, M.trim, h.hi + 0.03, o, 0, { noShadow: true });
          if (h.y1 < Hc) bx(w + 0.12, 0.06, 0.02, M.trim, mid, o, h.y1, { noShadow: true });
        });
        if (h.kind === 'door') {
          // hoja abierta a 90°, pegada al marco, dentro del espacio al que da
          var into = h.into || B, inw2 = into === e.A ? -e.out : e.out, lf = new T.Group(), p0 = inw2 > 0 ? 0.075 : -0.075 - 0.88;
          if (X) { K.box(lf, 0.04, 2.1, 0.84, M.lacquer, 0, 0.01, 0.44); [-1, 1].forEach(function (s) { K.box(lf, 0.018, 0.012, 0.14, M.brass, s * 0.035, 1.02, 0.72); }); lf.position.set(h.lo + 0.02, 0, e.c + p0); }
          else { K.box(lf, 0.84, 2.1, 0.04, M.lacquer, 0.44, 0.01, 0); [-1, 1].forEach(function (s) { K.box(lf, 0.14, 0.012, 0.018, M.brass, 0.72, 1.02, s * 0.035); }); lf.position.set(e.c + p0, 0, h.lo + 0.02); }
          g.add(lf);
        }
      }
    }
    var curtainCache = {};
    function curtainGeo(w, h) {
      var k = w.toFixed(2) + h.toFixed(2); if (curtainCache[k]) return curtainCache[k];
      var gg = new T.PlaneGeometry(w, h, 28, 1), p = gg.attributes.position, uv = gg.attributes.uv;
      for (var i = 0; i < p.count; i++) { var x = p.getX(i); p.setZ(i, Math.sin(x / w * Math.PI * 9) * 0.035); uv.setXY(i, uv.getX(i) * w * 1.6, uv.getY(i) * h); }
      gg.computeVertexNormals(); return (curtainCache[k] = gg);
    }

    /* ---------- Amueblado por espacio ---------- */
    function Zone(R, rect, sides) { // rect en planta: x0,z0,x1,z1 ; sides: {N,S,W,E}
      var occ = [], wallItems = { N: [], S: [], W: [], E: [] }, z = { R: R, rect: rect, sides: sides, occ: occ };
      var inset = 0.08, r0 = { x0: rect.x0 + inset, z0: rect.z0 + inset, x1: rect.x1 - inset, z1: rect.z1 - inset };
      z.inner = r0; z.w = r0.x1 - r0.x0; z.d = r0.z1 - r0.z0; z.cx = (r0.x0 + r0.x1) / 2; z.cz = (r0.z0 + r0.z1) / 2;
      var RY = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 }, OPP = { N: 'S', S: 'N', W: 'E', E: 'W' }, LEFT = { N: 'W', S: 'E', W: 'S', E: 'N' }, RIGHT = { N: 'E', S: 'W', W: 'N', E: 'S' };
      z.OPP = OPP; z.LEFT = LEFT; z.RIGHT = RIGHT;
      z.len = function (s) { return s === 'N' || s === 'S' ? z.w : z.d; };
      z.depth = function (s) { return s === 'N' || s === 'S' ? z.d : z.w; };
      function center(s) { return s === 'N' ? [z.cx, r0.z0] : s === 'S' ? [z.cx, r0.z1] : s === 'W' ? [r0.x0, z.cz] : [r0.x1, z.cz]; }
      z.toW = function (s, u, v) { var ry = RY[s], c = center(s); return [c[0] + u * Math.cos(ry) + v * Math.sin(ry), c[1] - u * Math.sin(ry) + v * Math.cos(ry)]; };
      z.uOf = function (s, t) { return s === 'N' ? t - z.cx : s === 'S' ? z.cx - t : s === 'W' ? z.cz - t : t - z.cz; };
      function intervals(s, key) { return (sides[s] ? sides[s][key] : []).map(function (iv) { var a = z.uOf(s, iv[0]), b = z.uOf(s, iv[1]); return [Math.min(a, b), Math.max(a, b), iv[2]]; }); }
      z.doors = function (s) { return intervals(s, 'doors'); };
      z.wins = function (s) { return intervals(s, 'wins'); };
      z.hasWall = function (s) { return sides[s] && sides[s].wall.length > 0 && sides[s].isWall !== false; };
      function rectOf(s, u, v, w, d) { var a = z.toW(s, u - w / 2, v), b = z.toW(s, u + w / 2, v + d); return { x0: Math.min(a[0], b[0]), z0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), z1: Math.max(a[1], b[1]) }; }
      function overl(a, b) { return a.x0 < b.x1 - 0.005 && a.x1 > b.x0 + 0.005 && a.z0 < b.z1 - 0.005 && a.z1 > b.z0 + 0.005; }
      z.free = function (rc) { if (rc.x0 < r0.x0 - 0.01 || rc.z0 < r0.z0 - 0.01 || rc.x1 > r0.x1 + 0.01 || rc.z1 > r0.z1 + 0.01) return false; for (var i = 0; i < occ.length; i++) if (overl(rc, occ[i])) return false; return true; };
      // reservar paso frente a puertas
      ['N', 'S', 'W', 'E'].forEach(function (s) { z.doors(s).forEach(function (dv) { occ.push(rectOf(s, (dv[0] + dv[1]) / 2, -0.1, dv[1] - dv[0] + 0.25, 1.05)); }); });
      z.put = function (s, u, v, w, d, obj, o) {
        o = o || {};
        var rc = rectOf(s, u, v, w, d);
        if (!o.force && !z.free(rc)) return false;
        if (o.tall) { var wn = z.wins(s); for (var i = 0; i < wn.length; i++) if (v < 0.3 && u + w / 2 > wn[i][0] && u - w / 2 < wn[i][1]) return false; }
        var p = z.toW(s, u, v); obj.position.set(p[0], 0, p[1]); obj.rotation.y = RY[s];
        z.g.add(obj); if (!o.noOcc) { occ.push(rc); furn.push(rc); }
        if (o.solid) blockers.push(rc);
        if (!o.noBlob) { var bw = rc.x1 - rc.x0, bd = rc.z1 - rc.z0; K.plane(z.g, bw * 1.15, bd * 1.15, M.blob, (rc.x0 + rc.x1) / 2, 0.028, (rc.z0 + rc.z1) / 2, { rx: -Math.PI / 2, noShadow: true }); }
        return true;
      };
      // Pieza girada 90° hacia un lado (p. ej. sillón mirando a la mesa): huella w×d con frente hacia dir (+1 derecha / -1 izquierda de s)
      z.putFacing = function (s, u, v, w, d, obj, dir, o) {
        o = o || {};
        var rc = rectOf(s, u, v, d, w);
        if (!o.force && !z.free(rc)) return false;
        var p = z.toW(s, u, v + w / 2); obj.position.set(p[0], 0, p[1]); obj.rotation.y = RY[s] + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        obj.translateZ(-d / 2); z.g.add(obj); occ.push(rc); furn.push(rc); if (o.solid) blockers.push(rc);
        K.plane(z.g, (rc.x1 - rc.x0) * 1.15, (rc.z1 - rc.z0) * 1.15, M.blob, (rc.x0 + rc.x1) / 2, 0.028, (rc.z0 + rc.z1) / 2, { rx: -Math.PI / 2, noShadow: true });
        return true;
      };
      // Pieza centrada libremente (giro según el lado s)
      z.putAt = function (x, zc, w, d, obj, s, o) {
        o = o || {}; var horiz = s === 'N' || s === 'S', rw = horiz ? w : d, rd = horiz ? d : w;
        var rc = { x0: x - rw / 2, z0: zc - rd / 2, x1: x + rw / 2, z1: zc + rd / 2 };
        if (!o.force && !z.free(rc)) return false;
        var ry = RY[s]; obj.position.set(x, 0, zc); obj.rotation.y = ry; obj.translateZ(-d / 2); z.g.add(obj);
        if (!o.noOcc) { occ.push(rc); furn.push(rc); } if (o.solid) blockers.push(rc);
        if (!o.noBlob) K.plane(z.g, rw * 1.12, rd * 1.12, M.blob, x, 0.028, zc, { rx: -Math.PI / 2, noShadow: true });
        return true;
      };
      // Elemento en muro (cuadro, TV, espejo): evita puertas, ventanas y otros elementos
      z.wall = function (s, u, w, obj, y, o) {
        o = o || {};
        if (!z.hasWall(s)) return false;
        var bad = z.doors(s).concat(o.ignoreWin ? [] : z.wins(s)).concat(wallItems[s]);
        for (var i = 0; i < bad.length; i++) if (u + w / 2 > bad[i][0] - 0.1 && u - w / 2 < bad[i][1] + 0.1) return false;
        if (Math.abs(u) + w / 2 > z.len(s) / 2 - 0.05) return false;
        var p = z.toW(s, u, 0); obj.position.set(p[0], y || 0, p[1]); obj.rotation.y = RY[s]; z.g.add(obj); wallItems[s].push([u - w / 2, u + w / 2]);
        return true;
      };
      // Busca u libre en un lado para una pieza de ancho w contra el muro
      z.span = function (s, w, d, o) {
        o = o || {}; var half = z.len(s) / 2 - w / 2; if (half < 0) return null;
        var cand = [], st = 0.05;
        if (o.corner) { for (var t = -half; t <= half + 1e-6; t += st) cand.push(o.corner > 0 ? -t : t); }
        else { cand.push(0); for (t = st; t <= half + 1e-6; t += st) { cand.push(t); cand.push(-t); } }
        for (var i = 0; i < cand.length; i++) {
          var u = cand[i], rc = rectOf(s, u, o.v || 0, w, d); if (!z.free(rc)) continue;
          if (o.tall) { var wn = z.wins(s), bad = false; for (var j = 0; j < wn.length; j++) if (u + w / 2 > wn[j][0] - 0.05 && u - w / 2 < wn[j][1] + 0.05) bad = true; if (bad) continue; }
          if (o.wall && !z.hasWall(s)) return null;
          return u;
        }
        return null;
      };
      // Tramo libre más largo a lo largo de un lado (para cocinas y closets)
      z.runs = function (s, d, o) {
        o = o || {}; var Lh = z.len(s) / 2, st = 0.05, out = [], a = null;
        for (var t = -Lh; t <= Lh + 1e-6; t += st) {
          var rc = rectOf(s, t + st / 2, 0, st, d), ok = t + st <= Lh + 1e-6 && z.free(rc);
          if (ok && o.tall) { var wn = z.wins(s); for (var j = 0; j < wn.length; j++) if (t + st > wn[j][0] && t < wn[j][1]) ok = false; }
          if (ok && a == null) a = t; if (!ok && a != null) { out.push([a, t]); a = null; }
        }
        if (a != null) out.push([a, Lh]);
        return out.sort(function (p, q) { return (q[1] - q[0]) - (p[1] - p[0]); });
      };
      z.wallScore = function (s, o) { // para elegir muro principal
        if (!z.hasWall(s)) return -99; var sc = z.len(s); z.doors(s).forEach(function (d) { sc -= (d[1] - d[0]) + 1.2; }); if (o && o.noWin) z.wins(s).forEach(function (w) { sc -= (w[1] - w[0]) + 0.6; }); return sc;
      };
      z.best = function (o) { return ['N', 'S', 'W', 'E'].sort(function (a, b) { return z.wallScore(b, o) - z.wallScore(a, o); })[0]; };
      z.decorate = function (n, seed) { // cuadros y plantas para completar
        var r = RNG(seed), placed = 0;
        ['N', 'E', 'S', 'W'].forEach(function (s) {
          if (placed >= n || !z.hasWall(s) || z.len(s) < 1.4) return;
          var w = clamp(z.len(s) * 0.32, 0.6, 1.3), h = w * (r() < 0.5 ? 0.75 : 1.25);
          var art = F.painting(w, h, Math.floor(r() * 5), Math.floor(r() * 9), r() < 0.5 ? M.black : M.oak), L4 = z.len(s) / 4;
          if ([0, -L4, L4].some(function (u) { return z.wall(s, u, w, art, 1.5 - h / 2); })) placed++;
        });
        var corners = [['N', -1], ['N', 1], ['S', -1], ['S', 1]], pl = 0;
        corners.forEach(function (c) {
          if (pl >= 2) return; var s = c[0], u = c[1] * (z.len(s) / 2 - 0.3);
          if (z.put(s, u, 0.05, 0.5, 0.5, F.plant(r() < 0.6, Math.floor(r() * 99)), { noBlob: false })) pl++;
        });
      };
      return z;
    }
    function zoneSides(R, sides, rect) { // recorta los lados del espacio a una zona; los cortes interiores no tienen muro
      var out = {};
      ['N', 'S', 'W', 'E'].forEach(function (s) {
        var sd = sides[s], horiz = s === 'N' || s === 'S', line = s === 'N' ? rect.z0 : s === 'S' ? rect.z1 : s === 'W' ? rect.x0 : rect.x1;
        if (Math.abs(line - sd.line) > 0.02) { out[s] = { wall: [], doors: [], wins: [], isWall: false }; return; }
        var a0 = horiz ? rect.x0 : rect.z0, a1 = horiz ? rect.x1 : rect.z1;
        function clip(list) { return list.map(function (iv) { return [Math.max(iv[0], a0), Math.min(iv[1], a1), iv[2]]; }).filter(function (iv) { return iv[1] - iv[0] > 0.05; }); }
        out[s] = { wall: clip(sd.wall), doors: clip(sd.doors), wins: clip(sd.wins) };
      });
      return out;
    }
    function furnish(R, g, Hc) {
      var sides = sidesOf(R, L.edges), rect = { x0: R.x, z0: R.y, x1: R.x + R.w, z1: R.y + R.h }, n = R.n, seed = hashStr(R.label);
      var grp2 = new T.Group(); g.add(grp2);
      function zone(rc) { var z = Zone(R, rc, zoneSides(R, sides, rc)); z.g = grp2; z.H = Hc; return z; }
      if (R.ext) return outdoorZone(zone(rect), seed);
      if (R.w < 0.9 || R.h < 0.9) return;
      if (/Sala · comedor|Estancia · comedor · cocina/.test(n) || (n === 'Estancia' && R.unit)) {
        var horiz = R.w >= R.h, Lx = horiz ? R.w : R.h, kit = /cocina/i.test(n) || (n === 'Estancia' && R.unit), parts = kit ? [0.3, 0.27, 0.43] : [0.42, 0.58];
        // la sala hacia el lado con más fachada/ventanas
        var endA = horiz ? 'W' : 'N', endB = horiz ? 'E' : 'S', winA = sides[endA].wins.length + (sides[endA].doors.length ? 0.5 : 0), winB = sides[endB].wins.length;
        var fns = kit ? [kitchen, dining, living] : [dining, living];
        if (winA > winB) { parts = parts.slice().reverse(); fns = fns.slice().reverse(); }
        var acc = 0;
        parts.forEach(function (p, i) {
          var a = acc, b = acc + p * Lx; acc = b;
          var rc = horiz ? { x0: R.x + a, z0: R.y, x1: R.x + b, z1: R.y + R.h } : { x0: R.x, z0: R.y + a, x1: R.x + R.w, z1: R.y + b };
          fns[i](zone(rc), seed + i);
        });
        return;
      }
      var z = zone(rect);
      if (/Cocina/.test(n)) return kitchen(z, seed);
      if (/^Sala$|Estancia|usos múltiples/.test(n)) return living(z, seed);
      if (/Comedor/.test(n)) return dining(z, seed);
      if (/Vestidor/.test(n)) return walkin(z, seed);
      if (R.k === 'rec' || /Recámara/.test(n)) return bedroom(z, seed, /principal/i.test(n));
      if (R.k === 'bano') return /Sanitarios/.test(n) ? publicWC(z, seed) : bath(z, seed, /principal/i.test(n) || R.area > 6.5, /Medio/.test(n));
      if (/Estudio/.test(n)) return study(z, seed);
      if (/Escalera/.test(n)) return hall(z, seed, true);
      if (/Patio de servicio|Lavado/.test(n)) return laundry(z, seed);
      if (R.k === 'coch') return garage(z, seed, R.cars || 1);
      if (/Vestíbulo|Pasillo/.test(n)) return hall(z, seed);
      if (/Cuarto de máquinas|Basura/.test(n)) return utility(z, seed);
      if (R.k === 'com') return /Food/.test(n) ? foodcourt(z, seed) : store(z, seed);
      if (R.k === 'ofi') return office(z, seed);
      if (R.k === 'alm') return warehouse(z, seed);
      return hall(z, seed);
    }
    function living(z, seed) {
      var tv = z.best({ noWin: true }), opp = z.OPP[tv], depth = z.depth(tv), r = RNG(seed);
      var cw = clamp(z.len(tv) - 1.0, 1.2, 2.2), u = z.span(tv, cw, 0.45, { tall: false });
      if (u == null) { cw = 1.2; u = z.span(tv, cw, 0.45); }
      if (u == null) u = 0;
      if (z.wallScore(tv) > 2 && z.put(tv, u, 0, cw, 0.42, F.console(cw))) {
        var tvw = depth > 4 ? 1.45 : 1.2, wallG = new T.Group();
        if (z.len(tv) > cw + 0.8 && z.H > 2.5) F.slats(wallG, Math.min(cw + 0.6, z.len(tv) - 0.3), z.H - 0.01);
        F.tv(wallG, tvw, 1.25);
        if (!z.wall(tv, u, Math.min(cw + 0.6, z.len(tv) - 0.3), wallG, 0)) { var tvg = new T.Group(); F.tv(tvg, tvw, 1.25); z.wall(tv, u, tvw, tvg, 0); }
      }
      var sw = clamp(z.len(tv) - 1.4, 1.6, 2.6), dist = Math.min(depth - 0.1, 3.3), vOpp = depth - dist - 0.95;
      if (vOpp < 0.35) vOpp = 0.02;
      var sofaMat = [M.linen, M.velvetNavy, M.boucle][seed % 3], acc = sofaMat === M.velvetNavy ? M.mustard : M.velvetNavy;
      var okSofa = z.put(opp, -u, vOpp, sw, 0.95, F.sofa(sw, sofaMat, acc), { solid: true });
      if (!okSofa) { sw = 1.8; okSofa = z.put(opp, -u, vOpp, sw, 0.95, F.sofa(sw, sofaMat, acc), { solid: true }); }
      var vTable = vOpp + 0.95 + 0.42;
      if (okSofa) {
        z.put(opp, -u, vOpp + 0.25, sw + 0.7, Math.min(2.4, dist - 0.4), F.rug(sw + 0.7, Math.min(2.4, dist - 0.4), seed % 4), { force: true, noOcc: true, noBlob: true });
        z.put(opp, -u, vTable, Math.min(1.2, sw * 0.55), 0.62, F.coffeeTable(Math.min(1.2, sw * 0.55), 0.62), { solid: true });
        if (vOpp < 0.1) { var pw = Math.min(1.5, sw * 0.6); z.wall(opp, -u, pw, F.painting(pw, pw * 0.66, [0, 2, 4][seed % 3], seed % 9, M.oak), 1.05); }
        if (!z.put(opp, -u - sw / 2 - 0.3, vOpp + 0.1, 0.5, 0.5, F.sideTable())) z.put(opp, -u - sw / 2 - 0.3, vOpp + 0.1, 0.5, 0.5, F.plant(false, seed));
        else F.tableLamp(z.g.children[z.g.children.length - 2], 0, 0.55, 0.25);
        z.put(opp, -u + sw / 2 + 0.28, vOpp + 0.05, 0.4, 0.45, F.floorLamp());
        // sillón frente a la mesa
        var arm = F.armchair(sofaMat === M.boucle ? M.velvetNavy : M.boucle);
        if (!z.putFacing(opp, -u + sw / 2 + 1.0, vTable - 0.12, 0.82, 0.82, arm, -1)) z.putFacing(opp, -u - sw / 2 - 1.0, vTable - 0.12, 0.82, 0.82, F.armchair(M.boucle), 1);
      }
      if (z.len(z.LEFT[tv]) > 2.6) { var bu = z.span(z.LEFT[tv], 1.0, 0.36, { tall: true, corner: 1 }); if (bu != null && z.depth(z.LEFT[tv]) > 3) z.put(z.LEFT[tv], bu, 0, 1.0, 0.36, F.bookshelf(1.0, Math.min(2.2, z.H - 0.2), seed), { tall: true, solid: true }); }
      z.decorate(2, seed);
    }
    function dining(z, seed) {
      var horiz = z.w >= z.d, Lt = clamp((horiz ? z.w : z.d) - 1.5, 1.2, 2.4), Dt = clamp((horiz ? z.d : z.w) - 1.5, 0.8, 1.0), s = horiz ? 'N' : 'W';
      if ((horiz ? z.d : z.w) < 2.2) { Dt = 0.8; Lt = Math.min(Lt, 1.4); }
      if (!z.putAt(z.cx, z.cz, Lt, Dt, F.diningTable(Lt, Dt), s, { solid: true })) { Lt = 1.2; if (!z.putAt(z.cx, z.cz, Lt, Dt, F.diningTable(Lt, Dt), s, { solid: true, force: true })) return; }
      var mat = [M.boucle, M.sage, M.leather][seed % 3], nC = Math.max(1, Math.floor((Lt - 0.15) / 0.62));
      for (var i = 0; i < nC; i++) {
        var t = -Lt / 2 + Lt * (i + 0.5) / nC;
        [-1, 1].forEach(function (side) {
          var x = horiz ? z.cx + t : z.cx + side * (Dt / 2 + 0.22), zz = horiz ? z.cz + side * (Dt / 2 + 0.22) : z.cz + t;
          chairAt(z.g, F.chair(mat), x, zz);
        });
      }
      if (Lt >= 1.8) [-1, 1].forEach(function (side) { var x = horiz ? z.cx + side * (Lt / 2 + 0.22) : z.cx, zz = horiz ? z.cz : z.cz + side * (Lt / 2 + 0.22); chairAt(z.g, F.chair(mat), x, zz); });
      function chairAt(g, c, x, zz) { c.position.set(x, 0, zz); c.rotation.y = Math.atan2(z.cx - x, z.cz - zz); c.translateZ(-0.24); g.add(c); }
      F.pendant(z.g, z.cx, z.H, z.cz, Lt > 1.6 ? 'linear' : 'dome');
      if (Lt > 1.6 && !horiz) z.g.children[z.g.children.length - 1].rotation.y = Math.PI / 2;
      var sb = z.best({ noWin: true }), sbw = clamp(z.len(sb) - 1.4, 1.0, 1.8), su = z.span(sb, sbw, 0.45);
      if (su != null && z.depth(sb) > Dt + 1.6 && z.put(sb, su, 0, sbw, 0.45, F.sideboard(sbw))) { var pw = Math.min(1.2, sbw * 0.75); z.wall(sb, su, pw, F.painting(pw, pw * 1.2, [1, 3][seed % 2], seed % 9, M.brass), 1.32); }
      z.decorate(1, seed + 3);
    }
    function kitchen(z, seed) {
      var s = z.best({ noWin: false }), runs = z.runs(s, 0.62), H = z.H;
      if (!runs.length) return;
      var run = runs[0], L = Math.min(run[1] - run[0], 4.2); if (L < 1.2) return;
      var u0 = (run[0] + run[1]) / 2, g = F.kitchenRun(L, H, { front: [M.lacquer, M.oak, M.lacquerGreige][seed % 3] });
      var fr = L >= 2.4, fx = -L / 2 + 0.45, cookX = fr ? 0.2 : -L / 4, sinkX = L / 2 - 0.55;
      var wins = z.wins(s).map(function (w) { return [w[0] - u0, w[1] - u0]; }), winOver = function (x) { return wins.some(function (w) { return x > w[0] - 0.1 && x < w[1] + 0.1; }); };
      wins.forEach(function (w) { if (w[1] > -L / 2 && w[0] < L / 2) sinkX = clamp((w[0] + w[1]) / 2, -L / 2 + 0.4, L / 2 - 0.4); });
      if (Math.abs(sinkX - cookX) < 0.8) cookX = sinkX > 0 ? sinkX - 1.0 : sinkX + 1.0;
      if (fr) { var f = F.fridge(H); f.position.x = fx; g.add(f); }
      F.cooktop(g, cookX, 0.9); F.sink(g, sinkX, 0.89);
      if (!winOver(cookX)) F.hood(g, cookX, H);
      // alacenas evitando ventana y campana
      var cuts = wins.concat([[cookX - 0.46, cookX + 0.46]]).concat(fr ? [[-L / 2, fx + 0.47]] : []).sort(function (a, b) { return a[0] - b[0]; }), c = -L / 2;
      cuts.forEach(function (k) { if (k[0] > c) F.upper(g, c, Math.min(k[0], L / 2), H, [M.lacquer, M.oak, M.lacquerGreige][seed % 3]); c = Math.max(c, k[1]); });
      if (c < L / 2) F.upper(g, c, L / 2, H, [M.lacquer, M.oak, M.lacquerGreige][seed % 3]);
      // pequeños electrodomésticos y accesorios
      K.rbox(g, 0.28, 0.36, 0.32, 0.03, M.black, (cookX + sinkX) / 2, 0.89, 0.2); K.box(g, 0.4, 0.02, 0.28, M.walnut, sinkX - (sinkX > 0 ? 0.6 : -0.6), 0.89, 0.25, { ry: 0.1 });
      K.lathe(g, 'jar', [[0, 0], [0.06, 0], [0.06, 0.2], [0.03, 0.22], [0, 0.22]], M.ceramic, (cookX + sinkX) / 2 + 0.3, 0.89, 0.15);
      if (!z.put(s, u0, 0, L, 0.62, g, { solid: true })) return;
      // segundo brazo en L
      var side2 = [z.LEFT[s], z.RIGHT[s]].filter(function (q) { return z.hasWall(q); })[0];
      if (side2) { var r2 = z.runs(side2, 0.62, { tall: false })[0]; if (r2 && r2[1] - r2[0] > 1.2) { var L2 = Math.min(r2[1] - r2[0], 2.4), u2 = (r2[0] + r2[1]) / 2; var g2 = F.kitchenRun(L2, H, { front: [M.lacquer, M.oak, M.lacquerGreige][seed % 3], noUpper: true }); z.put(side2, u2, 0, L2, 0.62, g2, { solid: true }); } }
      // isla
      var dep = z.depth(s);
      if (dep >= 3.4) {
        var IL = clamp(Math.min(L, z.len(s) - 1.6), 1.4, 2.6);
        if (z.put(s, u0, 1.65, IL, 0.95, F.island(IL, 0.95), { solid: true })) {
          for (var i = 0; i < Math.floor(IL / 0.6); i++) { var st = F.stool(); var p = z.toW(s, u0 - IL / 2 + 0.3 + i * 0.6, 1.65 + 0.95 + 0.2); st.position.set(p[0], 0, p[1]); st.rotation.y = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 }[s]; st.translateZ(-0.2); z.g.add(st); }
          [-IL / 4, IL / 4].forEach(function (o) { var q = z.toW(s, u0 + o, 2.12); F.pendant(z.g, q[0], z.H, q[1], 'dome'); });
        }
      }
    }
    function bedroom(z, seed, main) {
      var hs = z.best({ noWin: true }), r = RNG(seed), bw = main ? (z.len(hs) > 3.2 ? 1.93 : 1.6) : z.len(hs) > 2.8 ? 1.4 : 1.05, bl = 2.1;
      if (z.depth(hs) < bl + 0.6) { bw = Math.min(bw, 1.2); bl = 2.0; }
      var u = z.span(hs, bw + 1.2, bl, {}); var withNS = true;
      if (u == null) { u = z.span(hs, bw, bl, {}); withNS = false; }
      if (u == null) return;
      z.put(hs, u, 0, bw + 0.12, bl, F.bed(bw, bl, [M.velvetNavy, M.mustard, M.terracotta, M.sage][seed % 4]), { solid: true });
      z.put(hs, u, 0.6, bw + 1.0, Math.min(2.6, z.depth(hs) - 0.4), F.rug(bw + 1.0, Math.min(2.6, z.depth(hs) - 0.4), (seed + 1) % 4), { force: true, noOcc: true, noBlob: true });
      if (withNS) { z.put(hs, u - bw / 2 - 0.38, 0.09, 0.48, 0.4, F.nightstand(true)); z.put(hs, u + bw / 2 + 0.38, 0.09, 0.48, 0.4, F.nightstand(true)); }
      var pw = Math.min(1.4, bw * 0.8); z.wall(hs, u, pw, F.painting(pw, pw * 0.62, [2, 0, 3, 4][seed % 4], seed % 9, M.oak), 1.45, { ignoreWin: false }) || true;
      if (main && z.depth(hs) > bl + 1.2) z.put(hs, u, bl + 0.08, Math.min(1.3, bw), 0.42, F.bench(Math.min(1.3, bw)));
      // closet en el muro más largo restante
      var cs = ['N', 'S', 'W', 'E'].filter(function (s) { return s !== hs && z.hasWall(s); }).sort(function (a, b) { var ra = z.runs(a, 0.6, { tall: true })[0], rb = z.runs(b, 0.6, { tall: true })[0]; return (rb ? rb[1] - rb[0] : 0) - (ra ? ra[1] - ra[0] : 0); })[0];
      var run = cs && z.runs(cs, 0.6, { tall: true })[0];
      if (run && run[1] - run[0] >= 1.1) { var Lc = Math.min(run[1] - run[0], 3.0); z.put(cs, (run[0] + run[1]) / 2, 0, Lc, 0.6, F.wardrobe(Lc, z.H, [M.ash, M.oak, M.lacquerGreige][seed % 3]), { tall: true, solid: true }); }
      // tocador o escritorio
      var ds = ['N', 'S', 'W', 'E'].filter(function (s) { return s !== hs && s !== cs && z.hasWall(s); })[0];
      if (ds) { var du = z.span(ds, 1.2, 0.48, {}); if (du != null) { if (z.put(ds, du, 0, 1.2, 0.48, F.dresser(1.2))) { var mg = new T.Group(); F.roundMirror(mg, 0.38, 0); z.wall(ds, du, 0.8, mg, 1.45); } } }
      z.decorate(1, seed);
    }
    function walkin(z, seed) {
      ['N', 'S', 'W', 'E'].forEach(function (s) { if (!z.hasWall(s)) return; z.runs(s, 0.56, { tall: true }).forEach(function (rn) { if (rn[1] - rn[0] >= 0.85) z.put(s, (rn[0] + rn[1]) / 2, 0, rn[1] - rn[0], 0.56, F.openCloset(rn[1] - rn[0], z.H, seed++), { tall: true, solid: true }); }); });
      if (z.w > 2.2 && z.d > 2.2) z.putAt(z.cx, z.cz, 0.9, 0.6, F.bench(0.9), 'N');
    }
    function bath(z, seed, main, half) {
      var s = z.best({ noWin: true }), vw = half ? 0.7 : main && z.len(s) > 2.6 ? 1.6 : 1.0, u = z.span(s, vw, 0.5, {});
      if (u == null) { vw = 0.7; u = z.span(s, vw, 0.5, {}); }
      if (u != null) z.put(s, u, 0, vw, 0.5, F.vanity(vw, z.H), { solid: true });
      var ts = [z.LEFT[s], z.RIGHT[s], s].filter(function (q) { return z.hasWall(q); }), placedT = false;
      ts.forEach(function (q) { if (placedT) return; var tu = z.span(q, 0.6, 0.72, {}); if (tu != null && z.put(q, tu, 0, 0.6, 0.72, F.toilet(), { solid: true })) placedT = true; });
      if (half) { z.decorate(1, seed); return; }
      // regadera en el fondo
      var sh = z.OPP[s], sw = Math.min(1.2, z.len(sh) - 0.1), sd = Math.min(1.0, z.depth(sh) - 1.2);
      if (sd >= 0.8) {
        var su = z.span(sh, sw, sd, { corner: 1 });
        if (su != null) { var gq = new T.Group(); F.shower(gq, sw, sd, z.H); gq.children.forEach(function (c) { c.position.x -= sw / 2; }); z.put(sh, su, 0, sw, sd, gq, { solid: false, noBlob: true }); blockers.push(rectSide(z, sh, su - sw / 2, 0, 0.05, sd)); }
      }
      if (main && z.w * z.d > 7.5) { var tb = [z.LEFT[s], z.RIGHT[s]].filter(function (q) { return z.span(q, 1.7, 0.85, {}) != null; })[0]; if (tb) { var tu2 = z.span(tb, 1.7, 0.85, {}); z.put(tb, tu2, 0.05, 1.7, 0.85, F.tub(), { solid: true }); } }
      z.decorate(0, seed);
      var pu = z.span(z.OPP[s], 0.4, 0.4, { corner: -1 }); if (pu != null) z.put(z.OPP[s], pu, 0, 0.4, 0.4, F.plant(false, seed));
    }
    function rectSide(z, s, u, v, w, d) { var a = z.toW(s, u - w / 2, v), b = z.toW(s, u + w / 2, v + d); return { x0: Math.min(a[0], b[0]), z0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), z1: Math.max(a[1], b[1]) }; }
    function publicWC(z, seed) {
      var s = z.best({ noWin: true }), n = Math.max(1, Math.floor((z.len(s) - 0.4) / 0.9));
      for (var i = 0; i < Math.min(n, 4); i++) z.put(s, -z.len(s) / 2 + 0.5 + i * 0.9, 0, 0.6, 0.72, F.toilet(), { solid: true });
      var o = z.OPP[s], vw = Math.min(2.4, z.len(o) - 0.6), u = z.span(o, vw, 0.5, {}); if (u != null) z.put(o, u, 0, vw, 0.5, F.vanity(vw, z.H), { solid: true });
    }
    function study(z, seed) {
      var s = z.best({ noWin: false }), u = z.span(s, 1.4, 1.2, {});
      if (u != null && z.put(s, u, 0, 1.4, 0.65, F.desk(1.4), { solid: true })) z.put(s, u, 0.55, 0.6, 0.6, F.officeChair(), { force: true, noBlob: true });
      var b = z.OPP[s], bw = clamp(z.len(b) - 0.8, 0.9, 2.4), bu = z.span(b, bw, 0.36, { tall: true }); if (bu != null) z.put(b, bu, 0, bw, 0.36, F.bookshelf(bw, Math.min(2.3, z.H - 0.2), seed), { tall: true, solid: true });
      var a = z.LEFT[s], au = z.span(a, 0.82, 0.82, {}); if (au != null) z.put(a, au, 0, 0.82, 0.82, F.armchair(M.leather), { solid: true });
      z.decorate(1, seed);
    }
    function laundry(z, seed) {
      var s = z.best({ noWin: false }), u = z.span(s, 1.3, 0.62, {});
      if (u != null) { var g = new T.Group(), w1 = F.washer(false), w2 = F.washer(false); w1.position.x = -0.32; w2.position.x = 0.32; g.add(w1); g.add(w2); K.box(g, 1.3, 0.03, 0.62, M.quartz, 0, 0.86, 0.31); z.put(s, u, 0, 1.3, 0.62, g, { solid: true }); z.wall(s, u, 1.2, upperShelves(1.2), 1.5); }
      var o = z.OPP[s], ou = z.span(o, 1.0, 0.36, { tall: true }); if (ou != null) z.put(o, ou, 0, 1.0, 0.36, F.shelves(1.0, 1.9, seed), { tall: true, solid: true });
      z.decorate(0, seed);
    }
    function upperShelves(w) { var g = new T.Group(); K.box(g, w, 0.02, 0.3, M.oak, 0, 0, 0.15); K.box(g, w, 0.02, 0.3, M.oak, 0, 0.4, 0.15); [0, 0.42].forEach(function (y) { for (var x = -w / 2 + 0.15; x < w / 2 - 0.1; x += 0.28) K.rbox(g, 0.24, 0.18, 0.26, 0.02, M.linen, x, y + 0.02, 0.15); }); return g; }
    function garage(z, seed, cars) {
      var s = z.w >= z.d ? 'S' : 'E', horiz = s === 'S' || s === 'N', across = z.len(s), n = Math.max(1, Math.min(cars, Math.floor(across / 2.6), 4));
      for (var i = 0; i < n; i++) { var u = -across / 2 + across * (i + 0.5) / n; var cv = Math.max(0.02, (z.depth(s) - 4.5) / 2); if (!z.put(s, u, cv, 1.82, 4.5, F.car(), { solid: true })) z.put(s, u, cv, 1.82, 4.5, F.car(), { solid: true, force: true }); }
      var o = z.OPP[s], ou = z.span(o, 1.6, 0.36, { tall: true }); if (ou != null) z.put(o, ou, 0, 1.6, 0.36, F.shelves(1.6, 2.0, seed), { tall: true, solid: true });
    }
    function hall(z, seed, stair) {
      if (stair) return;
      var s = z.best({ noWin: true }), u = z.span(s, 1.1, 0.35, {});
      if (u != null && z.depth(s) > 1.4 && z.put(s, u, 0, 1.1, 0.35, consoleTable(1.1))) { var mg = new T.Group(); F.roundMirror(mg, 0.4, 0); z.wall(s, u, 0.85, mg, 1.45); }
      z.decorate(1, seed);
    }
    function consoleTable(w) { var g = new T.Group(); K.box(g, w, 0.03, 0.35, M.walnut, 0, 0.8, 0.175); [-1, 1].forEach(function (s) { K.box(g, 0.03, 0.8, 0.3, M.brass, s * (w / 2 - 0.06), 0, 0.175); }); F.tableLamp(g, w / 2 - 0.22, 0.83, 0.17); K.lathe(g, 'vase4', [[0, 0], [0.08, 0], [0.12, 0.15], [0.06, 0.32], [0.05, 0.42], [0, 0.42]], M.clay, -w / 2 + 0.25, 0.83, 0.17); return g; }
    function utility(z, seed) { var s = z.best({}), u = z.span(s, 1.4, 0.5, { tall: true }); if (u != null) { var g = new T.Group(); K.box(g, 0.6, 1.8, 0.4, M.steel, -0.4, 0, 0.2); K.box(g, 0.6, 1.2, 0.3, M.lacquer, 0.35, 0.3, 0.15); z.put(s, u, 0, 1.4, 0.5, g, { solid: true }); } }
    function store(z, seed) {
      var s = z.best({ noWin: true });
      z.runs(s, 0.5, { tall: true }).slice(0, 1).forEach(function (rn) { var L = Math.min(rn[1] - rn[0], 6); z.put(s, (rn[0] + rn[1]) / 2, 0, L, 0.4, F.shelves(L, 2.2, seed), { tall: true, solid: true }); });
      var o = z.OPP[s], u = z.span(o, 1.8, 0.7, {}); if (u != null) { var g = new T.Group(); K.box(g, 1.8, 0.95, 0.6, M.walnut, 0, 0, 0.3); K.box(g, 1.85, 0.03, 0.65, M.marble, 0, 0.95, 0.32); z.put(o, u, 0.6, 1.8, 0.65, g, { solid: true }); }
      for (var x = z.inner.x0 + 1.5; x < z.inner.x1 - 1.2; x += 2.2) for (var zz = z.inner.z0 + 2; zz < z.inner.z1 - 1.5; zz += 2.6) { var t = new T.Group(); K.box(t, 1.2, 0.8, 0.8, M.ash, 0, 0, 0.4); z.putAt(x, zz, 1.2, 0.8, t, 'N', { solid: true }); }
      z.decorate(1, seed);
    }
    function foodcourt(z, seed) {
      for (var x = z.inner.x0 + 1.2; x < z.inner.x1 - 0.8; x += 2.0) for (var zz = z.inner.z0 + 1.2; zz < z.inner.z1 - 0.8; zz += 2.0) {
        var g = new T.Group(); K.cyl(g, 0.4, 0.4, 0.03, M.marble, 0, 0.72, 0, 24); K.cyl(g, 0.04, 0.04, 0.72, M.black, 0, 0, 0, 8);
        [0, 1, 2, 3].forEach(function (i) { var c = F.chair(M.leather), a = i * Math.PI / 2; c.position.set(Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62); c.rotation.y = a + Math.PI; c.translateZ(-0.24); g.add(c); });
        z.putAt(x, zz, 1.6, 1.6, g, 'N', { solid: false });
      }
      z.decorate(2, seed);
    }
    function office(z, seed) {
      for (var x = z.inner.x0 + 1.0; x < z.inner.x1 - 0.8; x += 1.8) for (var zz = z.inner.z0 + 0.9; zz < z.inner.z1 - 1.0; zz += 2.0) { var g = F.desk(1.4); g.add((function () { var c = F.officeChair(); c.position.z = 0.55; return c; })()); z.putAt(x, zz, 1.4, 1.2, g, 'N', { solid: true }); }
      z.decorate(2, seed);
    }
    function warehouse(z, seed) {
      for (var x = z.inner.x0 + 1.2; x < z.inner.x1 - 1.2; x += 3.2) { var len = z.d - 4; if (len < 2) break; var g = new T.Group(); for (var l = 0; l < 4; l++) { K.box(g, 1.0, 0.06, len, M.alu, 0, l * 1.6 + 0.1, len / 2); } [-1, 1].forEach(function (s) { for (var k = 0; k <= Math.floor(len / 2.7); k++) K.box(g, 0.08, 6.0, 0.08, M.lacquerNavy, s * 0.46, 0, k * 2.7 + 0.04); }); for (var b = 0; b < 4; b++) for (var p = 0.6; p < len - 0.6; p += 1.3) K.box(g, 0.9, 0.9, 1.0, M.lacquerGreige, 0, b * 1.6 + 0.16, p); z.putAt(x, z.cz, 1.0, len, g, 'N', { solid: true }); }
    }
    function outdoorZone(z, seed) {
      var r = RNG(seed);
      if (li > 0) { // terraza
        var u = z.span(z.best({}), 2.0, 2.4, {}); if (u != null) z.put(z.best({}), u, 0.2, 2.0, 2.0, F.outdoorSet(), { solid: true });
        z.decorate(0, seed); var pu = z.span('N', 1.4, 0.5, {}); if (pu != null) z.put('N', pu, 0, 1.4, 0.5, F.planter(1.4, 0.5));
        return;
      }
      var big = z.w * z.d > 18;
      if (big) {
        var s = z.w > z.d ? 'N' : 'W', u2 = z.span(s, 2.0, 2.4, {}); if (u2 != null) z.put(s, u2, 0.4, 2.0, 2.0, F.outdoorSet(), { solid: true });
        var o = z.OPP[s], ou = z.span(o, 1.6, 1.9, {}); if (ou != null) { z.put(o, ou - 0.45, 0.3, 0.7, 1.9, F.lounger(), { solid: true }); z.put(o, ou + 0.45, 0.3, 0.7, 1.9, F.lounger(), { solid: true }); }
      }
      var n = Math.floor(z.w * z.d / 14);
      for (var i = 0; i < Math.min(n, 5); i++) { var t = F.tree(3 + r() * 2.5, seed + i); z.putAt(z.inner.x0 + 0.8 + r() * (z.w - 1.6), z.inner.z0 + 0.8 + r() * (z.d - 1.6), 0.9, 0.9, t, 'N', { solid: true, noBlob: true }); }
      ['N', 'S', 'W', 'E'].forEach(function (q) { if (!z.hasWall(q)) return; var rn = z.runs(q, 0.5)[0]; if (rn && rn[1] - rn[0] > 1.4) z.put(q, (rn[0] + rn[1]) / 2, 0, Math.min(rn[1] - rn[0], 4), 0.5, F.planter(Math.min(rn[1] - rn[0], 4), 0.5)); });
    }
    /* ---------- Escalera en U ---------- */
    function stairs(R, g, Hc, Hl) {
      var hasUp = li < model.length - 1, horiz = R.w >= R.h, Lg = (horiz ? R.w : R.h) - 0.16, S = (horiz ? R.h : R.w) - 0.16, x0 = R.x + 0.08, z0 = R.y + 0.08;
      var fw = Math.min(1.1, (S - 0.06) / 2), nR = Math.max(2, Math.ceil(Hl / 0.18)), rise = Hl / nR, n1 = Math.ceil(nR / 2), n2 = nR - n1, land = fw;
      var tread = Math.min(0.3, (Lg - land) / Math.max(n1, n2));
      // el arranque queda del lado de la puerta
      var sd = sidesOf(R, L.edges), da = [], flip = false;
      ['N', 'S', 'W', 'E'].forEach(function (k) { sd[k].doors.forEach(function (dv) { var m = (dv[0] + dv[1]) / 2; if (k === 'N' || k === 'S') da.push(horiz ? m - x0 : (k === 'N' ? 0 : Lg)); else da.push(horiz ? (k === 'W' ? 0 : Lg) : m - z0); }); });
      if (da.length && da.reduce(function (a, b) { return a + b; }, 0) / da.length > Lg / 2) flip = true;
      function P(a, b) { if (flip) a = Lg - a; return horiz ? [x0 + a, z0 + b] : [x0 + b, z0 + a]; } // a: a lo largo, b: a lo ancho
      function B(a, b, la, lb, y0, h, mat) { var p = P(a + la / 2, b + lb / 2); K.box(g, horiz ? la : lb, h, horiz ? lb : la, mat, p[0], y0, p[1]); }
      function RB(a0, b0, a1, b1) { var p = P(a0, b0), q = P(a1, b1); return { x0: Math.min(p[0], q[0]), z0: Math.min(p[1], q[1]), x1: Math.max(p[0], q[0]), z1: Math.max(p[1], q[1]) }; }
      var runLen = tread * Math.max(n1, n2), startA = Lg - land - runLen;
      var v0 = P(Math.max(0.3, startA - 0.45), fw / 2), v1 = P(Lg, fw / 2); R.stairView = { x: v0[0], z: v0[1], yaw: Math.atan2(-(v1[0] - v0[0]), -(v1[1] - v0[1])) };
      if (hasUp) {
        for (var i = 0; i < n1; i++) { var a = startA + i * tread; B(a, 0, tread, fw, (i + 1) * rise - 0.04, 0.04, M.oak); B(a, 0, 0.02, fw, i * rise, rise, M.trim); B(a, 0, tread, fw, 0, (i + 1) * rise - 0.04, M.trim); }
        B(Lg - land, 0, land, S, n1 * rise - 0.18, 0.18, M.trim); B(Lg - land, 0, land, S, n1 * rise - 0.04, 0.04, M.oak);
        for (i = 0; i < n2; i++) { var a2 = Lg - land - (i + 1) * tread, y = (n1 + i + 1) * rise; if (y > Hc - 0.02) break; B(a2, S - fw, tread, fw, y - 0.04, 0.04, M.oak); B(a2, S - fw, tread, fw, y - 0.3, 0.26, M.trim); }
        B(startA, fw, runLen, S - 2 * fw, 0, Hc, M.paint);
        // pasamanos de latón en el muro
        var h0 = P(startA, 0.04), h1 = P(startA + runLen, 0.04); tubeLine(g, [h0[0], 0.9, h0[1]], [h1[0], n1 * rise + 0.9, h1[1]]);
        blockers.push(RB(startA, 0, Lg, S));
        R.stairUp = true;
      }
      if (li > 0 && !hasUp) {
        // llegada desde abajo: hueco con barandal
        var hp = P(startA + runLen / 2, S - fw / 2);
        K.box(g, horiz ? runLen : fw, 0.02, horiz ? fw : runLen, new T.MeshBasicMaterial({ color: '#0d0f13' }), hp[0], 0.015, hp[1], { noShadow: true });
        for (i = 0; i < 6; i++) { var a3 = startA + runLen - (i + 1) * tread; B(a3, S - fw, tread, fw, -(i + 1) * rise + 0.02, 0.04, M.oak); }
        B(startA, S - fw - 0.02, runLen, 0.015, 0, 1.0, M.glass); B(startA, S - fw - 0.04, runLen, 0.05, 1.0, 0.04, M.walnut);
        blockers.push(RB(startA, S - fw - 0.05, startA + runLen, S));
      }
      R.stairDown = li > 0;
    }

    function tubeLine(g, a, b) { var d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = d.length(), m = new T.Mesh(K.G('rail', function () { return new T.CylinderGeometry(0.02, 0.02, 1, 10); }), M.brass); m.scale.y = l; m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; g.add(m); }
    /* ---------- Luz y hora ---------- */
    function updateSun() {
      var cx = W / 2, cz = D / 2, R = Math.max(W, D);
      var dir = hora === 'tarde' ? new T.Vector3(-0.75, 0.32, 0.58) : hora === 'noche' ? new T.Vector3(0.4, 0.8, 0.45) : new T.Vector3(-0.45, 0.85, 0.5);
      dir.normalize(); var base = L ? L.base : 0;
      sun.position.set(cx + dir.x * R * 1.5, dir.y * R * 1.5, cz + dir.z * R * 1.5); sun.target.position.set(cx, base, cz); sun.position.y += base;
      var c = sun.shadow.camera, e = R * 0.75 + 2; c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.near = 0.5; c.far = R * 4; c.updateProjectionMatrix();
      scene.background = X.sky(hora);
      if (hora === 'noche') { sun.color.set('#8FA6D8'); sun.intensity = 0.12; hemi.intensity = 0.06; hemi.color.set('#3A4A6A'); M.setLight(0.22, 2.6); renderer.toneMappingExposure = 1.05; }
      else if (hora === 'tarde') { sun.color.set('#FFB27A'); sun.intensity = 2.4; hemi.intensity = 0.3; hemi.color.set('#E4D2C0'); M.setLight(0.6, 1.6); renderer.toneMappingExposure = 1.05; }
      else { sun.color.set('#FFF3E0'); sun.intensity = 3.0; hemi.intensity = 0.45; hemi.color.set('#E8EEF5'); M.setLight(0.8, 1.0); renderer.toneMappingExposure = 1.0; }
      scene.fog = null;
    }
    function lightLevel() { return hora === 'noche' ? 7.5 : hora === 'tarde' ? 4.5 : 3.0; }
    function updatePool(dt) {
      if (!lightSpots.length) return;
      var px = pos.x, pz = pos.z, want = lightSpots.map(function (s) { var dx = s.x - px, dz = s.z - pz; return { s: s, d: dx * dx + dz * dz - (s.R === curRoom ? 1e6 : 0) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, NL).map(function (o) { return o.s; });
      var used = {};
      pool.forEach(function (pl) { var i = want.indexOf(pl.userData.spot); if (i >= 0) used[i] = pl; });
      pool.forEach(function (pl) {
        if (want.indexOf(pl.userData.spot) >= 0) { pl.userData.want = 1; return; }
        pl.userData.want = 0;
        if (pl.userData.cur < 0.02) { for (var i = 0; i < want.length; i++) if (!used[i]) { used[i] = pl; pl.userData.spot = want[i]; pl.position.set(want[i].x, L.base + L.Hc - 0.8, want[i].z); pl.distance = Math.max(5, want[i].d * 1.1); pl.userData.want = 1; break; } }
      });
      var lv = lightLevel(), moving = false;
      pool.forEach(function (pl) { var u = pl.userData, t = u.want * lv * (u.spot ? clamp(u.spot.R.area / 14, 0.55, 1.6) : 1); u.cur += (t / Math.max(lv, 0.01) - u.cur) * Math.min(1, dt * 5); if (Math.abs(u.cur * lv - pl.intensity) > 0.01) moving = true; pl.intensity = u.cur * lv; });
      return moving;
    }

    /* ---------- Movimiento y colisión ---------- */
    function roomAt(x, z) { var rs = L ? L.rooms : []; for (var i = 0; i < rs.length; i++) { var R = rs[i]; if (x >= R.x && x <= R.x + R.w && z >= R.y && z <= R.y + R.h) return R; } return null; }
    function collide(nx, nz, useBlockers) {
      var rad = 0.24;
      for (var it = 0; it < 3; it++) {
        solids.forEach(function (s) {
          var dx = s.x1 - s.x0, dz = s.z1 - s.z0, l2 = dx * dx + dz * dz, t = l2 ? clamp(((nx - s.x0) * dx + (nz - s.z0) * dz) / l2, 0, 1) : 0;
          var cx = s.x0 + dx * t, cz = s.z0 + dz * t, ex = nx - cx, ez = nz - cz, d = Math.sqrt(ex * ex + ez * ez), m = rad + s.t;
          if (d < m) { if (d < 1e-4) { ex = 0.01; ez = 0; d = 0.01; } nx = cx + ex / d * m; nz = cz + ez / d * m; }
        });
        if (useBlockers) blockers.forEach(function (b) {
          var cx = clamp(nx, b.x0, b.x1), cz = clamp(nz, b.z0, b.z1), ex = nx - cx, ez = nz - cz, d = Math.sqrt(ex * ex + ez * ez);
          if (d < rad) { if (d < 1e-4) { var dl = nx - b.x0, dr = b.x1 - nx, dt = nz - b.z0, db = b.z1 - nz, mn = Math.min(dl, dr, dt, db); if (mn === dl) nx = b.x0 - rad; else if (mn === dr) nx = b.x1 + rad; else if (mn === dt) nz = b.z0 - rad; else nz = b.z1 + rad; } else { nx = cx + ex / d * rad; nz = cz + ez / d * rad; } }
        });
      }
      // límites del terreno
      nx = clamp(nx, 0.25, W - 0.25); nz = clamp(nz, 0.25, D - 0.25);
      return [nx, nz];
    }
    function doorPoints(A, Bm) { // punto medio del vano entre dos espacios
      var e = L.edges.filter(function (e) { return ((e.A === A && e.B === Bm) || (e.A === Bm && e.B === A)) && e.open.some(function (o) { return o.y0 < 0.3 && o.kind !== 'win' && o.kind !== 'gdoor'; }); })[0];
      if (!e) return null; var o = e.open.filter(function (o) { return o.y0 < 0.3 && o.kind !== 'win' && o.kind !== 'gdoor'; })[0], m = (Math.max(o.lo, e.lo) + Math.min(o.hi, e.hi)) / 2;
      var inA = (A === e.A ? -e.out : e.out) * 0.55;
      return e.axis === 'x' ? [[m, e.c + inA], [m, e.c - inA]] : [[e.c + inA, m], [e.c - inA, m]];
    }
    function neighbors(R) { var out = []; L.edges.forEach(function (e) { if (!e.open.some(function (o) { return o.y0 < 0.3 && o.kind !== 'win' && o.kind !== 'gdoor'; })) return; if (e.A === R && e.B) out.push(e.B); else if (e.B === R) out.push(e.A); }); return out; }
    function route(from, to) {
      if (!from || !to || from === to) return [];
      var prev = {}, q = [from], seen = {}; seen[from.id] = true;
      while (q.length) { var c = q.shift(); if (c === to) break; neighbors(c).forEach(function (nb) { if (!seen[nb.id]) { seen[nb.id] = true; prev[nb.id] = c; q.push(nb); } }); }
      if (!seen[to.id]) return null;
      var chain = [to]; while (chain[0] !== from) chain.unshift(prev[chain[0].id]);
      var pts = []; for (var i = 0; i < chain.length - 1; i++) { var dp = doorPoints(chain[i], chain[i + 1]); if (dp) { pts.push(dp[0]); pts.push(dp[1]); } }
      return pts;
    }
    function walkTo(x, z, look) {
      var to = roomAt(x, z), from = roomAt(pos.x, pos.z), pts = route(from, to);
      if (pts === null) { teleport(x, z, look); return; }
      pts.push([x, z]); path = { pts: pts, i: 0, look: look }; ring.position.set(x, L.base + 0.035, z); ring.visible = true; ringT = 1.2; dirty = true;
    }
    function teleport(x, z, look) { pos.set(x, 0, z); if (look != null) yaw = look; path = null; dirty = true; }
    function viewpoint(R) { // junto a la entrada mirando a la esquina opuesta
      if (!R) return null;
      if (R.stairView) return { x: R.stairView.x, z: R.stairView.z, yaw: R.stairView.yaw };
      var parent = R.parent || (R === L.start ? null : neighbors(R)[0]);
      var p = parent ? doorPoints(parent, R) : null, x, z;
      if (p) { x = p[1][0]; z = p[1][1]; }
      else if (R === L.start && L.entry) { var e = L.entry, o = e.open.filter(function (q) { return q.kind === 'entry'; })[0], m = (o.lo + o.hi) / 2, inw = (e.A === R ? -e.out : e.out); x = e.axis === 'x' ? m : e.c + inw * 0.7; z = e.axis === 'x' ? e.c + inw * 0.7 : m; }
      else { x = R.x + R.w / 2; z = R.y + R.h / 2; }
      // foto de interiorista: desde la esquina libre más cercana a la entrada, mirando en diagonal
      var cx = R.x + R.w / 2, cz = R.y + R.h / 2, ins = Math.min(0.5, R.w / 4, R.h / 4);
      function freeAt(px, pz) { for (var i = 0; i < furn.length; i++) { var f = furn[i]; if (px > f.x0 - 0.3 && px < f.x1 + 0.3 && pz > f.z0 - 0.3 && pz < f.z1 + 0.3) return false; } return true; }
      var cands = [[R.x + ins, R.y + ins], [R.x + R.w - ins, R.y + ins], [R.x + ins, R.y + R.h - ins], [R.x + R.w - ins, R.y + R.h - ins]].filter(function (c) { return freeAt(c[0], c[1]); })
        .sort(function (a, b) { return Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z); });
      var big = R.w * R.h > 6 && !R.ext, pick = big && cands[0] && Math.hypot(cands[0][0] - x, cands[0][1] - z) < Math.max(R.w, R.h) * 0.75 ? cands[0] : null;
      if (!pick && p && R.w * R.h < 7.5) { // espacio chico: se ve desde el vano, un paso atrás
        var bx2 = p[0][0] + (p[0][0] - p[1][0]) * 0.6, bz2 = p[0][1] + (p[0][1] - p[1][1]) * 0.6, qb = collide(bx2, bz2, false);
        return { x: qb[0], z: qb[1], yaw: Math.atan2(-(cx - qb[0]), -(cz - qb[1])) };
      }
      var px2 = pick ? pick[0] : x + (cx - x) * 0.25, pz2 = pick ? pick[1] : z + (cz - z) * 0.25;
      var q = collide(px2, pz2, true), tx = cx + (cx - q[0]) * 0.6, tz = cz + (cz - q[1]) * 0.6;
      if (R.stairUp || R.stairDown) { tx = cx; tz = cz; }
      return { x: q[0], z: q[1], yaw: Math.atan2(-(tx - q[0]), -(tz - q[1])) };
    }
    function step(dt) {
      var moved = false, sp = (keys.ShiftLeft || keys.ShiftRight ? 2.8 : 1.5) * dt;
      var f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + stick.y, sdir = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + stick.x;
      if (keys.ArrowLeft) { yaw += 1.6 * dt; moved = true; } if (keys.ArrowRight) { yaw -= 1.6 * dt; moved = true; }
      if (f || sdir) {
        path = null; tour = null;
        var dx = -Math.sin(yaw) * f + Math.cos(yaw) * sdir, dz = -Math.cos(yaw) * f - Math.sin(yaw) * sdir, l = Math.min(1, Math.sqrt(dx * dx + dz * dz)) / (Math.sqrt(dx * dx + dz * dz) || 1);
        var q = collide(pos.x + dx * l * sp, pos.z + dz * l * sp, true); pos.x = q[0]; pos.z = q[1]; moved = true;
      }
      if (path) {
        var tgt = path.pts[path.i], ex = tgt[0] - pos.x, ez = tgt[1] - pos.z, d = Math.sqrt(ex * ex + ez * ez), v = 1.7 * dt;
        if (d < v + 0.02) { pos.x = tgt[0]; pos.z = tgt[1]; path.i++; if (path.i >= path.pts.length) { var lk = path.look; path = null; if (lk != null) lookTo = lk; if (tour) tour.wait = 2.6; } }
        else {
          var q2 = collide(pos.x + ex / d * v, pos.z + ez / d * v, false); pos.x = q2[0]; pos.z = q2[1];
          var want = Math.atan2(-ex, -ez), dyaw = ((want - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; if (d > 0.4) yaw += dyaw * Math.min(1, dt * 3);
        }
        moved = true;
      }
      if (lookTo != null) { var dy2 = ((lookTo - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; yaw += dy2 * Math.min(1, dt * 3); if (Math.abs(dy2) < 0.01) lookTo = null; moved = true; }
      if (tour && !path) {
        tour.wait -= dt; yaw += Math.sin(tour.t += dt * 0.6) * dt * 0.25; moved = true;
        if (tour.wait <= 0) nextTour();
      }
      if (ringT > 0) { ringT -= dt; ring.material.opacity = Math.min(0.9, ringT); if (ringT <= 0) ring.visible = false; moved = true; }
      var R = roomAt(pos.x, pos.z); if (R !== curRoom) { curRoom = R; if (opts.onRoom) opts.onRoom(R, L); }
      return moved;
    }
    var lookTo = null;
    function nextTour() {
      if (!tour) return;
      var R = tour.list[tour.i++];
      if (!R) { tour = null; if (opts.onTour) opts.onTour(false); return; }
      var vp = viewpoint(R); if (!vp) { nextTour(); return; }
      walkTo(vp.x, vp.z, vp.yaw); tour.wait = 2.6; tour.t = 0;
    }

    /* ---------- Entrada: mirar, caminar, tocar ---------- */
    var stick = { x: 0, y: 0 }, drag = null, ray = new T.Raycaster(), ndc = new T.Vector2();
    function pickFloor(cx, cy) {
      var rc = canvas.getBoundingClientRect(); ndc.set((cx - rc.left) / rc.width * 2 - 1, -(cy - rc.top) / rc.height * 2 + 1); ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects(picks.concat(floors), false);
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i]; if (h.distance < 0.2) continue;
        if (floors.indexOf(h.object) >= 0) return h.point;
        if (h.face && h.face.normal.y > 0.7 && h.point.y < L.base + 0.4) return h.point;
        // muro: caminar hasta el punto frente a él
        var b = h.point.clone(); b.y = 0; var back = new T.Vector3(pos.x - b.x, 0, pos.z - b.z).normalize().multiplyScalar(0.5); b.add(back); return b;
      }
      return null;
    }
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return; canvas.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
      tour = null; if (opts.onTour) opts.onTour(false); hideHint();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      var k = (e.pointerType === 'touch' ? 0.006 : 0.0045) * (camera.fov / 70);
      yaw += dx * k; pitch = clamp(pitch + dy * k, -1.2, 1.0); lookTo = null; dirty = true;
    });
    function up(e) {
      if (!drag || drag.id !== e.pointerId) return;
      var tap = drag.moved < 8 && performance.now() - drag.t < 450; drag = null;
      if (tap) { var p = pickFloor(e.clientX, e.clientY); if (p) walkTo(p.x, p.z); }
    }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', function () { drag = null; });
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); camera.fov = clamp(camera.fov + e.deltaY * 0.03, 40, 85); camera.updateProjectionMatrix(); dirty = true; }, { passive: false });
    canvas.tabIndex = 0;
    function onKey(e, v) {
      if (!running) return; var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (/^(KeyW|KeyA|KeyS|KeyD|Arrow\w+|ShiftLeft|ShiftRight)$/.test(e.code)) { if (!visibleOnScreen()) return; keys[e.code] = v; if (/^Arrow/.test(e.code) || /^Key[WASD]$/.test(e.code)) e.preventDefault(); if (v) { tour = null; hideHint(); } }
    }
    window.addEventListener('keydown', function (e) { onKey(e, true); }); window.addEventListener('keyup', function (e) { onKey(e, false); });
    window.addEventListener('blur', function () { keys = {}; });
    function visibleOnScreen() { var r = canvas.getBoundingClientRect(); return r.bottom > 60 && r.top < innerHeight - 60 && r.width > 0; }
    var hintHidden = false; function hideHint() { if (!hintHidden && opts.onInteract) { hintHidden = true; opts.onInteract(); } }

    /* ---------- Bucle ---------- */
    function resize() {
      var w = canvas.clientWidth || 640, h = canvas.clientHeight || 400;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      var hf = (w / h < 1 ? 86 : 78) * Math.PI / 180; camera.fov = clamp(2 * Math.atan(Math.tan(hf / 2) / camera.aspect) * 180 / Math.PI, 48, 92);
      camera.updateProjectionMatrix(); dirty = true;
    }
    var visible = true;
    if (global.IntersectionObserver) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; dirty = true; }).observe(canvas);
    function frame(t) {
      raf = 0; if (!running) return;
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
      if (!visible || document.hidden || !L) return;
      var mv = step(dt), lm = updatePool(dt);
      if (mv || lm || dirty) {
        camera.position.set(pos.x, L.base + eye, pos.z); camera.rotation.set(pitch, yaw, 0, 'YXZ');
        renderer.render(scene, camera); dirty = false;
        if (opts.onMove) opts.onMove(pos.x, pos.z, yaw);
      }
    }
    resize();

    return {
      setModel: function (levels, w, d, keep) {
        var prevLevel = li, prevPos = pos.clone(), prevYaw = yaw, prevRoom = curRoom ? curRoom.label : null;
        model = levels; W = w; D = d; buildOutdoor();
        var idx = keep ? Math.min(prevLevel, model.length - 1) : 0; buildLevel(idx);
        var same = keep && roomAt(prevPos.x, prevPos.z); if (same && same.label === prevRoom) { pos.copy(prevPos); yaw = prevYaw; } else this.gotoStart();
        dirty = true;
      },
      level: function (i, arrive) {
        if (!model || i < 0 || i >= model.length) return; tour = null; path = null; buildLevel(i);
        var st = L.rooms.filter(function (R) { return /Escalera/.test(R.n); })[0];
        if (arrive && st) { var vp = viewpoint(st); teleport(vp.x, vp.z, vp.yaw); } else this.gotoStart();
      },
      gotoStart: function () {
        var R = L.start || L.rooms.filter(isInt)[0]; var vp = viewpoint(R); if (vp) teleport(vp.x, vp.z, vp.yaw); pitch = -0.05; curRoom = null;
      },
      gotoRoom: function (id, walk) { var R = L.rooms.filter(function (r) { return r.id === id; })[0]; var vp = viewpoint(R); if (!vp) return; tour = null; if (walk) walkTo(vp.x, vp.z, vp.yaw); else teleport(vp.x, vp.z, vp.yaw); pitch = -0.05; },
      walkPoint: function (x, z) { walkTo(x, z); },
      tour: function (on) {
        if (!on) { tour = null; return; }
        var order = [], seen = {}, q = [L.start];
        if (!L.start) return; seen[L.start.id] = true;
        while (q.length) { var c = q.shift(); order.push(c); neighbors(c).forEach(function (nb) { if (!seen[nb.id] && (!nb.ext || nb.reachable)) { seen[nb.id] = true; q.push(nb); } }); }
        tour = { list: order, i: 0, wait: 0, t: 0 }; nextTour();
      },
      setHora: function (h) { hora = h; updateSun(); renderer.shadowMap.needsUpdate = true; dirty = true; },
      resize: resize,
      start: function () { if (running) return; running = true; lastT = 0; dirty = true; raf = requestAnimationFrame(frame); },
      stop: function () { running = false; keys = {}; if (raf) cancelAnimationFrame(raf); raf = 0; },
      snapshot: function () { camera.position.set(pos.x, L.base + eye, pos.z); camera.rotation.set(pitch, yaw, 0, 'YXZ'); renderer.render(scene, camera); return canvas.toDataURL('image/jpeg', 0.92); },
      setStick: function (x, y) { stick.x = x; stick.y = y; if (x || y) { tour = null; hideHint(); } },
      state: function () { return { x: pos.x, z: pos.z, yaw: yaw, level: li, room: curRoom, L: L, W: W, D: D }; },
      stats: function () { return renderer.info; }
    };
  }

  global.RinovaRecorrido = { create: create, buildModel: buildModel, load: function () { return global.RinovaRender3D ? global.RinovaRender3D.load() : Promise.reject(new Error('Motor 3D no disponible')); }, webgl: function () { return global.RinovaRender3D && global.RinovaRender3D.webgl(); } };
})(window);
