/* RINOVAIA — Mejora de fachada.
   A partir del proyecto (frente, niveles, alturas, crujías, tipo de inmueble, estacionamiento) arma una
   especificación de fachada con estilo, materiales, cancelería y elementos (celosías, balcones, pérgola...).
   La misma especificación alimenta el alzado a color (SVG) y el render 3D (render3d.js), para que lo que
   se ve en plano y en 3D sea el mismo edificio. Fórmulas y precios de demostración. */
(function (global) {
  'use strict';
  var PL = global.RinovaPlanos;

  var ESTILOS = {
    contemporaneo: { n: 'Contemporáneo', d: 'Volúmenes desfasados, ventanales y volado en acceso', roof: 'plano', win: 'ventanal', accentVol: true, cant: true, mat: 'concreto', acento: 'madera', cancel: 'negro', opts: ['volado', 'balcones', 'celosia', 'jardineras', 'iluminacion'] },
    minimalista: { n: 'Minimalista', d: 'Planos blancos, franjas de vidrio y pocos materiales', roof: 'plano', win: 'franja', accentVol: false, cant: false, mat: 'aplanado', acento: 'grafito', cancel: 'negro', opts: ['volado', 'jardineras', 'iluminacion'] },
    industrial: { n: 'Industrial', d: 'Ladrillo aparente, retícula de acero y marcos negros', roof: 'plano', win: 'reticula', accentVol: true, cant: false, mat: 'ladrillo', acento: 'grafito', cancel: 'negro', opts: ['volado', 'pergola', 'iluminacion'] },
    tropical: { n: 'Tropical moderno', d: 'Celosías de madera, vegetación y pérgola en azotea', roof: 'plano', win: 'ventanal', accentVol: true, cant: true, mat: 'aplanado', acento: 'madera', cancel: 'bronce', opts: ['celosia', 'pergola', 'jardineras', 'balcones', 'basamento', 'iluminacion'] },
    mediterraneo: { n: 'Mediterráneo', d: 'Muros blancos, arcos y cubierta de teja', roof: 'teja', win: 'arco', accentVol: false, cant: false, mat: 'aplanado', acento: 'madera', cancel: 'madera', opts: ['jardineras', 'balcones', 'iluminacion'] },
    colonial: { n: 'Colonial mexicano', d: 'Muro de color, marcos de cantera y balcones de herrería', roof: 'teja', win: 'marco', accentVol: false, cant: false, mat: 'ocre', acento: 'cantera', cancel: 'madera', opts: ['balcones', 'basamento', 'jardineras', 'iluminacion'] },
    referencia: { n: 'Según tu fachada', d: 'Copia colores, ventanas, balcón y acceso de la fachada que subiste', roof: 'plano', win: 'reticula', accentVol: false, cant: false, mat: 'aplanado', acento: 'grafito', cancel: 'negro', opts: ['balcones', 'volado', 'jardineras', 'iluminacion'], ref: true }
  };
  // c: color base, c2: sombra, k: costo de referencia MXN por m² de fachada, tex: textura
  var MATERIALES = {
    concreto: { n: 'Concreto aparente', c: '#B7BCC3', c2: '#9EA4AD', k: 1850, tex: 'tablero' },
    aplanado: { n: 'Aplanado blanco', c: '#F2F0EB', c2: '#DAD6CE', k: 780, tex: 'liso' },
    piedra: { n: 'Piedra natural', c: '#A69882', c2: '#857861', k: 2900, tex: 'piedra' },
    ladrillo: { n: 'Ladrillo aparente', c: '#A85C40', c2: '#8A4831', k: 1450, tex: 'ladrillo' },
    cantera: { n: 'Cantera rosa', c: '#CDA690', c2: '#B48D77', k: 3400, tex: 'sillar' },
    travertino: { n: 'Travertino', c: '#E3D5B9', c2: '#CBBB9C', k: 3100, tex: 'sillar' },
    ocre: { n: 'Aplanado ocre', c: '#D6A057', c2: '#BC8743', k: 820, tex: 'liso' },
    grafito: { n: 'Panel grafito', c: '#454C57', c2: '#353B44', k: 2200, tex: 'panel' },
    madera: { n: 'Madera termotratada', c: '#9C6A41', c2: '#7D5332', k: 2600, tex: 'madera' }
  };
  var ACENTOS = ['madera', 'grafito', 'piedra', 'cantera', 'concreto', 'ladrillo', 'travertino'];
  var CANCEL = {
    negro: { n: 'Aluminio negro mate', c: '#1D2128' },
    natural: { n: 'Aluminio natural', c: '#AEB4BC' },
    bronce: { n: 'Bronce champagne', c: '#A8894E' },
    madera: { n: 'Madera', c: '#6E4A2E' }
  };
  var OPCIONES = {
    volado: { n: 'Volado en acceso', d: 'Marquesina que protege la entrada y marca el acceso', k: 18000 },
    celosia: { n: 'Celosía de parteluces', d: 'Parteluces verticales que filtran el sol del poniente', k: 2400, m2: true },
    balcones: { n: 'Balcones con cristal', d: 'Barandal de cristal templado en niveles superiores', k: 14500, each: true },
    pergola: { n: 'Pérgola en azotea', d: 'Terraza habitable con sombra en la azotea', k: 42000 },
    jardineras: { n: 'Jardineras y vegetación', d: 'Jardineras al pie de fachada y árboles en el frente', k: 16000 },
    basamento: { n: 'Basamento de piedra', d: 'Planta baja en piedra: protege de salpicaduras y da peso visual', k: 0 },
    iluminacion: { n: 'Iluminación arquitectónica', d: 'Bañadores de luz cálida para lucir la fachada de noche', k: 22000 }
  };
  var HORAS = { dia: 'Día', tarde: 'Atardecer', noche: 'Noche' };
  var FROM_STYLE = { moderno: 'contemporaneo', mediterraneo: 'mediterraneo', renacentista: 'colonial' };

  function r1(n) { return Math.round(n * 10) / 10; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function presetFor(estilo) {
    var E = ESTILOS[estilo] || ESTILOS.contemporaneo, o = {};
    Object.keys(OPCIONES).forEach(function (k) { o[k] = E.opts.indexOf(k) > -1; });
    return { estilo: estilo, material: E.mat, acento: E.acento, cancel: E.cancel, opts: o };
  }
  function defaults(p) {
    var fx = presetFor(FROM_STYLE[p.style] || 'contemporaneo');
    fx.on = false; fx.hora = 'tarde';
    Object.keys(fx.opts).forEach(function (k) { fx.opts[k] = false; });
    return fx;
  }
  function normalize(fx, p) {
    var d = defaults(p);
    fx = Object.assign({}, d, fx || {});
    fx.opts = Object.assign({}, d.opts, (fx && fx.opts) || {});
    if (!ESTILOS[fx.estilo] || (fx.estilo === 'referencia' && !fx.ref)) fx.estilo = d.estilo;
    if (fx.ref) fx.ref = normRef(fx.ref);
    if (!MATERIALES[fx.material]) fx.material = d.material;
    if (!MATERIALES[fx.acento]) fx.acento = d.acento;
    if (!CANCEL[fx.cancel]) fx.cancel = d.cancel;
    if (!HORAS[fx.hora]) fx.hora = 'tarde';
    return fx;
  }

  /* Sugerencia automática: estilo según tipo y clima (latitud), elementos según niveles y estacionamiento. */
  function suggest(p, r) {
    var lat = r.city.lat, hot = lat < 21.5, fx, why = [];
    var estilo = p.type === 'bodega' ? 'industrial' : p.type === 'comercial' ? 'contemporaneo'
      : hot ? 'tropical' : (p.style === 'mediterraneo' ? 'mediterraneo' : p.style === 'renacentista' ? 'colonial' : 'contemporaneo');
    fx = presetFor(estilo); fx.on = true; fx.hora = 'tarde';
    why.push('Estilo ' + ESTILOS[estilo].n.toLowerCase() + ' por ser ' + (p.type === 'casa' ? 'vivienda' : p.type === 'deptos' ? 'edificio de departamentos' : p.type === 'comercial' ? 'inmueble comercial' : 'nave industrial') + (hot ? ' en clima cálido (' + r.city.name + ')' : ' en ' + r.city.name) + '.');
    if (hot) { fx.opts.celosia = true; why.push('Celosías al frente: en latitud ' + lat.toFixed(1) + '° bajan la ganancia solar y el gasto de aire acondicionado.'); }
    if (p.floors < 2) { fx.opts.balcones = false; fx.opts.celosia = fx.opts.celosia && true; }
    else if (p.type !== 'bodega') { fx.opts.balcones = true; why.push('Balcones con cristal en ' + (p.floors - 1) + ' nivel' + (p.floors > 2 ? 'es' : '') + ' superiores: ganan vista y terraza sin cerrar la fachada.'); }
    if (p.type === 'casa' || p.type === 'deptos') { fx.opts.jardineras = true; why.push('Jardineras al pie de fachada: suavizan el muro y separan la casa de la banqueta.'); }
    fx.opts.volado = true; why.push('Volado en el acceso para protegerlo de lluvia y marcar la entrada.');
    fx.opts.basamento = fx.opts.basamento || p.floors >= 3; if (fx.opts.basamento) why.push('Basamento de piedra en planta baja: da peso visual a un edificio de ' + p.floors + ' niveles y resiste salpicaduras.');
    fx.opts.iluminacion = true; why.push('Iluminación arquitectónica cálida para que la fachada luzca de noche.');
    if (p.floors >= 2 && estilo !== 'mediterraneo' && estilo !== 'colonial') { fx.opts.pergola = true; why.push('Pérgola en azotea para convertirla en terraza habitable.'); }
    return { fx: fx, why: why };
  }

  /* ---------- Fachada de referencia (la que sube el usuario) ----------
     ref: colores reales (muro, acento, cancelería, puerta), tipo de ventana, travesaño, balcón y su lado,
     losa volada sobre el acceso, porche remetido, cubierta. Lo llenan la lectura del navegador y RINOVAIA AI. */
  var LADOS = ['izq', 'centro', 'der'];
  function isHex(c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c); }
  function normRef(R) {
    R = Object.assign({}, R || {});
    function pick(k, list, d) { if (list.indexOf(R[k]) < 0) R[k] = d; }
    if (!isHex(R.muro)) R.muro = '#EEEDEA';
    if (!isHex(R.cancel)) R.cancel = '#1D2128';
    if (!isHex(R.puerta)) R.puerta = '#2E3238';
    if (!isHex(R.acento)) R.acento = null;
    if (!isHex(R.porcheColor)) R.porcheColor = R.acento || '#3A3D43';
    pick('ventanas', ['cuadricula', 'lisa', 'franja', 'arco', 'marco'], 'cuadricula');
    pick('balcon', ['vidrio', 'herreria', 'ninguno'], 'vidrio');
    pick('puertaLado', LADOS, 'der');
    pick('balconLado', LADOS.concat(['todos']), R.puertaLado);
    pick('acentoLado', ['izq', 'der', 'ninguno'], 'ninguno');
    pick('cubierta', ['plano', 'teja'], 'plano');
    pick('textura', Object.keys(MATERIALES), 'aplanado');
    R.acentoAncho = Math.max(0.2, Math.min(0.6, +R.acentoAncho || 0.35));
    R.acentoDesde = R.acentoDesde === 1 ? 1 : 0;
    ['travesano', 'ventanaAlta', 'puertaDoble', 'losaVolada', 'porche', 'cochera'].forEach(function (k) { R[k] = !!R[k]; });
    if (!R.acento) R.acentoLado = 'ninguno';
    return R;
  }
  function specRef(p, r, fx) {
    var R = fx.ref, E = Object.assign({}, ESTILOS.referencia, { roof: R.cubierta, win: R.ventanas === 'arco' ? 'arco' : R.ventanas === 'marco' ? 'marco' : 'reticula' });
    var hs = PL.heights(p).hs.slice(), W = r.W, D = r.D, levels = [], y = 0;
    // Módulos de fachada del ancho de los ventanales de la referencia (≈ 3.4 m), no de las crujías estructurales
    var bays = Math.max(2, Math.min(p.bays, Math.round(W / 3.4))), bw = W / bays;
    hs.forEach(function (h, i) { levels.push({ i: i, y: y, h: h }); y += h; });
    var H = y, gH = levels[0].h, ops = [];
    function bayOf(lado) { return lado === 'izq' ? 0 : lado === 'der' ? bays - 1 : Math.floor(bays / 2); }
    var di = bayOf(R.puertaLado), used = [di];
    // Acceso: puerta (sencilla o doble) con travesaño de vidrio arriba
    var dw = p.type === 'comercial' ? Math.min(bw * 0.8, 3) : R.puertaDoble ? Math.min(bw * 0.7, 1.8) : Math.min(bw * 0.5, 1.15);
    var dh = Math.min(2.45, gH - (R.travesano ? 0.75 : 0.4));
    var door = { x: r1(bw * di + (bw - dw) / 2), w: r1(dw), y: 0, h: r1(dh), lvl: 0, kind: 'door', bay: di, dbl: R.puertaDoble, arch: R.ventanas === 'arco' };
    ops.push(door);
    if (R.travesano && !door.arch) ops.push({ x: door.x, w: door.w, y: r1(dh + 0.08), h: r1(Math.min(0.55, gH - dh - 0.3)), lvl: 0, kind: 'win', transomOnly: true });
    var garage = null;
    if (R.cochera && p.type === 'casa' && p.parking > 0 && bays > 1) {
      var gb = di === 0 ? bays - 1 : 0, gw = Math.min(bw - 0.4, 2.7 * Math.min(p.parking, 2) + 0.3);
      garage = { x: r1(bw * gb + (bw - gw) / 2), w: r1(gw), y: 0, h: Math.min(2.5, gH - 0.6), lvl: 0, kind: 'garage' }; ops.push(garage); used.push(gb);
    }
    function win(k, lv, balc) {
      var o = { lvl: lv.i, kind: 'win' }, w, yy, hh;
      if (R.ventanas === 'franja') { w = bw * 0.9; yy = lv.h * 0.3; hh = lv.h * 0.45; o.strip = true; }
      else if (balc) { w = bw * 0.8; yy = 0.02; hh = lv.h - 0.5; o.balcony = true; o.rail = R.balcon; }
      else if (R.ventanaAlta) { w = bw * 0.82; yy = lv.i === 0 ? 0.12 : 0.1; hh = lv.h - yy - 0.45; }
      else if (R.ventanas === 'arco' || R.ventanas === 'marco') { w = Math.min(1.3, bw * 0.46); yy = 0.85; hh = lv.h - 1.3; o[R.ventanas === 'arco' ? 'arch' : 'frame'] = true; }
      else { w = bw * 0.72; yy = 0.75; hh = lv.h - 1.2; }
      if (R.ventanas === 'cuadricula') o.mull = true;
      if (R.travesano && !o.arch && !o.strip) o.transom = true;
      return Object.assign({ x: r1(bw * k + (bw - w) / 2), w: r1(w), y: r1(yy), h: r1(Math.max(0.6, hh)) }, o);
    }
    for (var k = 0; k < bays; k++) if (used.indexOf(k) < 0) ops.push(p.type === 'comercial' ? { x: r1(bw * k + 0.12), w: r1(bw - 0.24), y: 0.15, h: r1(gH - 0.75), lvl: 0, kind: 'shop' } : win(k, levels[0], false));
    var bb = R.balcon === 'ninguno' || fx.opts.balcones === false ? -1 : R.balconLado === 'todos' ? -2 : bayOf(R.balconLado);
    levels.slice(1).forEach(function (lv) {
      if (R.ventanas === 'franja' && bb === -1) { ops.push(Object.assign(win(0, lv, false), { x: r1(bw * 0.5), w: r1(W - bw) })); return; }
      for (var k = 0; k < bays; k++) ops.push(win(k, lv, bb === -2 || bb === k));
    });
    var accent = null;
    if (R.acentoLado !== 'ninguno') {
      var aw = r1(W * R.acentoAncho), from = Math.min(R.acentoDesde, levels.length - 1);
      accent = R.acentoLado === 'izq' ? { x0: 0, x1: aw, from: from } : { x0: r1(W - aw), x1: W, from: from };
    }
    var porch = R.porche ? { x0: r1(bw * di), x1: r1(bw * (di + 1)), h: gH, c: R.porcheColor } : null;
    var slab = R.losaVolada || fx.opts.volado;
    var volado = slab ? { x: r1(Math.max(-0.1, bw * di - 0.15)), w: r1(Math.min(bw + 0.3, W + 0.1 - Math.max(-0.1, bw * di - 0.15))), y: r1(gH - 0.05), depth: R.losaVolada ? 1.5 : 1.2, t: R.losaVolada ? 0.42 : 0.22, c: shade(R.muro, -6), lights: true } : null;
    var celosia = fx.opts.celosia ? (accent ? { x0: accent.x0, x1: accent.x1, from: Math.max(1, accent.from), to: levels.length - 1 } : { x0: r1(W * 0.6), x1: W, from: levels.length > 1 ? 1 : 0, to: levels.length - 1 }) : null;
    if (celosia && celosia.from > celosia.to) celosia.from = celosia.to;
    var mt = MATERIALES[R.textura];
    var M = { n: 'Muro como tu fachada (' + mt.n.toLowerCase() + ')', c: R.muro, c2: shade(R.muro, -22), k: mt.k, tex: mt.tex };
    var A = R.acento ? { n: 'Volumen de acento como tu fachada', c: R.acento, c2: shade(R.acento, -16), k: 2200, tex: 'liso' } : MATERIALES.grafito;
    return {
      p: p, fx: fx, E: E, W: W, D: D, H: H, bays: bays, bw: bw, levels: levels, parapet: R.cubierta === 'plano' ? 0.6 : 0.35, roof: R.cubierta,
      ops: ops, accent: accent, cant: 0, celosia: celosia, volado: volado, pergola: fx.opts.pergola && R.cubierta === 'plano' ? { x0: r1(W * 0.08), x1: r1(W * 0.5), h: 2.6 } : null,
      M: M, A: A, C: { n: 'Cancelería como tu fachada', c: R.cancel }, base: fx.opts.basamento ? MATERIALES.piedra : null,
      ref: R, porch: porch, doorC: R.puerta, slabC: shade(R.muro, -6),
      pv: r.energy && r.energy.layout && r.energy.layout.length ? r.energy.layout : null,
      yard: global.RinovaProyecto && global.RinovaProyecto.siteYard ? global.RinovaProyecto.siteYard(p, r) : null,
      lot: lotOf(p, r, D)
    };
  }
  function lotOf(p, r, D) { var y = global.RinovaProyecto && global.RinovaProyecto.siteYard && global.RinovaProyecto.siteYard(p, r); return { W: p.front, D: p.depth, setback: y ? Math.max(1, y.front) : Math.max(1.5, (p.depth - D) * 0.7) }; }

  /* ---------- Especificación geométrica (metros, origen en esquina inferior izquierda del frente) ---------- */
  function spec(p, r, fx) {
    fx = normalize(fx, p);
    if (fx.estilo === 'referencia' && fx.ref) return specRef(p, r, fx);
    var E = ESTILOS[fx.estilo], hs = PL.heights(p).hs.slice(), W = r.W, D = r.D, bays = p.bays, bw = W / bays;
    var levels = [], y = 0;
    hs.forEach(function (h, i) { levels.push({ i: i, y: y, h: h }); y += h; });
    var H = y, parapet = E.roof === 'plano' ? 1.0 : 0.35;
    var accent = E.accentVol && p.floors > 1 ? { x0: r1(W * 0.56), x1: W, from: 1 } : null;
    if (E.accentVol && p.floors === 1) accent = { x0: r1(W * 0.62), x1: W, from: 0 };
    var cant = E.cant && p.floors > 1 ? 0.9 : 0; // volado del volumen superior (m)
    var ops = [];
    // Planta baja
    var g = levels[0], gH = g.h, used = [];
    function bayOf(i) { return { x0: bw * i, x1: bw * (i + 1) }; }
    var garage = null, door = null;
    if (p.type === 'casa' && p.parking > 0) {
      var gw = Math.min(W * 0.48, 2.7 * Math.min(p.parking, 3) + 0.3), gbays = Math.max(1, Math.round(gw / bw));
      gw = Math.min(gw, gbays * bw - 0.4);
      garage = { x: r1((gbays * bw - gw) / 2), w: r1(gw), y: 0, h: Math.min(2.5, gH - 0.6), lvl: 0, kind: 'garage' };
      ops.push(garage); for (var k = 0; k < gbays; k++) used.push(k);
    }
    if (p.type === 'bodega') {
      var nd = Math.max(1, Math.min(p.units || 2, bays - 1));
      for (k = 0; k < nd; k++) { var bi = Math.round((k + 0.5) * bays / nd - 0.5); if (used.indexOf(bi) < 0) { used.push(bi); ops.push({ x: r1(bw * bi + bw * 0.12), w: r1(bw * 0.76), y: 0, h: Math.min(4.8, gH * 0.55), lvl: 0, kind: 'roll' }); } }
    }
    var di = Math.min(bays - 1, garage ? used.length + (bays - used.length > 2 ? 1 : 0) : Math.floor(bays / 2));
    if (used.indexOf(di) > -1) for (k = 0; k < bays; k++) if (used.indexOf(k) < 0) { di = k; break; }
    var dw = p.type === 'comercial' ? Math.min(bw * 0.8, 3) : Math.min(bw * 0.62, p.type === 'deptos' ? 1.8 : 1.3);
    door = { x: r1(bw * di + (bw - dw) / 2), w: r1(dw), y: 0, h: Math.min(2.6, gH - 0.4), lvl: 0, kind: 'door', bay: di };
    if (E.win === 'arco' || E.win === 'marco') door.arch = E.win === 'arco';
    ops.push(door); used.push(di);
    for (k = 0; k < bays; k++) {
      if (used.indexOf(k) > -1) continue;
      var b = bayOf(k);
      if (p.type === 'comercial') ops.push({ x: r1(b.x0 + 0.12), w: r1(bw - 0.24), y: 0.15, h: r1(gH - 0.75), lvl: 0, kind: 'shop' });
      else if (p.type === 'bodega') ops.push({ x: r1(b.x0 + bw * 0.15), w: r1(bw * 0.7), y: r1(gH - 1.6), h: 1.0, lvl: 0, kind: 'win' });
      else ops.push(winFor(E, b, bw, 0, gH, accent && accent.from === 0 && b.x0 >= accent.x0 - 0.01, fx, false));
    }
    // Niveles superiores
    levels.slice(1).forEach(function (lv) {
      if (E.win === 'franja' && !fx.opts.balcones) {
        // franja continua de vidrio dejando macizos en los extremos
        ops.push({ x: r1(bw * 0.5), w: r1(W - bw), y: r1(lv.h * 0.28), h: r1(lv.h * 0.5), lvl: lv.i, kind: 'win', strip: true });
        return;
      }
      for (var k = 0; k < bays; k++) {
        var b = bayOf(k), inAcc = accent && b.x0 >= accent.x0 - 0.01;
        var balc = fx.opts.balcones && p.type !== 'bodega' && (inAcc || (!accent && (k % 2 === (bays % 2 ? 1 : 0))) || p.type === 'deptos' && k % 2 === 0);
        ops.push(winFor(E, b, bw, lv.i, lv.h, inAcc, fx, balc));
      }
    });
    var celosia = fx.opts.celosia ? (accent ? { x0: accent.x0, x1: accent.x1, from: Math.max(1, accent.from), to: p.floors - 1 } : { x0: r1(W * 0.6), x1: W, from: p.floors > 1 ? 1 : 0, to: p.floors - 1 }) : null;
    if (celosia && celosia.from > celosia.to) celosia.from = celosia.to;
    var volado = fx.opts.volado ? { x: r1(Math.max(0, door.x - 0.9)), w: r1(Math.min(W - Math.max(0, door.x - 0.9), door.w + 1.8 + (garage ? garage.w + 0.6 : 0) * (garage && garage.x + garage.w + 1 > door.x ? 1 : 0))), y: r1(Math.min(gH - 0.15, door.h + 0.35)), depth: 1.6 } : null;
    if (volado && garage && garage.x + garage.w + 1 > door.x) { volado.x = r1(Math.max(0, garage.x - 0.3)); volado.w = r1(door.x + door.w + 0.9 - volado.x); }
    var pergola = fx.opts.pergola && E.roof === 'plano' ? { x0: r1(W * 0.08), x1: r1(W * (accent ? 0.52 : 0.6)), h: 2.6 } : null;
    return {
      p: p, fx: fx, E: E, W: W, D: D, H: H, bays: bays, bw: bw, levels: levels, parapet: parapet, roof: E.roof,
      ops: ops, accent: accent, cant: cant, celosia: celosia, volado: volado, pergola: pergola,
      M: MATERIALES[fx.material], A: MATERIALES[fx.acento], C: CANCEL[fx.cancel], base: fx.opts.basamento ? MATERIALES.piedra : null,
      pv: r.energy && r.energy.layout && r.energy.layout.length ? r.energy.layout : null,
      yard: global.RinovaProyecto && global.RinovaProyecto.siteYard ? global.RinovaProyecto.siteYard(p, r) : null,
      lot: { W: p.front, D: p.depth, setback: (function () { var y = global.RinovaProyecto && global.RinovaProyecto.siteYard && global.RinovaProyecto.siteYard(p, r); return y ? Math.max(1, y.front) : Math.max(1.5, (p.depth - D) * 0.7); })() }
    };
  }
  function winFor(E, b, bw, lvl, h, inAcc, fx, balc) {
    var w, y, hh, o;
    if (balc) { w = bw * 0.78; y = 0.02; hh = h - 0.55; o = { balcony: true }; }
    else if (E.win === 'ventanal' || E.win === 'franja') { w = bw * (inAcc ? 0.86 : 0.72); y = lvl === 0 ? 0.5 : 0.45; hh = h - y - 0.45; }
    else if (E.win === 'reticula') { w = bw * 0.78; y = 0.7; hh = h - 1.15; o = { grid: true }; }
    else if (E.win === 'arco') { w = Math.min(1.3, bw * 0.46); y = 0.85; hh = h - 1.3; o = { arch: true }; }
    else { w = Math.min(1.2, bw * 0.44); y = 0.75; hh = h - 1.25; o = { frame: true }; }
    return Object.assign({ x: r1(b.x0 + (bw - w) / 2), w: r1(w), y: r1(y), h: r1(Math.max(0.6, hh)), lvl: lvl, kind: 'win' }, o || {});
  }

  /* ---------- Costo de la mejora ---------- */
  function cost(p, r, fx) {
    var s = spec(p, r, fx), area = s.W * (s.H + s.parapet), glass = 0, items = [];
    s.ops.forEach(function (o) { glass += o.w * o.h; });
    var wall = Math.max(0, area - glass), accArea = s.accent ? (s.accent.x1 - s.accent.x0) * (s.H - s.levels[s.accent.from].y) : 0;
    var baseArea = s.base ? s.W * s.levels[0].h : 0;
    var net = wall / area; accArea *= net; baseArea *= net; // descuenta vanos en proporción
    items.push([s.M.n + ' (muro principal)', Math.max(0, wall - accArea - baseArea) * s.M.k]);
    if (accArea) items.push([s.A.n + ' (volumen de acento)', accArea * s.A.k]);
    if (baseArea) items.push(['Basamento de piedra', baseArea * MATERIALES.piedra.k]);
    items.push(['Cancelería ' + s.C.n.toLowerCase(), glass * (s.fx.cancel === 'bronce' ? 4200 : s.fx.cancel === 'madera' ? 3900 : 3300)]);
    Object.keys(OPCIONES).forEach(function (k) {
      if (!s.fx.opts[k] || !OPCIONES[k].k) return;
      var o = OPCIONES[k], v = o.k;
      if (o.m2 && s.celosia) v = o.k * (s.celosia.x1 - s.celosia.x0) * (s.H - s.levels[s.celosia.from].y);
      if (o.each) v = o.k * s.ops.filter(function (x) { return x.balcony; }).length;
      if (v) items.push([o.n, v]);
    });
    if (s.roof === 'teja') items.push(['Cubierta de teja', s.W * s.D * 0.35 * 980]);
    var total = items.reduce(function (a, x) { return a + x[1]; }, 0);
    return { items: items, total: total, area: area, glass: glass, wwr: glass / area };
  }

  /* ---------- Alzado a color (SVG) ---------- */
  var VW = 1200, VH = 720, GROUND = 610;
  function svg(p, r, fx, opt) {
    opt = opt || {};
    var s = spec(p, r, fx), hora = opt.hora || s.fx.hora, night = hora === 'noche', dusk = hora === 'tarde';
    var id = opt.id || ('fx' + Math.random().toString(36).slice(2, 7));
    var roofH = s.roof === 'teja' ? Math.min(3.2, s.W * 0.16) : s.parapet + (s.pergola ? s.pergola.h : 0);
    var sc = Math.min((VW * 0.74) / (s.W + s.cant + 2), (GROUND - 70) / (s.H + roofH + 0.5));
    var x0 = (VW - s.W * sc) / 2 - s.cant * sc / 2;
    function X(m) { return r1(x0 + m * sc); }
    function Y(m) { return r1(GROUND - m * sc); }
    function L(m) { return r1(m * sc); }
    var o = [], C = s.C.c, glow = night ? '#F7C96E' : null;
    var marks = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="Fachada mejorada estilo ' + esc(s.E.n) + '">');
    // ----- defs
    o.push('<defs>');
    var sky = night ? ['#060910', '#111A2C', '#28304A'] : dusk ? ['#24345A', '#C98667', '#F3C796'] : ['#8FB6DE', '#CFE0F0', '#EEF3F8'];
    o.push('<linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sky[0] + '"/><stop offset=".62" stop-color="' + sky[1] + '"/><stop offset="1" stop-color="' + sky[2] + '"/></linearGradient>');
    o.push(night
      ? '<linearGradient id="' + id + 'gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3A3"/><stop offset=".55" stop-color="#F0B858"/><stop offset="1" stop-color="#B8792E"/></linearGradient>'
      : '<linearGradient id="' + id + 'gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + (dusk ? '#E9B996' : '#C9DBEC') + '"/><stop offset=".38" stop-color="' + (dusk ? '#6C6E86' : '#5F7C9C') + '"/><stop offset="1" stop-color="#1A2433"/></linearGradient>');
    o.push('<linearGradient id="' + id + 'shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>');
    o.push('<radialGradient id="' + id + 'wash" cx=".5" cy="1" r=".9"><stop offset="0" stop-color="#FFD58A" stop-opacity=".75"/><stop offset=".5" stop-color="#FFC768" stop-opacity=".22"/><stop offset="1" stop-color="#FFC768" stop-opacity="0"/></radialGradient>');
    o.push('<linearGradient id="' + id + 'side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".02"/></linearGradient>');
    o.push(pattern(id + 'pM', s.M, sc) + pattern(id + 'pA', s.A, sc) + pattern(id + 'pB', MATERIALES.piedra, sc) + tejaPattern(id + 'pT', sc));
    o.push('</defs>');
    // ----- cielo, fondo y suelo
    o.push('<rect width="' + VW + '" height="' + GROUND + '" fill="url(#' + id + 'sky)"/>');
    if (night) { for (var st = 0; st < 40; st++) o.push('<circle cx="' + ((st * 197) % VW) + '" cy="' + ((st * 83) % 260 + 14) + '" r="' + (st % 3 ? .8 : 1.3) + '" fill="#fff" opacity="' + (0.35 + (st % 4) * 0.12) + '"/>'); o.push('<circle cx="' + (VW - 150) + '" cy="90" r="22" fill="#F1EEDC" opacity=".9"/>'); }
    else o.push('<circle cx="' + (dusk ? 170 : VW - 170) + '" cy="' + (dusk ? GROUND - 150 : 110) + '" r="' + (dusk ? 38 : 30) + '" fill="#FFF3D6" opacity=".9"/><circle cx="' + (dusk ? 170 : VW - 170) + '" cy="' + (dusk ? GROUND - 150 : 110) + '" r="90" fill="#FFF3D6" opacity=".18"/>');
    // silueta urbana lejana
    var sil = night ? '#0D1422' : dusk ? '#7A6378' : '#B3C3D3', bx = 0, bk = 0, silp = 'M0 ' + GROUND;
    while (bx < VW) { var bwid = 40 + (bk * 37) % 70, bh = 40 + (bk * 53) % 110; silp += ' V' + (GROUND - bh) + ' H' + (bx + bwid); bx += bwid; bk++; }
    o.push('<path d="' + silp + ' V' + GROUND + 'Z" fill="' + sil + '" opacity=".55"/>');
    o.push('<rect y="' + GROUND + '" width="' + VW + '" height="' + (VH - GROUND) + '" fill="' + (night ? '#151B26' : '#8E959E') + '"/>');
    o.push('<rect y="' + GROUND + '" width="' + VW + '" height="16" fill="' + (night ? '#2A303B' : '#C8CDD3') + '"/>');
    o.push('<rect y="' + (GROUND + 16) + '" width="' + VW + '" height="3" fill="' + (night ? '#3A404B' : '#A9AFB7') + '"/>');
    for (var lx = 30; lx < VW; lx += 150) o.push('<rect x="' + lx + '" y="' + (GROUND + 62) + '" width="70" height="4" fill="#E9E3CF" opacity="' + (night ? .35 : .7) + '"/>');
    // árboles traseros
    if (s.fx.opts.jardineras) { tree(o, X(-2.4), GROUND, sc * 1.05, night, 0); tree(o, X(s.W + s.cant + 3.6), GROUND, sc * 1.2, night, 1); }
    // ----- cubierta
    var top = s.H;
    if (s.roof === 'teja') {
      var ov = 0.55, rh = roofH;
      o.push('<path d="M' + X(-ov) + ' ' + Y(top) + ' L' + X(s.W * 0.22) + ' ' + Y(top + rh) + ' H' + X(s.W * 0.78) + ' L' + X(s.W + ov) + ' ' + Y(top) + 'Z" fill="url(#' + id + 'pT)" stroke="#5E2E1D" stroke-width="1"/>');
      o.push('<rect x="' + X(-ov) + '" y="' + Y(top) + '" width="' + L(s.W + 2 * ov) + '" height="' + L(0.22) + '" fill="#6B3422"/>');
    }
    if (s.pv) { // paneles solares en azotea, visibles sobre el pretil
      var pv0 = Math.min.apply(null, s.pv.map(function (q) { return q.x; })), pv1 = Math.max.apply(null, s.pv.map(function (q) { return q.x + q.w; }));
      var pvb = s.roof === 'plano' ? top + s.parapet - 0.25 : top + 0.35, pvh = s.roof === 'plano' ? 0.55 : 0.5;
      o.push('<g><rect x="' + X(pv0) + '" y="' + Y(pvb + pvh) + '" width="' + L(pv1 - pv0) + '" height="' + L(pvh) + '" fill="' + (night ? '#132238' : '#22416F') + '" stroke="#9FB4D6" stroke-width=".8"/>');
      for (var pxx = pv0 + 1.16; pxx < pv1 - 0.1; pxx += 1.16) o.push('<line x1="' + X(pxx) + '" y1="' + Y(pvb + pvh) + '" x2="' + X(pxx) + '" y2="' + Y(pvb) + '" stroke="#7F98C2" stroke-width=".7"/>');
      o.push('</g>');
      marks.push({ x: X((pv0 + pv1) / 2), y: Y(pvb + pvh) - 12, t: 'Paneles solares' });
    }
    if (s.pergola) {
      var pg = s.pergola, ptop = top + s.parapet + pg.h - 0.2;
      o.push('<g fill="' + (s.fx.acento === 'madera' || s.fx.estilo === 'tropical' ? '#8B5E3A' : '#2A2F37') + '">');
      o.push('<rect x="' + X(pg.x0) + '" y="' + Y(ptop + 0.22) + '" width="' + L(pg.x1 - pg.x0) + '" height="' + L(0.22) + '"/>');
      for (var px = pg.x0; px <= pg.x1 + 0.01; px += Math.max(0.5, (pg.x1 - pg.x0) / 10)) o.push('<rect x="' + X(px - 0.05) + '" y="' + Y(ptop + 0.3) + '" width="' + L(0.1) + '" height="' + L(0.3) + '" opacity=".9"/>');
      o.push('<rect x="' + X(pg.x0 + 0.1) + '" y="' + Y(ptop) + '" width="' + L(0.14) + '" height="' + L(pg.h - 0.2) + '"/><rect x="' + X(pg.x1 - 0.24) + '" y="' + Y(ptop) + '" width="' + L(0.14) + '" height="' + L(pg.h - 0.2) + '"/>');
      o.push('</g>');
      if (night) o.push('<rect x="' + X(pg.x0 + 0.3) + '" y="' + Y(ptop - 0.1) + '" width="' + L(pg.x1 - pg.x0 - 0.6) + '" height="' + L(pg.h - 0.6) + '" fill="url(#' + id + 'wash)" opacity=".5"/>');
      marks.push({ x: X((pg.x0 + pg.x1) / 2), y: Y(ptop + 0.3) - 14, t: 'Pérgola en azotea' });
    }
    // ----- volúmenes
    var lv0 = s.levels[0], up = s.levels[1];
    function wallRect(xm, ym, wm, hm, fill) { o.push('<rect x="' + X(xm) + '" y="' + Y(ym + hm) + '" width="' + L(wm) + '" height="' + L(hm) + '" fill="' + fill + '"/>'); }
    var bodyTop = top + (s.roof === 'plano' ? s.parapet : 0);
    // Cuerpo principal
    wallRect(0, 0, s.W, bodyTop, 'url(#' + id + 'pM)');
    marks.push({ x: X(s.accent ? s.accent.x0 * 0.35 : s.W * 0.2), y: Y(top - (s.levels[s.levels.length - 1].h * 0.12)), t: s.M.n });
    // Volumen de acento (volado)
    if (s.accent) {
      var a = s.accent, ay = s.levels[a.from].y;
      wallRect(a.x0, ay, a.x1 - a.x0 + s.cant, bodyTop - ay, 'url(#' + id + 'pA)');
      if (s.cant) o.push('<rect x="' + X(s.W) + '" y="' + Y(bodyTop) + '" width="' + L(s.cant) + '" height="' + L(bodyTop - ay) + '" fill="url(#' + id + 'side)"/>');
      o.push('<rect x="' + X(a.x0) + '" y="' + Y(ay) + '" width="' + L(a.x1 - a.x0 + s.cant) + '" height="' + L(0.3) + '" fill="url(#' + id + 'shade)" transform="translate(0 ' + L(0.3) + ')"/>');
      marks.push({ x: X(a.x0 + (a.x1 - a.x0) * 0.8), y: Y(bodyTop - 0.35), t: s.A.n });
    }
    // Basamento
    if (s.base) {
      wallRect(-0.05, 0, (s.accent && s.accent.from === 0 ? s.accent.x0 : s.W) + 0.1, lv0.h, 'url(#' + id + 'pB)');
      marks.push({ x: X(s.W * 0.08), y: Y(lv0.h * 0.82), t: 'Basamento de piedra' });
    }
    // Losas / impostas
    s.levels.slice(1).forEach(function (lv) {
      var band = s.fx.estilo === 'colonial' || s.fx.estilo === 'mediterraneo' ? 0.18 : 0.28;
      o.push('<rect x="' + X(-0.12) + '" y="' + Y(lv.y + band / 2) + '" width="' + L(s.W + 0.24 + (s.accent && lv.i >= s.accent.from ? s.cant : 0)) + '" height="' + L(band) + '" fill="' + (s.slabC || (s.fx.estilo === 'industrial' ? '#2A2F37' : s.fx.estilo === 'colonial' ? s.A.c : '#E9EAEC')) + '"/>');
      o.push('<rect x="' + X(0) + '" y="' + Y(lv.y - band / 2) + '" width="' + L(s.W) + '" height="' + L(0.25) + '" fill="url(#' + id + 'shade)"/>');
    });
    // Pretil / cornisa
    if (s.roof === 'plano') {
      o.push('<rect x="' + X(-0.1) + '" y="' + Y(bodyTop + 0.08) + '" width="' + L(s.W + 0.2 + (s.accent ? s.cant : 0)) + '" height="' + L(0.14) + '" fill="' + (night ? '#C9CCD2' : '#ECEDEF') + '"/>');
    } else {
      o.push('<rect x="' + X(-0.25) + '" y="' + Y(top + 0.2) + '" width="' + L(s.W + 0.5) + '" height="' + L(0.24) + '" fill="' + s.A.c + '"/>');
    }
    // ----- porche remetido (acceso oscuro bajo la losa volada, con luminarias empotradas)
    if (s.porch) {
      var pc = s.porch, ph = s.volado ? s.volado.y : pc.h;
      o.push('<rect x="' + X(pc.x0) + '" y="' + Y(ph) + '" width="' + L(pc.x1 - pc.x0) + '" height="' + L(ph) + '" fill="' + pc.c + '"/>');
      o.push('<rect x="' + X(pc.x0) + '" y="' + Y(ph) + '" width="' + L(pc.x1 - pc.x0) + '" height="' + L(0.5) + '" fill="url(#' + id + 'shade)"/>');
      marks.push({ x: X(pc.x0 + (pc.x1 - pc.x0) * 0.2), y: Y(ph * 0.55), t: 'Acceso remetido como tu fachada' });
    }
    // ----- vanos
    s.ops.forEach(function (op) {
      var lv = s.levels[op.lvl], yb = lv.y + op.y, xa = op.x + (s.accent && op.lvl >= s.accent.from && op.x >= s.accent.x0 - 0.01 ? s.cant : 0);
      var x = X(xa), yTop = Y(yb + op.h), w = L(op.w), h = L(op.h), fr = Math.max(1.5, L(0.06));
      if (op.kind === 'garage') {
        o.push('<rect x="' + X(op.x - 0.12) + '" y="' + Y(yb + op.h + 0.12) + '" width="' + L(op.w + 0.24) + '" height="' + L(op.h + 0.12) + '" fill="' + C + '"/>');
        var slat = s.fx.cancel === 'madera' || s.fx.acento === 'madera' ? '#8E5F3B' : '#3A414C';
        o.push('<rect x="' + x + '" y="' + yTop + '" width="' + w + '" height="' + h + '" fill="' + slat + '"/>');
        for (var gy = 0; gy < op.h; gy += 0.16) o.push('<rect x="' + x + '" y="' + Y(yb + gy + 0.16) + '" width="' + w + '" height="' + L(0.03) + '" fill="#000" opacity=".22"/>');
        if (night) o.push('<rect x="' + x + '" y="' + yTop + '" width="' + w + '" height="' + h + '" fill="url(#' + id + 'wash)" opacity=".35"/>');
        return;
      }
      if (op.kind === 'roll') {
        o.push('<rect x="' + x + '" y="' + yTop + '" width="' + w + '" height="' + h + '" fill="#8E96A2" stroke="' + C + '" stroke-width="' + fr * 2 + '"/>');
        for (gy = 0; gy < op.h; gy += 0.2) o.push('<line x1="' + x + '" x2="' + r1(x + w) + '" y1="' + Y(yb + gy) + '" y2="' + Y(yb + gy) + '" stroke="#5B636F" stroke-width=".8"/>');
        o.push('<rect x="' + X(op.x - 0.2) + '" y="' + Y(yb + op.h + 0.5) + '" width="' + L(op.w + 0.4) + '" height="' + L(0.18) + '" fill="' + C + '"/>');
        return;
      }
      var glassFill = op.kind === 'door' ? (s.doorC || (night ? '#C98B3A' : (s.fx.cancel === 'madera' || s.fx.acento === 'madera' ? '#7A5032' : '#2A3140'))) : 'url(#' + id + 'gl)';
      if (op.kind === 'door' && p.type !== 'casa') glassFill = 'url(#' + id + 'gl)';
      // marco de cantera (colonial) o dintel
      if (op.frame) o.push('<rect x="' + X(xa - 0.18) + '" y="' + Y(yb + op.h + 0.32) + '" width="' + L(op.w + 0.36) + '" height="' + L(op.h + 0.42) + '" fill="' + s.A.c + '" stroke="' + s.A.c2 + '" stroke-width=".8"/>');
      if (op.arch || (op.kind === 'door' && op.arch)) {
        var rr = op.w / 2, d = 'M' + x + ' ' + Y(yb) + ' V' + Y(yb + op.h - rr) + ' A' + L(rr) + ' ' + L(rr) + ' 0 0 1 ' + r1(x + w) + ' ' + Y(yb + op.h - rr) + ' V' + Y(yb) + 'Z';
        o.push('<path d="' + d + '" fill="' + C + '"/>');
        var ri = rr - 0.06, d2 = 'M' + X(xa + 0.06) + ' ' + Y(yb + 0.04) + ' V' + Y(yb + op.h - rr) + ' A' + L(ri) + ' ' + L(ri) + ' 0 0 1 ' + X(xa + op.w - 0.06) + ' ' + Y(yb + op.h - rr) + ' V' + Y(yb + 0.04) + 'Z';
        o.push('<path d="' + d2 + '" fill="' + glassFill + '"/>');
        o.push('<line x1="' + X(xa + op.w / 2) + '" x2="' + X(xa + op.w / 2) + '" y1="' + Y(yb) + '" y2="' + Y(yb + op.h) + '" stroke="' + C + '" stroke-width="' + fr + '"/>');
      } else {
        o.push('<rect x="' + x + '" y="' + yTop + '" width="' + w + '" height="' + h + '" fill="' + C + '"/>');
        o.push('<rect x="' + r1(x + fr) + '" y="' + r1(yTop + fr) + '" width="' + r1(w - 2 * fr) + '" height="' + r1(h - 2 * fr) + '" fill="' + glassFill + '"/>');
        // reflejo
        if (!night && op.kind !== 'door') o.push('<path d="M' + r1(x + fr) + ' ' + r1(yTop + h * 0.55) + ' L' + r1(x + w * 0.55) + ' ' + r1(yTop + fr) + ' H' + r1(x + w * 0.75) + ' L' + r1(x + fr) + ' ' + r1(yTop + h * 0.85) + 'Z" fill="#fff" opacity=".13"/>');
        // parteluces / retícula
        var nv = op.grid ? Math.max(2, Math.round(op.w / 0.6)) : op.mull ? Math.max(2, Math.round(op.w / 0.95)) : op.strip ? Math.max(2, Math.round(op.w / 1.6)) : op.dbl ? 2 : op.w > 1.6 ? 2 : 1;
        for (var m = 1; m < nv; m++) o.push('<rect x="' + r1(x + w * m / nv - fr / 2) + '" y="' + yTop + '" width="' + fr + '" height="' + h + '" fill="' + C + '"/>');
        if (op.grid) for (var n = 1; n < 3; n++) o.push('<rect x="' + x + '" y="' + r1(yTop + h * n / 3 - fr / 2) + '" width="' + w + '" height="' + fr + '" fill="' + C + '"/>');
        if (op.transom) o.push('<rect x="' + x + '" y="' + r1(yTop + h * 0.22 - fr / 2) + '" width="' + w + '" height="' + r1(fr * 1.4) + '" fill="' + C + '"/>');
        if (op.kind === 'door' && s.doorC) for (var pn = 0; pn < 4; pn++) o.push('<rect x="' + r1(x + w * 0.16) + '" y="' + r1(yTop + h * (0.08 + pn * 0.22)) + '" width="' + r1(w * (op.dbl ? 0.68 : 0.5)) + '" height="' + r1(h * 0.16) + '" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="1.2"/>');
        if (op.kind === 'door' && p.type === 'casa') o.push('<rect x="' + r1(x + w * 0.78) + '" y="' + r1(yTop + h * 0.45) + '" width="' + Math.max(2, L(0.04)) + '" height="' + L(0.5) + '" fill="#D4AF37"/>');
      }
      // sombra superior del vano (profundidad)
      o.push('<rect x="' + x + '" y="' + yTop + '" width="' + w + '" height="' + Math.max(2, L(0.12)) + '" fill="#000" opacity=".22"/>');
      if (night && glow && op.kind !== 'door') o.push('<rect x="' + r1(x - 4) + '" y="' + r1(yTop - 4) + '" width="' + r1(w + 8) + '" height="' + r1(h + 8) + '" fill="' + glow + '" opacity=".1"/>');
      // balcón
      if (op.balcony) {
        var by = lv.y, bxl = xa - 0.25, bwl = op.w + 0.5;
        o.push('<rect x="' + X(bxl) + '" y="' + Y(by + 0.06) + '" width="' + L(bwl) + '" height="' + L(0.2) + '" fill="' + (s.slabC || '#E4E6EA') + '"/>');
        if (op.rail === 'herreria') {
          var hb2 = 'M' + X(bxl) + ' ' + Y(by + 1.0) + ' H' + X(bxl + bwl);
          for (var hx2 = bxl; hx2 <= bxl + bwl + 0.01; hx2 += 0.12) hb2 += ' M' + X(hx2) + ' ' + Y(by + 1.0) + ' V' + Y(by + 0.1);
          o.push('<path d="' + hb2 + '" stroke="' + C + '" stroke-width="1.4" fill="none"/>');
        } else {
          o.push('<rect x="' + X(bxl) + '" y="' + Y(by + 1.1) + '" width="' + L(bwl) + '" height="' + L(1.04) + '" fill="#BFD6E6" opacity="' + (night ? .18 : .38) + '" stroke="#DDE7EF" stroke-width="1"/>');
          o.push('<rect x="' + X(bxl) + '" y="' + Y(by + 1.12) + '" width="' + L(bwl) + '" height="' + Math.max(2, L(0.05)) + '" fill="' + C + '"/>');
        }
      }
      // balcón de herrería (colonial)
      if (op.frame && op.lvl > 0) {
        o.push('<rect x="' + X(xa - 0.3) + '" y="' + Y(yb - 0.02) + '" width="' + L(op.w + 0.6) + '" height="' + L(0.14) + '" fill="' + s.A.c2 + '"/>');
        var hb = 'M' + X(xa - 0.25) + ' ' + Y(yb + 0.9) + ' H' + X(xa + op.w + 0.25);
        for (var hx = xa - 0.25; hx <= xa + op.w + 0.26; hx += 0.12) hb += ' M' + X(hx) + ' ' + Y(yb + 0.9) + ' V' + Y(yb + 0.02);
        o.push('<path d="' + hb + '" stroke="#1E1E22" stroke-width="1.3" fill="none"/>');
      }
    });
    // ----- celosía
    if (s.celosia) {
      var ce = s.celosia, cy0 = s.levels[ce.from].y + 0.15, cy1 = s.H - 0.1, cx0 = ce.x0 + (s.accent ? s.cant : 0) + 0.15, cx1 = ce.x1 + (s.accent ? s.cant : 0) - 0.15;
      var colC = s.fx.acento === 'madera' || s.fx.estilo === 'tropical' ? '#8A5A36' : s.fx.cancel === 'bronce' ? '#A8894E' : '#2B3038';
      var stp = 0.2;
      o.push('<g fill="' + colC + '">');
      for (var cx = cx0; cx <= cx1; cx += stp) o.push('<rect x="' + X(cx) + '" y="' + Y(cy1) + '" width="' + Math.max(1.4, L(0.07)) + '" height="' + L(cy1 - cy0) + '"/>');
      o.push('</g><rect x="' + X(cx0) + '" y="' + Y(cy1 + 0.06) + '" width="' + L(cx1 - cx0 + 0.07) + '" height="' + Math.max(2, L(0.08)) + '" fill="' + colC + '"/>');
      marks.push({ x: X((cx0 + cx1) / 2), y: Y((cy0 + cy1) / 2), t: 'Celosía de parteluces' });
    }
    // ----- volado de acceso
    if (s.volado) {
      var v = s.volado;
      var vt = v.t || 0.22;
      o.push('<rect x="' + X(v.x) + '" y="' + Y(v.y + vt) + '" width="' + L(v.w) + '" height="' + L(vt) + '" fill="' + (v.c || (s.fx.estilo === 'industrial' || s.fx.acento === 'grafito' ? '#262B33' : '#EDEEF0')) + '"/>');
      o.push('<rect x="' + X(v.x) + '" y="' + Y(v.y) + '" width="' + L(v.w) + '" height="' + L(0.35) + '" fill="url(#' + id + 'shade)"/>');
      if (v.lights) for (var lp = v.x + v.w / 6; lp < v.x + v.w; lp += v.w / 3) o.push('<circle cx="' + X(lp) + '" cy="' + r1(Y(v.y) - 2) + '" r="' + Math.max(2, L(0.05)) + '" fill="#FFE9B8"/>' + (night || dusk ? '<path d="M' + X(lp) + ' ' + Y(v.y) + ' L' + X(lp - 0.5) + ' ' + Y(0) + ' H' + X(lp + 0.5) + 'Z" fill="url(#' + id + 'wash)" opacity=".5"/>' : ''));
      if (night) for (var dl = v.x + 0.6; dl < v.x + v.w; dl += 1.2) o.push('<path d="M' + X(dl) + ' ' + Y(v.y) + ' L' + X(dl - 0.7) + ' ' + Y(0) + ' H' + X(dl + 0.7) + 'Z" fill="url(#' + id + 'wash)" opacity=".55"/>');
      marks.push({ x: X(v.x + v.w / 2), y: Y(v.y + vt / 2), t: s.ref ? 'Losa volada sobre el acceso' : 'Volado en acceso' });
    }
    // ----- iluminación arquitectónica
    if (s.fx.opts.iluminacion && (night || dusk)) {
      for (var ix = 0.6; ix < s.W; ix += Math.max(1.6, s.bw)) o.push('<path d="M' + X(ix - 0.08) + ' ' + Y(0) + ' L' + X(ix - 0.9) + ' ' + Y(Math.min(s.H, 4.2)) + ' H' + X(ix + 0.9) + ' L' + X(ix + 0.08) + ' ' + Y(0) + 'Z" fill="url(#' + id + 'wash)" opacity="' + (night ? .8 : .35) + '"/>');
      if (night) marks.push({ x: X(0.6), y: Y(1.6), t: 'Iluminación arquitectónica' });
    }
    // ----- jardineras
    if (s.fx.opts.jardineras) {
      var jy = 0.5, segs = [];
      var gx0 = 0, blocks = s.ops.filter(function (o2) { return o2.lvl === 0 && (o2.kind === 'garage' || o2.kind === 'door' || o2.kind === 'roll'); }).sort(function (a2, b2) { return a2.x - b2.x; });
      blocks.forEach(function (b2) { if (b2.x - 0.3 - gx0 > 0.9) segs.push([gx0 + 0.15, b2.x - 0.3]); gx0 = b2.x + b2.w + 0.3; });
      if (s.W - gx0 > 0.9) segs.push([gx0, s.W - 0.15]);
      segs.forEach(function (sg) {
        o.push('<rect x="' + X(sg[0]) + '" y="' + Y(jy) + '" width="' + L(sg[1] - sg[0]) + '" height="' + L(jy) + '" fill="' + (night ? '#3B3F46' : '#CFCAC0') + '"/>');
        for (var sx = sg[0] + 0.3; sx < sg[1] - 0.1; sx += 0.55) o.push('<ellipse cx="' + X(sx) + '" cy="' + Y(jy + 0.25) + '" rx="' + L(0.38) + '" ry="' + L(0.34) + '" fill="' + (night ? '#1E2D22' : ['#4F7A45', '#5E8B4F', '#466E3D'][Math.round(sx * 3) % 3]) + '"/>');
      });
      if (segs.length) marks.push({ x: X((segs[0][0] + segs[0][1]) / 2), y: Y(jy + 0.3), t: 'Jardineras y vegetación' });
      tree(o, X(-1.2), GROUND, sc * 0.82, night, 2);
    }
    // figuras a escala
    person(o, X(s.W + s.cant + 0.9), GROUND, sc, night);
    if (s.W > 10) person(o, X(s.W * 0.42), GROUND, sc * 0.98, night, true);
    // cotas
    var dimC = night || dusk ? '#E6C65C' : '#8A6A12';
    o.push('<g stroke="' + dimC + '" stroke-width="1" fill="' + dimC + '" font-family="Inter,system-ui,sans-serif" font-size="14" font-weight="600">');
    var dy = GROUND + 40, hxp = X(s.W + s.cant) + 42;
    o.push('<line x1="' + X(0) + '" x2="' + X(s.W) + '" y1="' + dy + '" y2="' + dy + '"/><line x1="' + X(0) + '" x2="' + X(0) + '" y1="' + (dy - 6) + '" y2="' + (dy + 6) + '"/><line x1="' + X(s.W) + '" x2="' + X(s.W) + '" y1="' + (dy - 6) + '" y2="' + (dy + 6) + '"/>');
    o.push('<text x="' + X(s.W / 2) + '" y="' + (dy - 8) + '" text-anchor="middle" stroke="none">' + s.W.toFixed(2) + ' m</text>');
    o.push('<line x1="' + hxp + '" x2="' + hxp + '" y1="' + GROUND + '" y2="' + Y(bodyTop) + '"/><line x1="' + (hxp - 6) + '" x2="' + (hxp + 6) + '" y1="' + Y(bodyTop) + '" y2="' + Y(bodyTop) + '"/>');
    o.push('<text x="' + (hxp + 8) + '" y="' + Y(bodyTop / 2) + '" stroke="none">' + bodyTop.toFixed(2) + ' m</text></g>');
    // marcadores numerados (la leyenda va en HTML para que se lea en el teléfono)
    if (opt.marks !== false) {
      marks.forEach(function (mk, i) {
        o.push('<g transform="translate(' + r1(mk.x) + ' ' + r1(mk.y) + ')"><circle r="15" fill="#0B0F17" stroke="#D4AF37" stroke-width="2"/><text y="5.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="15" font-weight="700" fill="#D4AF37">' + (i + 1) + '</text></g>');
      });
    }
    o.push('</svg>');
    return { svg: o.join(''), marks: marks, spec: s };
  }

  function pattern(pid, M, sc) {
    var c = M.c, c2 = M.c2, t = M.tex, w, h, body;
    function q(n) { return r1(n * sc); }
    if (t === 'tablero') { w = q(1.2); h = q(0.6); body = '<rect width="' + w + '" height="' + h + '" fill="' + c + '"/><path d="M0 0H' + w + 'M0 0V' + h + '" stroke="' + c2 + '" stroke-width="1"/>' + [[.15, .2], [.85, .2], [.15, .8], [.85, .8]].map(function (k) { return '<circle cx="' + r1(w * k[0]) + '" cy="' + r1(h * k[1]) + '" r="' + Math.max(1, q(0.02)) + '" fill="' + c2 + '"/>'; }).join('') + '<rect width="' + r1(w / 2) + '" height="' + h + '" fill="#fff" opacity=".04"/>'; }
    else if (t === 'ladrillo') { w = q(0.6); h = q(0.3); body = '<rect width="' + w + '" height="' + h + '" fill="' + c + '"/><path d="M0 0H' + w + 'M0 ' + r1(h / 2) + 'H' + w + 'M' + r1(w / 2) + ' 0V' + r1(h / 2) + 'M0 ' + r1(h / 2) + 'V' + h + '" stroke="#D9CBBF" stroke-width="1" opacity=".75"/><rect x="' + r1(w / 2) + '" y="' + r1(h / 2) + '" width="' + r1(w / 2) + '" height="' + r1(h / 2) + '" fill="' + c2 + '" opacity=".35"/>'; }
    else if (t === 'piedra') { w = q(1.2); h = q(0.8); body = '<rect width="' + w + '" height="' + h + '" fill="' + c2 + '"/>' + [[0, 0, .52, .38], [.55, 0, .45, .3], [.55, .33, .45, .3], [0, .41, .3, .59], [.33, .41, .2, .3], [.33, .74, .64, .26], [.56, .66, .41, .05]].map(function (k, i) { return '<rect x="' + r1(w * k[0] + 1) + '" y="' + r1(h * k[1] + 1) + '" width="' + r1(w * k[2] - 2) + '" height="' + r1(Math.max(1, h * k[3] - 2)) + '" rx="2" fill="' + (i % 2 ? c : shade(c, -8)) + '"/>'; }).join(''); }
    else if (t === 'sillar') { w = q(1.2); h = q(0.6); body = '<rect width="' + w + '" height="' + h + '" fill="' + c + '"/><path d="M0 0H' + w + 'M0 ' + r1(h / 2) + 'H' + w + 'M' + r1(w / 2) + ' 0V' + r1(h / 2) + 'M0 ' + r1(h / 2) + 'V' + h + '" stroke="' + c2 + '" stroke-width="1"/>'; }
    else if (t === 'madera') { w = q(0.6); h = q(3); body = '<rect width="' + w + '" height="' + h + '" fill="' + c + '"/>' + [0, .25, .5, .75].map(function (k, i) { return '<rect x="' + r1(w * k) + '" width="' + r1(w / 4 - 1) + '" height="' + h + '" fill="' + (i % 2 ? c2 : c) + '" opacity=".7"/>'; }).join(''); }
    else if (t === 'panel') { w = q(1.2); h = q(1.5); body = '<rect width="' + w + '" height="' + h + '" fill="' + c + '"/><path d="M0 0H' + w + 'M0 0V' + h + '" stroke="' + c2 + '" stroke-width="1.4"/>'; }
    else { w = q(2); h = q(2); body = '<rect width="' + w + '" height="' + h + '" fill="' + c + '"/><rect width="' + r1(w / 2) + '" height="' + h + '" fill="' + c2 + '" opacity=".12"/>'; }
    return '<pattern id="' + pid + '" width="' + w + '" height="' + h + '" patternUnits="userSpaceOnUse">' + body + '</pattern>';
  }
  function tejaPattern(pid, sc) {
    var w = r1(0.3 * sc), h = r1(0.25 * sc);
    return '<pattern id="' + pid + '" width="' + w + '" height="' + h + '" patternUnits="userSpaceOnUse"><rect width="' + w + '" height="' + h + '" fill="#A9523A"/><path d="M0 ' + h + ' Q' + r1(w / 2) + ' ' + r1(h * 0.2) + ' ' + w + ' ' + h + '" fill="#B9603F" stroke="#7E3A26" stroke-width=".8"/></pattern>';
  }
  function shade(hex, a) {
    var n = parseInt(hex.slice(1), 16), rr = Math.max(0, Math.min(255, (n >> 16) + a)), gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + a)), bb = Math.max(0, Math.min(255, (n & 255) + a));
    return '#' + ((1 << 24) + (rr << 16) + (gg << 8) + bb).toString(16).slice(1);
  }
  function tree(o, x, g, k, night, v) {
    var h = 6.5 * k * (1 + (v % 2) * 0.15), cw = 2.2 * k;
    o.push('<rect x="' + r1(x - 0.12 * k) + '" y="' + r1(g - h * 0.45) + '" width="' + r1(0.24 * k) + '" height="' + r1(h * 0.45) + '" fill="' + (night ? '#1B1F25' : '#5A4632') + '"/>');
    var col = night ? ['#14201A', '#1A2A20'] : ['#4C7444', '#5F8A52'];
    o.push('<ellipse cx="' + r1(x) + '" cy="' + r1(g - h * 0.62) + '" rx="' + r1(cw) + '" ry="' + r1(h * 0.3) + '" fill="' + col[0] + '"/>');
    o.push('<ellipse cx="' + r1(x - cw * 0.35) + '" cy="' + r1(g - h * 0.78) + '" rx="' + r1(cw * 0.7) + '" ry="' + r1(h * 0.2) + '" fill="' + col[1] + '"/>');
  }
  function person(o, x, g, sc, night, flip) {
    var h = 1.72 * sc, c = night ? '#2B313C' : '#3B4350';
    o.push('<g fill="' + c + '" opacity=".85" transform="translate(' + r1(x) + ' ' + r1(g) + ')' + (flip ? ' scale(-1 1)' : '') + '"><circle cy="' + r1(-h * 0.93) + '" r="' + r1(h * 0.07) + '"/><path d="M' + r1(-h * 0.11) + ' ' + r1(-h * 0.83) + ' h' + r1(h * 0.22) + ' l' + r1(h * 0.03) + ' ' + r1(h * 0.38) + ' h' + r1(-h * 0.05) + ' l' + r1(-h * 0.02) + ' ' + r1(h * 0.45) + ' h' + r1(-h * 0.07) + ' l' + r1(-h * 0.01) + ' ' + r1(-h * 0.36) + ' l' + r1(-h * 0.02) + ' ' + r1(h * 0.36) + ' h' + r1(-h * 0.07) + ' l' + r1(-h * 0.01) + ' ' + r1(-h * 0.45) + ' h' + r1(-h * 0.05) + 'Z"/></g>');
  }

  global.RinovaFachada = {
    ESTILOS: ESTILOS, MATERIALES: MATERIALES, ACENTOS: ACENTOS, CANCEL: CANCEL, OPCIONES: OPCIONES, HORAS: HORAS,
    defaults: defaults, normalize: normalize, normRef: normRef, preset: presetFor, suggest: suggest, spec: spec, svg: svg, cost: cost, shade: shade
  };
})(window);
