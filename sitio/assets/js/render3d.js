/* RINOVAIA — Render 3D del proyecto con giro 360°.
   Construye un modelo volumétrico (three.js, autoalojado en assets/js/vendor) a partir de la misma
   especificación de fachada que dibuja el alzado (RinovaFachada.spec): terreno, volúmenes por nivel,
   vanos, cancelería, celosías, balcones, volado, pérgola, cubierta, jardineras y luz según la hora.
   Controles propios: arrastrar para girar, rueda o pellizco para acercar, giro automático y grabación
   de una vuelta completa en video (MediaRecorder). Se carga solo cuando se abre la vista 3D. */
(function (global) {
  'use strict';
  var THREE_SRC = 'assets/js/vendor/three.min.js?v=0.160.1';
  var loading = null;
  function load() {
    if (global.THREE) return Promise.resolve(global.THREE);
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var sc = document.createElement('script');
      sc.src = THREE_SRC; sc.async = true;
      sc.onload = function () { global.THREE ? res(global.THREE) : rej(new Error('three.js no cargó')); };
      sc.onerror = function () { loading = null; rej(new Error('No se pudo cargar el motor 3D. Revisa tu conexión.')); };
      document.head.appendChild(sc);
    });
    return loading;
  }
  function webgl() {
    try { var c = document.createElement('canvas'); return !!(global.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }

  /* ---------- Texturas procedurales (1 mosaico = TILE metros) ---------- */
  var TILE = 2.4;
  function canvasTex(T, draw, px) {
    var c = document.createElement('canvas'); c.width = c.height = px || 256;
    var g = c.getContext('2d'); draw(g, c.width);
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function matTexture(T, M) {
    return canvasTex(T, function (g, n) {
      var k = n / TILE; // px por metro
      g.fillStyle = M.c; g.fillRect(0, 0, n, n);
      var t = M.tex, x, y, i;
      g.strokeStyle = M.c2; g.fillStyle = M.c2;
      if (t === 'tablero') { g.lineWidth = 1.5; for (y = 0; y <= n; y += 0.6 * k) { g.beginPath(); g.moveTo(0, y); g.lineTo(n, y); g.stroke(); } for (x = 0; x <= n; x += 1.2 * k) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, n); g.stroke(); }
        for (y = 0; y < n; y += 0.6 * k) for (x = 0; x < n; x += 1.2 * k) [[.15, .2], [.85, .2], [.15, .8], [.85, .8]].forEach(function (q) { g.beginPath(); g.arc(x + q[0] * 1.2 * k, y + q[1] * 0.6 * k, 1.6, 0, 7); g.fill(); }); }
      else if (t === 'ladrillo') { var bh = 0.15 * k, bw = 0.3 * k; for (i = 0, y = 0; y < n; y += bh, i++) for (x = -(i % 2) * bw / 2; x < n; x += bw) { g.fillStyle = (Math.floor(x + y) % 3) ? M.c : M.c2; g.fillRect(x + 1, y + 1, bw - 2, bh - 2); } g.fillStyle = '#D3C4B6'; g.globalAlpha = .55; for (y = 0; y < n; y += bh) g.fillRect(0, y, n, 1.2); g.globalAlpha = 1; }
      else if (t === 'piedra') { g.fillStyle = M.c2; g.fillRect(0, 0, n, n); var rs = 17; for (y = 0; y < n; y += 0.4 * k) for (x = -((y / k * 10) % 3) * 8; x < n; x += (0.45 + ((rs = (rs * 73) % 101) / 101) * 0.5) * k) { g.fillStyle = (rs % 3) ? M.c : '#9B8D78'; g.fillRect(x + 2, y + 2, (0.4 + (rs % 7) / 14) * k - 4, 0.4 * k - 4); } }
      else if (t === 'sillar') { g.lineWidth = 1.4; for (i = 0, y = 0; y <= n; y += 0.4 * k, i++) { g.beginPath(); g.moveTo(0, y); g.lineTo(n, y); g.stroke(); for (x = (i % 2) * 0.4 * k; x < n; x += 0.8 * k) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 0.4 * k); g.stroke(); } } }
      else if (t === 'madera') { for (x = 0, i = 0; x < n; x += 0.15 * k, i++) { g.fillStyle = i % 2 ? M.c2 : M.c; g.globalAlpha = .65 + (i % 3) * .12; g.fillRect(x, 0, 0.15 * k - 1.5, n); } g.globalAlpha = 1; }
      else if (t === 'panel') { g.lineWidth = 2; for (y = 0; y <= n; y += 1.2 * k) { g.beginPath(); g.moveTo(0, y); g.lineTo(n, y); g.stroke(); } for (x = 0; x <= n; x += 1.2 * k) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, n); g.stroke(); } }
      else { g.globalAlpha = .06; for (i = 0; i < 400; i++) { g.fillStyle = i % 2 ? '#000' : '#fff'; g.fillRect((i * 97) % n, (i * 57) % n, 2, 2); } g.globalAlpha = 1; }
    });
  }
  // Ajusta las UV de una caja para que la textura conserve su escala en metros en todas las caras.
  function boxUV(geo, w, h, d) {
    var uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (var f = 0; f < 6; f++) for (var v = 0; v < 4; v++) { var i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / TILE, uv.getY(i) * dims[f][1] / TILE); }
    uv.needsUpdate = true; return geo;
  }
  function skyTexture(T, hora) {
    var c = document.createElement('canvas'); c.width = 16; c.height = 256;
    var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    var st = hora === 'noche' ? [['#05070D', 0], ['#0E1626', .38], ['#232B42', .5], ['#0B0F17', .56], ['#06080C', 1]]
      : hora === 'tarde' ? [['#1E2C4E', 0], ['#5E5F82', .3], ['#E2A37A', .46], ['#F6CF9C', .5], ['#776A62', .56], ['#3B3A3E', 1]]
        : [['#5E95CF', 0], ['#A9C9E8', .34], ['#E6EFF7', .5], ['#AEB2AE', .56], ['#6F746F', 1]];
    st.forEach(function (s) { gr.addColorStop(s[1], s[0]); });
    g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
    var t = new T.CanvasTexture(c); t.mapping = T.EquirectangularReflectionMapping; t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  /* ---------- Escena ---------- */
  function create(canvas, opts) {
    var T = global.THREE;
    opts = opts || {};
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    var mobile = Math.min(screen.width, screen.height) < 700;
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, mobile ? 1.75 : 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(38, 16 / 10, 0.3, 900);
    var pmrem = new T.PMREMGenerator(renderer);
    var root = new T.Group(); scene.add(root);
    var sun = new T.DirectionalLight(0xffffff, 2.4); sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    var hemi = new T.HemisphereLight(0xdfe8f2, 0x6b6656, 0.9); scene.add(hemi);
    var state = { spec: null, hora: 'tarde', spin: true, az: 0.62, el: 0.26, rad: 30, tAz: 0.62, tEl: 0.26, tRad: 30, target: new T.Vector3(0, 4, 0), rec: false, dirty: true, lat: 19.4, month: 6, visible: true };
    var envRT = null, disposables = [];

    function track(x) { disposables.push(x); return x; }
    function clear() {
      while (root.children.length) root.remove(root.children[0]);
      disposables.forEach(function (d) { if (d && d.dispose) d.dispose(); }); disposables = [];
    }
    function M(o) { return track(new T.MeshStandardMaterial(o)); }

    function build(s) {
      clear();
      var night = state.hora === 'noche', dusk = state.hora === 'tarde';
      var W = s.W, D = s.D, H = s.H, X0 = -W / 2, ZF = D / 2;
      var p = s.p, flat = s.roof === 'plano', bodyTop = H + (flat ? s.parapet : 0);
      // Materiales
      var mMain = M({ map: track(matTexture(T, s.M)), roughness: 0.88 });
      var mAcc = M({ map: track(matTexture(T, s.A)), roughness: 0.8 });
      var mBase = M({ map: track(matTexture(T, { c: '#A69882', c2: '#857861', tex: 'piedra' })), roughness: 0.95 });
      var mWhite = M({ color: 0xE9EAEC, roughness: 0.7 });
      var mFrame = M({ color: new T.Color(s.C.c), roughness: 0.45, metalness: s.fx.cancel === 'madera' ? 0 : 0.6 });
      var mGlass = night ? M({ color: 0x3a2a14, emissive: 0xF2B65C, emissiveIntensity: 0.9, roughness: 0.2 })
        : M({ color: 0x1b2635, roughness: 0.04, metalness: 0.92, envMapIntensity: 1.25 });
      var mRail = track(new T.MeshPhysicalMaterial({ color: 0xcfe3ef, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.32 }));
      var wood = s.fx.acento === 'madera' || s.fx.estilo === 'tropical';
      var mSlat = M({ color: wood ? 0x8A5A36 : s.fx.cancel === 'bronce' ? 0xA8894E : 0x2B3038, roughness: 0.7, metalness: wood ? 0 : 0.5 });
      var mDark = M({ color: 0x262B33, roughness: 0.6 });
      var mDoor = M({ color: s.fx.cancel === 'madera' || wood ? 0x7A5032 : 0x2A3140, roughness: 0.55 });
      var mGrass = M({ color: night ? 0x1a2a1e : 0x5d8a4c, roughness: 1 });
      var mConc = M({ color: night ? 0x3a3f47 : 0xC7CBD0, roughness: 0.95 });
      var mAsph = M({ color: night ? 0x15181d : 0x4a4f57, roughness: 1 });
      var mLeaf = [M({ color: night ? 0x14231a : 0x4C7444, roughness: 0.9, flatShading: true }), M({ color: night ? 0x1a2c20 : 0x5F8A52, roughness: 0.9, flatShading: true })];
      var mTrunk = M({ color: 0x5A4632, roughness: 0.9 });
      var mTeja = M({ map: track(canvasTex(T, function (g, n) { g.fillStyle = '#A9523A'; g.fillRect(0, 0, n, n); var k = n / TILE; for (var y = 0; y < n; y += 0.25 * k) for (var x = 0; x < n; x += 0.3 * k) { g.fillStyle = (x + y) % 3 ? '#B9603F' : '#9E4A33'; g.beginPath(); g.ellipse(x + 0.15 * k, y + 0.2 * k, 0.14 * k, 0.11 * k, 0, 0, 7); g.fill(); } })), roughness: 0.8 });

      // Lotes de cajas instanciadas por material (parteluces, barrotes, montantes)
      var batches = new Map();
      function bx(mat, w, h, d, x, y, z, cast) {
        if (w <= 0 || h <= 0 || d <= 0) return;
        var key = mat.uuid; if (!batches.has(key)) batches.set(key, { mat: mat, items: [], cast: cast !== false });
        batches.get(key).items.push([w, h, d, x, y, z]);
      }
      function flush() {
        var unit = track(new T.BoxGeometry(1, 1, 1)), m4 = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3();
        batches.forEach(function (b) {
          var im = new T.InstancedMesh(unit, b.mat, b.items.length);
          b.items.forEach(function (it, i) { m4.compose(v.set(it[3], it[4], it[5]), q, sc.set(it[0], it[1], it[2])); im.setMatrixAt(i, m4); });
          im.castShadow = b.cast; im.receiveShadow = true; root.add(im);
        });
      }
      function box(mat, w, h, d, x, y, z, uv) {
        var g = track(new T.BoxGeometry(w, h, d)); if (uv) boxUV(g, w, h, d);
        var m = new T.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; root.add(m); return m;
      }

      // ---- Terreno, banqueta y calle
      var lot = s.lot, LW = Math.max(lot.W, W + 1), LD = Math.max(lot.D, D + 3), lotZF = ZF + lot.setback, lotZ0 = lotZF - LD;
      var ground = new T.Mesh(track(new T.PlaneGeometry(400, 400)), M({ color: night ? 0x11151b : 0x8d9188, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; root.add(ground);
      box(mGrass, LW, 0.06, LD, 0, 0.01, lotZ0 + LD / 2);
      box(mConc, LW + 30, 0.16, 2.4, 0, 0.06, lotZF + 1.2);
      box(mAsph, 400, 0.04, 9, 0, 0.0, lotZF + 2.4 + 4.5);
      for (var lx = -60; lx < 60; lx += 6) box(M({ color: 0xE9E3CF, roughness: 0.8 }), 3, 0.02, 0.15, lx, 0.03, lotZF + 2.4 + 4.5);
      // bardas laterales y posterior bajas
      var mWall = M({ color: night ? 0x50555e : 0xD9D6CF, roughness: 0.9 });
      box(mWall, 0.15, 1.2, LD, -LW / 2, 0.6, lotZ0 + LD / 2); box(mWall, 0.15, 1.2, LD, LW / 2, 0.6, lotZ0 + LD / 2); box(mWall, LW, 1.2, 0.15, 0, 0.6, lotZ0);
      // andador y cochera
      var door = s.ops.filter(function (o) { return o.kind === 'door'; })[0], garage = s.ops.filter(function (o) { return o.kind === 'garage'; })[0];
      if (door) box(mConc, door.w + 0.6, 0.08, lot.setback, X0 + door.x + door.w / 2, 0.05, ZF + lot.setback / 2);
      if (garage) box(M({ color: night ? 0x2b2f35 : 0xB7BBC1, roughness: 0.95 }), garage.w + 0.6, 0.09, lot.setback, X0 + garage.x + garage.w / 2, 0.05, ZF + lot.setback / 2);
      s.ops.filter(function (o) { return o.kind === 'roll'; }).forEach(function (o) { box(mConc, o.w + 1, 0.09, lot.setback, X0 + o.x + o.w / 2, 0.05, ZF + lot.setback / 2); });

      // ---- Volúmenes
      var a = s.accent, aY = a ? s.levels[a.from].y : 0, PROJ = 0.35;
      if (a) {
        if (aY > 0) box(mMain, W, aY, D, 0, aY / 2, 0, true);
        box(mMain, a.x0, bodyTop - aY, D, X0 + a.x0 / 2, aY + (bodyTop - aY) / 2, 0, true);
        var aw = a.x1 - a.x0 + s.cant;
        box(mAcc, aw, bodyTop - aY, D + PROJ, X0 + a.x0 + aw / 2, aY + (bodyTop - aY) / 2, PROJ / 2, true);
      } else box(mMain, W, bodyTop, D, 0, bodyTop / 2, 0, true);
      if (s.base) { var bwid = (a && a.from === 0 ? a.x0 : W) + 0.08; box(mBase, bwid, s.levels[0].h, D + 0.08, X0 + bwid / 2 - 0.04, s.levels[0].h / 2, 0, true); }
      // losas / impostas
      s.levels.slice(1).forEach(function (lv) {
        var band = s.fx.estilo === 'colonial' || s.fx.estilo === 'mediterraneo' ? 0.18 : 0.28;
        var ext = a && lv.i >= a.from ? s.cant : 0;
        box(s.fx.estilo === 'industrial' ? mDark : s.fx.estilo === 'colonial' ? mAcc : mWhite, W + 0.24 + ext, band, D + 0.24 + (a ? PROJ : 0), ext / 2, lv.y, (a ? PROJ / 2 : 0));
      });
      if (flat) box(mWhite, W + 0.2 + (a ? s.cant : 0), 0.14, D + 0.2 + (a ? PROJ : 0), (a ? s.cant / 2 : 0), bodyTop + 0.07, (a ? PROJ / 2 : 0));
      else {
        // Cubierta de teja a cuatro aguas
        var ov = 0.55, rh = Math.min(3.2, W * 0.16), x1 = X0 - ov, x2 = -X0 + ov, z1 = -ZF - ov, z2 = ZF + ov, rx1 = X0 + W * 0.22, rx2 = -X0 - W * 0.22, yb = H + 0.1, yt = yb + rh;
        var pos = [x1, yb, z2, x2, yb, z2, rx2, yt, 0, x1, yb, z2, rx2, yt, 0, rx1, yt, 0, x2, yb, z1, x1, yb, z1, rx1, yt, 0, x2, yb, z1, rx1, yt, 0, rx2, yt, 0, x1, yb, z1, x1, yb, z2, rx1, yt, 0, x2, yb, z2, x2, yb, z1, rx2, yt, 0];
        var rg = track(new T.BufferGeometry()); rg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        var uvs = []; for (var u = 0; u < pos.length; u += 3) uvs.push(pos[u] / TILE, (pos[u + 2] + pos[u + 1]) / TILE);
        rg.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); rg.computeVertexNormals();
        var roof = new T.Mesh(rg, mTeja); roof.castShadow = true; roof.receiveShadow = true; root.add(roof);
        box(M({ color: 0x6B3422, roughness: 0.8 }), W + 2 * ov, 0.22, D + 2 * ov, 0, H + 0.11, 0);
      }

      // ---- Vanos (frente y fondo)
      function zFace(op) { return (a && op.lvl >= a.from && op.x >= a.x0 - 0.01) ? ZF + PROJ : ZF; }
      function xOf(op) { return X0 + op.x + (a && op.lvl >= a.from && op.x >= a.x0 - 0.01 ? s.cant : 0); }
      function opening(op, back) {
        var lv = s.levels[op.lvl], y0 = lv.y + op.y, z = back ? -ZF : zFace(op), dir = back ? -1 : 1, x = xOf(op) + op.w / 2, fr = 0.06;
        if (back && (op.kind === 'garage' || op.kind === 'roll' || op.kind === 'door')) { op = Object.assign({}, op, { kind: 'win', y: 0.5, h: Math.max(0.8, op.h - 0.5) }); y0 = lv.y + 0.5; }
        if (op.kind === 'garage') {
          box(mFrame, op.w + 0.24, op.h + 0.12, 0.1, x, y0 + (op.h + 0.12) / 2, z + dir * 0.02);
          var gd = box(M({ map: track(canvasTex(T, function (g, n) { g.fillStyle = wood ? '#8E5F3B' : '#3A414C'; g.fillRect(0, 0, n, n); g.fillStyle = 'rgba(0,0,0,.28)'; for (var yy = 0; yy < n; yy += n / 15) g.fillRect(0, yy, n, 2); })), roughness: 0.6, metalness: wood ? 0 : 0.4 }), op.w, op.h, 0.06, x, y0 + op.h / 2, z + dir * 0.06);
          return gd;
        }
        if (op.kind === 'roll') { box(mFrame, op.w + 0.4, 0.18, 0.2, x, y0 + op.h + 0.5, z + dir * 0.1); box(M({ color: 0x8E96A2, roughness: 0.5, metalness: 0.5 }), op.w, op.h, 0.06, x, y0 + op.h / 2, z + dir * 0.04); return; }
        if (op.frame) box(mAcc, op.w + 0.36, op.h + 0.42, 0.08, x, y0 + op.h / 2 + 0.05, z + dir * 0.03);
        var gm = op.kind === 'door' && p.type === 'casa' ? mDoor : mGlass;
        if (op.arch) {
          var sh = new T.Shape(), rr = op.w / 2; sh.moveTo(-rr, 0); sh.lineTo(-rr, op.h - rr); sh.absarc(0, op.h - rr, rr, Math.PI, 0, true); sh.lineTo(rr, 0); sh.lineTo(-rr, 0);
          var fg = track(new T.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false, curveSegments: 16 }));
          var fm = new T.Mesh(fg, mFrame); fm.position.set(x, y0, z - 0.03); if (back) { fm.rotation.y = Math.PI; fm.position.z = z + 0.03; } root.add(fm);
          var sh2 = new T.Shape(), ri = rr - fr; sh2.moveTo(-ri, fr); sh2.lineTo(-ri, op.h - rr); sh2.absarc(0, op.h - rr, ri, Math.PI, 0, true); sh2.lineTo(ri, fr); sh2.lineTo(-ri, fr);
          var gmz = new T.Mesh(track(new T.ShapeGeometry(sh2, 16)), gm); gmz.position.set(x, y0, z + dir * 0.055); if (back) gmz.rotation.y = Math.PI; root.add(gmz);
          bx(mFrame, fr, op.h, 0.07, x, y0 + op.h / 2, z + dir * 0.05);
        } else {
          box(mFrame, op.w, op.h, 0.1, x, y0 + op.h / 2, z + dir * 0.01);
          box(gm, op.w - 2 * fr, op.h - 2 * fr, 0.04, x, y0 + op.h / 2, z + dir * 0.05);
          var nv = op.grid ? Math.max(2, Math.round(op.w / 0.6)) : op.strip ? Math.max(2, Math.round(op.w / 1.6)) : op.w > 1.6 ? 2 : 1;
          for (var m = 1; m < nv; m++) bx(mFrame, fr * 0.8, op.h, 0.07, xOf(op) + op.w * m / nv, y0 + op.h / 2, z + dir * 0.06);
          if (op.grid) for (var n = 1; n < 3; n++) bx(mFrame, op.w, fr * 0.8, 0.07, x, y0 + op.h * n / 3, z + dir * 0.06);
        }
        // balcón
        if (op.balcony && !back) {
          var bw2 = op.w + 0.5, bdep = 1.2, yb2 = lv.y;
          box(mWhite, bw2, 0.2, bdep, x, yb2 + 0.04, z + bdep / 2);
          bx(mRail, bw2, 1.0, 0.03, x, yb2 + 0.64, z + bdep - 0.03, false); bx(mRail, 0.03, 1.0, bdep, x - bw2 / 2, yb2 + 0.64, z + bdep / 2, false); bx(mRail, 0.03, 1.0, bdep, x + bw2 / 2, yb2 + 0.64, z + bdep / 2, false);
          bx(mFrame, bw2, 0.05, 0.05, x, yb2 + 1.14, z + bdep - 0.03);
        }
        if (op.frame && op.lvl > 0 && !back) {
          var hw = op.w + 0.6; box(mAcc, hw, 0.14, 0.6, x, y0 - 0.02, z + 0.3);
          for (var hx = -hw / 2 + 0.05; hx <= hw / 2; hx += 0.12) bx(mDark, 0.02, 0.9, 0.02, x + hx, y0 + 0.45, z + 0.58);
          bx(mDark, hw, 0.04, 0.04, x, y0 + 0.9, z + 0.58);
        }
      }
      s.ops.forEach(function (op) { opening(op, false); });
      s.ops.forEach(function (op) { if (op.kind !== 'door' || p.type !== 'casa') opening(op, true); });
      // ventanas laterales
      s.levels.forEach(function (lv) {
        if (D < 7) return;
        [-1, 1].forEach(function (side) {
          var xs = side < 0 ? X0 : (a && lv.i >= a.from ? -X0 + s.cant : -X0), wl = Math.min(2.4, D * 0.22), hl = lv.h * 0.5, yl = lv.y + lv.h * 0.3;
          [ZF - D * 0.3, -ZF + D * 0.25].forEach(function (zc) {
            box(mFrame, 0.1, hl, wl, xs + side * 0.01, yl + hl / 2, zc);
            box(mGlass, 0.04, hl - 0.12, wl - 0.12, xs + side * 0.05, yl + hl / 2, zc);
          });
        });
      });

      // ---- Celosía
      if (s.celosia) {
        var ce = s.celosia, cy0 = s.levels[ce.from].y + 0.15, cy1 = H - 0.1, shift = a ? s.cant : 0, cz = (a ? ZF + PROJ : ZF) + 0.32;
        for (var cx = ce.x0 + 0.15; cx <= ce.x1 - 0.15; cx += 0.2) bx(mSlat, 0.07, cy1 - cy0, 0.16, X0 + cx + shift, (cy0 + cy1) / 2, cz);
        bx(mSlat, ce.x1 - ce.x0 - 0.2, 0.1, 0.4, X0 + (ce.x0 + ce.x1) / 2 + shift, cy1 + 0.05, cz - 0.12);
      }
      // ---- Volado
      if (s.volado) { var v = s.volado; box(s.fx.estilo === 'industrial' || s.fx.acento === 'grafito' ? mDark : mWhite, v.w, 0.22, v.depth, X0 + v.x + v.w / 2, v.y + 0.11, ZF + v.depth / 2); }
      // ---- Pérgola
      if (s.pergola) {
        var pg = s.pergola, py = bodyTop + pg.h, mP = wood ? mSlat : mDark, pd = D * 0.55, pz = ZF - pd / 2 - 0.4;
        [[pg.x0 + 0.15, pz - pd / 2 + 0.15], [pg.x1 - 0.15, pz - pd / 2 + 0.15], [pg.x0 + 0.15, pz + pd / 2 - 0.15], [pg.x1 - 0.15, pz + pd / 2 - 0.15]].forEach(function (c) { bx(mP, 0.16, pg.h, 0.16, X0 + c[0], bodyTop + pg.h / 2, c[1]); });
        bx(mP, pg.x1 - pg.x0, 0.22, 0.14, X0 + (pg.x0 + pg.x1) / 2, py, pz - pd / 2 + 0.15); bx(mP, pg.x1 - pg.x0, 0.22, 0.14, X0 + (pg.x0 + pg.x1) / 2, py, pz + pd / 2 - 0.15);
        for (var sx = pg.x0; sx <= pg.x1 + 0.01; sx += 0.45) bx(mP, 0.08, 0.2, pd + 0.3, X0 + sx, py + 0.2, pz);
      }
      // ---- Jardineras y árboles
      function tree(x, z, k) {
        bx(mTrunk, 0.22 * k, 2.6 * k, 0.22 * k, x, 1.3 * k, z);
        var c1 = new T.Mesh(track(new T.IcosahedronGeometry(1.7 * k, 1)), mLeaf[0]); c1.position.set(x, 3.6 * k, z); c1.castShadow = true; root.add(c1);
        var c2 = new T.Mesh(track(new T.IcosahedronGeometry(1.1 * k, 1)), mLeaf[1]); c2.position.set(x + 0.6 * k, 4.4 * k, z - 0.3 * k); c2.castShadow = true; root.add(c2);
      }
      if (s.fx.opts.jardineras) {
        var gx0 = 0, segs = [];
        s.ops.filter(function (o) { return o.lvl === 0 && /garage|door|roll/.test(o.kind); }).sort(function (q, w2) { return q.x - w2.x; })
          .forEach(function (b2) { if (b2.x - 0.3 - gx0 > 0.9) segs.push([gx0 + 0.15, b2.x - 0.3]); gx0 = b2.x + b2.w + 0.3; });
        if (W - gx0 > 0.9) segs.push([gx0, W - 0.15]);
        var mPl = M({ color: night ? 0x3B3F46 : 0xCFCAC0, roughness: 0.9 });
        segs.forEach(function (sg) {
          box(mPl, sg[1] - sg[0], 0.5, 0.7, X0 + (sg[0] + sg[1]) / 2, 0.25, ZF + 0.45);
          for (var bxp = sg[0] + 0.3; bxp < sg[1] - 0.1; bxp += 0.55) { var sh3 = new T.Mesh(track(new T.IcosahedronGeometry(0.34, 0)), mLeaf[Math.round(bxp * 3) % 2]); sh3.position.set(X0 + bxp, 0.72, ZF + 0.45); sh3.castShadow = true; root.add(sh3); }
        });
        tree(-LW / 2 + 1.4, lotZF - 1.4, 1); tree(LW / 2 - 1.2, lotZ0 + 2, 1.2); tree(-LW / 2 + 1.6, lotZ0 + 2.2, 0.9);
      } else tree(LW / 2 - 1.2, lotZ0 + 2, 1);
      flush();

      // ---- Luz
      var hour = state.hora === 'dia' ? 12.5 : state.hora === 'tarde' ? 17.6 : 21;
      var sp = global.RinovaFacade ? global.RinovaFacade.sun(state.lat, state.month, hour) : { elevation: 40, hourAngle: 0 };
      var el = night ? 35 : Math.max(dusk ? 9 : 20, sp.elevation), az = night ? -0.5 : sp.hourAngle * Math.PI / 180;
      var R = Math.max(W, D, H) * 2.2;
      sun.position.set(-Math.sin(az) * Math.cos(el * Math.PI / 180) * R, Math.sin(el * Math.PI / 180) * R, Math.cos(az) * Math.cos(el * Math.PI / 180) * R * 0.85 + R * 0.15);
      sun.target.position.set(0, 0, 0);
      sun.color.set(night ? 0x8fa6d6 : dusk ? 0xffc48a : 0xfff4e2); sun.intensity = night ? 0.7 : dusk ? 2.4 : 2.6;
      var ext = Math.max(LW, LD, H) * 0.85, cam = sun.shadow.camera; cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.near = 0.5; cam.far = R * 3; cam.updateProjectionMatrix();
      hemi.color.set(night ? 0x4a5d84 : dusk ? 0xf6dcc4 : 0xdfe8f2); hemi.groundColor.set(night ? 0x1a1d24 : 0x6b6656); hemi.intensity = night ? 0.8 : dusk ? 1.05 : 0.85;
      renderer.toneMappingExposure = night ? 1.35 : dusk ? 1.15 : 1.0;
      if (night || dusk) {
        // luminarias: bañadores al pie de fachada y luz interior
        if (s.fx.opts.iluminacion) {
          var nL = Math.min(6, Math.max(2, Math.round(W / 3)));
          for (var li = 0; li < nL; li++) {
            var lxp = X0 + W * (li + 0.5) / nL, spot = new T.SpotLight(0xffc670, night ? 18 : 6, H + 3, 0.5, 0.6, 1.6);
            spot.position.set(lxp, 0.2, ZF + 0.9); spot.target.position.set(lxp, H, ZF); root.add(spot, spot.target);
            bx(mDark, 0.18, 0.12, 0.18, lxp, 0.08, ZF + 0.9, false);
          }
        }
        if (night) { var inner = new T.PointLight(0xffc06a, 30, Math.max(W, D) * 1.4, 1.6); inner.position.set(0, H * 0.5, ZF + 2.5); root.add(inner); }
      }
      // Cielo y reflejos
      var sky = track(skyTexture(T, state.hora));
      scene.background = sky;
      if (envRT) envRT.dispose();
      envRT = pmrem.fromEquirectangular(sky); scene.environment = envRT.texture;
      scene.fog = new T.Fog(night ? 0x0b0f17 : dusk ? 0xb8a89e : 0xc9d6e2, R * 2.4, R * 7);
      state.target.set(0, Math.min(H * 0.45, 8), 0);
      state.fit = Math.max(W * 1.25, H * 1.5, D * 1.1) + 14;
      state.dirty = true;
    }

    /* ---------- Cámara orbital ---------- */
    var VIEWS = { frente: [0, 0.12, 1], esquina: [0.62, 0.26, 1], aerea: [0.55, 0.85, 1.15], posterior: [Math.PI, 0.22, 1] };
    function setView(v) { var c = VIEWS[v] || VIEWS.esquina; state.tAz = nearestAngle(state.az, c[0]); state.tEl = c[1]; state.tRad = state.fit * c[2]; state.dirty = true; }
    function nearestAngle(cur, t) { var d = ((t - cur) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; return cur + d; }
    function place() {
      var ce = Math.cos(state.el); camera.position.set(state.target.x + Math.sin(state.az) * ce * state.rad, state.target.y + Math.sin(state.el) * state.rad, state.target.z + Math.cos(state.az) * ce * state.rad);
      camera.lookAt(state.target);
    }
    // Entrada: puntero y rueda
    var ptrs = new Map(), lastPinch = 0, idleT = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', function (e) { if (state.rec) return; canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); idleT = performance.now(); if (opts.onInteract) opts.onInteract(); });
    canvas.addEventListener('pointermove', function (e) {
      if (!ptrs.has(e.pointerId) || state.rec) return;
      var pr = ptrs.get(e.pointerId), dx = e.clientX - pr.x, dy = e.clientY - pr.y; pr.x = e.clientX; pr.y = e.clientY;
      if (ptrs.size === 1) { state.tAz -= dx * 0.0085; state.tEl = Math.max(0.03, Math.min(1.35, state.tEl + dy * 0.006)); }
      else if (ptrs.size === 2) { var pts = Array.from(ptrs.values()), d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y); if (lastPinch) zoom(lastPinch / d); lastPinch = d; }
      idleT = performance.now(); state.dirty = true;
    });
    function up(e) { ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = 0; }
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', function (e) { if (state.rec) return; e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); idleT = performance.now(); }, { passive: false });
    canvas.addEventListener('dblclick', function () { setView('esquina'); });
    function zoom(k) { state.tRad = Math.max(state.fit * 0.35, Math.min(state.fit * 2.6, state.tRad * k)); state.dirty = true; }

    /* ---------- Bucle ---------- */
    var raf = 0, lastT = 0, recHook = null;
    function frame(t) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
      if (!state.visible) return;
      if (recHook) recHook(dt);
      else if (state.spin && !ptrs.size && t - idleT > 1500) { state.tAz += dt * 0.32; }
      var k = 1 - Math.pow(0.0015, dt);
      var moving = Math.abs(state.tAz - state.az) + Math.abs(state.tEl - state.el) + Math.abs(state.tRad - state.rad) > 1e-4;
      state.az += (state.tAz - state.az) * k; state.el += (state.tEl - state.el) * k; state.rad += (state.tRad - state.rad) * k;
      if (moving || state.dirty || recHook) { place(); renderer.render(scene, camera); state.dirty = false; }
    }
    function resize() {
      var w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      camera.fov = w / h < 0.9 ? 50 : 38; camera.updateProjectionMatrix(); state.dirty = true;
    }
    var ro = global.ResizeObserver ? new ResizeObserver(resize) : null; if (ro) ro.observe(canvas); else global.addEventListener('resize', resize);
    var io = global.IntersectionObserver ? new IntersectionObserver(function (en) { state.visible = en[0].isIntersecting && !document.hidden; state.dirty = true; }) : null; if (io) io.observe(canvas);
    document.addEventListener('visibilitychange', function () { state.visible = !document.hidden; });
    raf = requestAnimationFrame(frame);

    /* ---------- Exportar ---------- */
    function snapshot(label) {
      place(); renderer.render(scene, camera);
      var src = renderer.domElement, w = src.width, h = src.height, c = document.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d'); g.drawImage(src, 0, 0);
      var u = Math.max(1, w / 1200);
      g.fillStyle = 'rgba(11,15,23,.78)'; g.fillRect(0, h - 56 * u, w, 56 * u);
      g.fillStyle = '#D4AF37'; g.fillRect(24 * u, h - 20 * u, 34 * u, 2 * u);
      g.fillStyle = '#fff'; g.font = '600 ' + (18 * u) + 'px Montserrat, Inter, sans-serif'; g.fillText('RINOVAIA', 24 * u, h - 28 * u);
      g.fillStyle = '#C0C6D4'; g.font = (13 * u) + 'px Inter, sans-serif'; g.textAlign = 'right'; g.fillText(label || '', w - 24 * u, h - 24 * u);
      return new Promise(function (res) { c.toBlob(res, 'image/png'); });
    }
    function videoType() {
      if (!global.MediaRecorder || !canvas.captureStream) return null;
      var types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported(types[i])) return types[i];
      return null;
    }
    function record360(seconds, onProgress) {
      var type = videoType();
      if (!type) return Promise.reject(new Error('Este navegador no permite grabar video del render. Usa Chrome, Edge o Safari actualizados.'));
      seconds = seconds || 12;
      return new Promise(function (res, rej) {
        var stream = canvas.captureStream(30), chunks = [], rec;
        try { rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 }); } catch (e) { rej(e); return; }
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () { state.rec = false; recHook = null; stream.getTracks().forEach(function (t) { t.stop(); }); res({ blob: new Blob(chunks, { type: type.split(';')[0] }), ext: type.indexOf('mp4') > -1 ? 'mp4' : 'webm' }); };
        rec.onerror = function (e) { state.rec = false; recHook = null; rej(e.error || new Error('Falló la grabación')); };
        state.rec = true; state.tRad = state.rad = state.fit * 1.05; state.tEl = state.el = Math.max(0.16, Math.min(0.42, state.el));
        var start = state.az, done = 0;
        state.az = state.tAz = start;
        recHook = function (dt) {
          done += dt; var f = Math.min(1, done / seconds);
          state.az = state.tAz = start + f * Math.PI * 2;
          if (onProgress) onProgress(f);
          if (f >= 1 && rec.state === 'recording') rec.stop();
        };
        rec.start(250);
      });
    }

    return {
      update: function (s, o) { if (o) { if (o.hora) state.hora = o.hora; if (o.lat != null) state.lat = o.lat; if (o.month) state.month = o.month; } var first = !state.spec; state.spec = s; build(s); if (first) { state.rad = state.tRad = state.fit; state.az = state.tAz = 0.62; } else state.tRad = Math.max(state.fit * 0.35, Math.min(state.fit * 2.6, state.tRad)); resize(); },
      setHora: function (h) { state.hora = h; if (state.spec) build(state.spec); },
      setView: setView,
      setSpin: function (b) { state.spin = b; idleT = 0; },
      spinning: function () { return state.spin; },
      png: snapshot, record360: record360, canRecord: function () { return !!videoType(); },
      resize: resize,
      destroy: function () { cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); clear(); renderer.dispose(); }
    };
  }

  global.RinovaRender3D = { load: load, webgl: webgl, create: create };
})(window);
