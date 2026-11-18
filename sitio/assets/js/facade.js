/* Rinova IA — generador paramétrico de fachadas (SVG).
   Lo usa la landing (modo "line", trazo de plano) y el Estudio (modo "render", con sol y sombras
   según latitud, mes y hora). En producción este lugar lo ocupa el Motor Generativo (difusión);
   aquí sirve como maqueta funcional y vista previa instantánea. */
(function (global) {
  'use strict';
  var PHI = (1 + Math.sqrt(5)) / 2;

  function r(n) { return Math.round(n * 10) / 10; }

  /* Posición solar simplificada (suficiente para la maqueta). */
  function sun(lat, month, hour) {
    var decl = 23.44 * Math.sin((2 * Math.PI / 365) * (284 + (month - 0.5) * 30.4));
    var ha = (hour - 12) * 15;
    var d2r = Math.PI / 180;
    var el = Math.asin(Math.sin(lat * d2r) * Math.sin(decl * d2r) +
      Math.cos(lat * d2r) * Math.cos(decl * d2r) * Math.cos(ha * d2r)) / d2r;
    return { elevation: Math.max(-10, el), hourAngle: ha };
  }

  /* Espiral áurea dentro del rectángulo x,y,w (alto = w/φ). */
  function spiral(x, y, w) {
    var h = w / PHI, d = '', dir = 0, s, i;
    var cx = x, cy = y, cw = w, ch = h, rects = '';
    for (i = 0; i < 9; i++) {
      if (dir === 0) { s = ch; rects += rect(cx, cy, s, s); d += (i ? '' : 'M' + r(cx) + ' ' + r(cy + s)) + ' A' + r(s) + ' ' + r(s) + ' 0 0 1 ' + r(cx + s) + ' ' + r(cy); cx += s; cw -= s; }
      else if (dir === 1) { s = cw; rects += rect(cx, cy, s, s); d += ' A' + r(s) + ' ' + r(s) + ' 0 0 1 ' + r(cx + s) + ' ' + r(cy + s); cy += s; ch -= s; }
      else if (dir === 2) { s = ch; rects += rect(cx + cw - s, cy, s, s); d += ' A' + r(s) + ' ' + r(s) + ' 0 0 1 ' + r(cx + cw - s) + ' ' + r(cy + s); cw -= s; }
      else { s = cw; rects += rect(cx, cy + ch - s, s, s); d += ' A' + r(s) + ' ' + r(s) + ' 0 0 1 ' + r(cx) + ' ' + r(cy + ch - s); ch -= s; }
      dir = (dir + 1) % 4;
    }
    return { rects: rects, path: d, h: h };
  }
  function rect(x, y, w, h) { return '<rect x="' + r(x) + '" y="' + r(y) + '" width="' + r(w) + '" height="' + r(h) + '"/>'; }

  function build(opts) {
    var o = Object.assign({ floors: 3, bays: 7, style: 'renacentista', mode: 'line', phi: true,
      lat: 19.4, month: 6, hour: 16, width: 900, height: 600, palette: 'travertino', id: 'f' }, opts || {});
    var W = o.width, H = o.height, ground = H - 70;
    var floors = Math.max(1, Math.min(7, o.floors | 0));
    var bays = Math.max(3, Math.min(11, o.bays | 0));
    var maxW = W * 0.78;
    var fh = Math.min(92, (ground - 120) / (floors + 0.9));
    var bw = Math.min(maxW / bays, fh * 1.05);
    var BW = bw * bays, x0 = (W - BW) / 2;
    var gfh = fh * 1.18; // planta baja más alta (loggia)
    var top = ground - gfh - fh * (floors - 1);
    var corn = fh * 0.22;
    var isLine = o.mode === 'line';
    var id = o.id;

    var pal = {
      travertino: { wall: '#e9dcc2', wall2: '#d9c7a4', trim: '#f6efe0', roof: '#a5553a', glass: '#41566e', door: '#5a3e2b' },
      marmol: { wall: '#eeeae3', wall2: '#dcd6cb', trim: '#fbfaf7', roof: '#7d7466', glass: '#3c4f63', door: '#4a3d31' },
      terracota: { wall: '#d9a47c', wall2: '#c48a62', trim: '#f2e2cc', roof: '#9a4a2e', glass: '#3d4d5e', door: '#5c3a24' }
    }[o.palette] || {};

    var s = sun(o.lat, o.month, o.hour);
    var elev = Math.max(4, s.elevation);
    var shadowLen = Math.min(1.6, 1 / Math.tan(elev * Math.PI / 180)); // relación sombra/altura
    var shadowDir = s.hourAngle >= 0 ? 1 : -1; // el sol baja por la izquierda en la tarde: sombra a la derecha
    var depth = Math.min(14, 4 + shadowLen * 6);

    var stroke = isLine ? 'var(--f-line,#24436e)' : 'rgba(40,30,20,.55)';
    var sw = isLine ? 1.2 : 0.8;
    var out = [];

    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Fachada ' + o.style + ' de ' + floors + ' niveles y ' + bays + ' crujías">');
    out.push('<defs>' +
      '<linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (elev < 12 ? '#e7b98a' : '#b9cde0') + '"/><stop offset="1" stop-color="' + (elev < 12 ? '#f6e3c6' : '#efe7d6') + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + pal.wall + '"/><stop offset="1" stop-color="' + pal.wall2 + '"/></linearGradient>' +
      '<linearGradient id="' + id + 'glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fa6bd"/><stop offset=".45" stop-color="' + pal.glass + '"/><stop offset="1" stop-color="#26313d"/></linearGradient>' +
      '<pattern id="' + id + 'grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="rgba(36,67,110,.08)" stroke-width="1"/></pattern>' +
      '</defs>');

    // Fondo
    if (isLine) {
      out.push('<rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'grid)"/>');
    } else {
      out.push('<rect width="' + W + '" height="' + ground + '" fill="url(#' + id + 'sky)"/>');
      var sunX = W / 2 - (s.hourAngle / 90) * (W * 0.45), sunY = ground - (elev / 90) * (ground - 40) - 20;
      out.push('<circle cx="' + r(sunX) + '" cy="' + r(sunY) + '" r="26" fill="#fff4d8" opacity=".9"/><circle cx="' + r(sunX) + '" cy="' + r(sunY) + '" r="60" fill="#fff4d8" opacity=".25"/>');
      // colinas lejanas
      out.push('<path d="M0 ' + (ground - 40) + ' Q ' + W * 0.2 + ' ' + (ground - 95) + ' ' + W * 0.42 + ' ' + (ground - 48) + ' T ' + W + ' ' + (ground - 60) + ' V' + ground + ' H0Z" fill="#9fae8f" opacity=".55"/>');
      out.push('<rect y="' + ground + '" width="' + W + '" height="' + (H - ground) + '" fill="#cdbf9f"/>');
      out.push('<rect y="' + ground + '" width="' + W + '" height="6" fill="#b7a987"/>');
      // sombra proyectada del edificio sobre el suelo
      var shW = (ground - top) * shadowLen * 0.35;
      out.push('<path d="M' + r(x0) + ' ' + ground + ' H' + r(x0 + BW) + ' L' + r(x0 + BW + shadowDir * shW) + ' ' + r(ground + 24) + ' H' + r(x0 + shadowDir * shW) + ' Z" fill="rgba(60,45,30,.22)"/>');
      // cipreses
      [x0 - 60, x0 + BW + 40].forEach(function (cx, k) {
        var th = 140 + k * 30;
        out.push('<path d="M' + r(cx) + ' ' + ground + ' C ' + r(cx - 16) + ' ' + r(ground - th * 0.5) + ' ' + r(cx - 6) + ' ' + r(ground - th) + ' ' + r(cx) + ' ' + r(ground - th - 10) + ' C ' + r(cx + 6) + ' ' + r(ground - th) + ' ' + r(cx + 16) + ' ' + r(ground - th * 0.5) + ' ' + r(cx) + ' ' + ground + 'Z" fill="#3f5a3c"/>');
      });
    }

    // Línea de suelo
    out.push('<line x1="' + r(W * 0.04) + '" y1="' + ground + '" x2="' + r(W * 0.96) + '" y2="' + ground + '" stroke="' + stroke + '" stroke-width="' + (sw * 1.4) + '"/>');

    var G = '<g fill="' + (isLine ? 'none' : 'url(#' + id + 'wall)') + '" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linejoin="round" class="f-draw">';
    out.push(G);

    // Basamento / podio
    out.push('<rect x="' + r(x0 - 6) + '" y="' + r(ground - 10) + '" width="' + r(BW + 12) + '" height="10"' + (isLine ? '' : ' fill="' + pal.wall2 + '"') + '/>');
    // Cuerpo
    out.push('<rect x="' + r(x0) + '" y="' + r(top) + '" width="' + r(BW) + '" height="' + r(ground - 10 - top) + '"/>');

    var i, j, cx, wy, ww, wh;
    // Planta baja
    var gTop = ground - 10 - gfh;
    for (i = 0; i < bays; i++) {
      cx = x0 + bw * i + bw / 2;
      if (o.style === 'moderno') {
        ww = bw * 0.84; wh = gfh * 0.78;
        out.push('<rect x="' + r(cx - ww / 2) + '" y="' + r(gTop + gfh * 0.14) + '" width="' + r(ww) + '" height="' + r(wh) + '" fill="' + (isLine ? 'none' : 'url(#' + id + 'glass)') + '"/>');
        out.push('<line x1="' + r(cx) + '" y1="' + r(gTop + gfh * 0.14) + '" x2="' + r(cx) + '" y2="' + r(gTop + gfh * 0.92) + '"/>');
      } else {
        // arcada de medio punto sobre columnas
        var aw = bw * 0.72, ah = gfh * 0.82, ay = gTop + gfh - ah;
        var rr = aw / 2;
        var isDoor = (i === Math.floor(bays / 2));
        out.push('<path d="M' + r(cx - rr) + ' ' + r(ground - 10) + ' V' + r(ay + rr) + ' A' + r(rr) + ' ' + r(rr) + ' 0 0 1 ' + r(cx + rr) + ' ' + r(ay + rr) + ' V' + r(ground - 10) + ' Z"' +
          (isLine ? '' : ' fill="' + (isDoor ? pal.door : 'rgba(55,42,30,.72)') + '"') + '/>');
        if (!isLine) out.push('<path d="M' + r(cx - rr) + ' ' + r(ay + rr) + ' A' + r(rr) + ' ' + r(rr) + ' 0 0 1 ' + r(cx + rr) + ' ' + r(ay + rr) + ' v' + r(depth) + ' A' + r(rr) + ' ' + r(rr) + ' 0 0 0 ' + r(cx - rr) + ' ' + r(ay + rr + depth) + 'Z" fill="rgba(20,14,8,.35)" stroke="none"/>');
        // dovela clave
        out.push('<path d="M' + r(cx - 5) + ' ' + r(ay - 2) + ' h10 l-2 10 h-6z"' + (isLine ? '' : ' fill="' + pal.trim + '"') + '/>');
        // columna entre arcos
        if (i > 0) {
          var colx = x0 + bw * i;
          out.push('<rect x="' + r(colx - bw * 0.06) + '" y="' + r(ay + rr - 6) + '" width="' + r(bw * 0.12) + '" height="' + r(ground - 10 - (ay + rr - 6)) + '"' + (isLine ? '' : ' fill="' + pal.trim + '"') + '/>');
          out.push('<rect x="' + r(colx - bw * 0.1) + '" y="' + r(ay + rr - 10) + '" width="' + r(bw * 0.2) + '" height="5"' + (isLine ? '' : ' fill="' + pal.trim + '"') + '/>');
        }
      }
    }
    // Imposta / cornisa de planta baja
    out.push('<rect x="' + r(x0 - 4) + '" y="' + r(gTop - 6) + '" width="' + r(BW + 8) + '" height="8"' + (isLine ? '' : ' fill="' + pal.trim + '"') + '/>');

    // Pisos superiores
    for (j = 1; j < floors; j++) {
      var fy = gTop - fh * j;
      for (i = 0; i < bays; i++) {
        cx = x0 + bw * i + bw / 2;
        if (o.style === 'moderno') {
          ww = bw * 0.84; wh = fh * 0.7; wy = fy + fh * 0.16;
          out.push('<rect x="' + r(cx - ww / 2) + '" y="' + r(wy) + '" width="' + r(ww) + '" height="' + r(wh) + '" fill="' + (isLine ? 'none' : 'url(#' + id + 'glass)') + '"/>');
          if (!isLine) out.push('<rect x="' + r(cx - ww / 2) + '" y="' + r(wy) + '" width="' + r(ww) + '" height="' + r(depth * 0.6) + '" fill="rgba(0,0,0,.25)" stroke="none"/>');
        } else {
          ww = bw * 0.4; wh = fh * 0.56; wy = fy + fh * 0.26;
          var arched = o.style === 'mediterraneo' || j === floors - 1 && floors > 2;
          if (arched) {
            out.push('<path d="M' + r(cx - ww / 2) + ' ' + r(wy + wh) + ' V' + r(wy + ww / 2) + ' A' + r(ww / 2) + ' ' + r(ww / 2) + ' 0 0 1 ' + r(cx + ww / 2) + ' ' + r(wy + ww / 2) + ' V' + r(wy + wh) + 'Z"' + (isLine ? '' : ' fill="url(#' + id + 'glass)"') + '/>');
          } else {
            out.push('<rect x="' + r(cx - ww / 2) + '" y="' + r(wy) + '" width="' + r(ww) + '" height="' + r(wh) + '"' + (isLine ? '' : ' fill="url(#' + id + 'glass)"') + '/>');
            // frontón alterno triangular / segmentado
            if ((i + j) % 2 === 0) out.push('<path d="M' + r(cx - ww / 2 - 6) + ' ' + r(wy - 3) + ' L' + r(cx) + ' ' + r(wy - 16) + ' L' + r(cx + ww / 2 + 6) + ' ' + r(wy - 3) + 'Z"' + (isLine ? '' : ' fill="' + pal.trim + '"') + '/>');
            else out.push('<path d="M' + r(cx - ww / 2 - 6) + ' ' + r(wy - 3) + ' Q' + r(cx) + ' ' + r(wy - 20) + ' ' + r(cx + ww / 2 + 6) + ' ' + r(wy - 3) + 'Z"' + (isLine ? '' : ' fill="' + pal.trim + '"') + '/>');
          }
          if (!isLine) out.push('<rect x="' + r(cx - ww / 2) + '" y="' + r(wy + wh - 3) + '" width="' + r(ww) + '" height="3" fill="' + pal.trim + '" stroke="none"/>');
          out.push('<rect x="' + r(cx - ww / 2 - 4) + '" y="' + r(wy + wh) + '" width="' + r(ww + 8) + '" height="4"' + (isLine ? '' : ' fill="' + pal.trim + '"') + '/>');
        }
      }
      // línea de entrepiso
      out.push('<line x1="' + r(x0) + '" y1="' + r(fy + fh) + '" x2="' + r(x0 + BW) + '" y2="' + r(fy + fh) + '" stroke-width="' + (sw * 0.7) + '"/>');
    }

    // Cornisa superior con sombra
    out.push('<rect x="' + r(x0 - 12) + '" y="' + r(top - corn) + '" width="' + r(BW + 24) + '" height="' + r(corn) + '"' + (isLine ? '' : ' fill="' + pal.trim + '"') + '/>');
    if (!isLine) out.push('<rect x="' + r(x0) + '" y="' + r(top) + '" width="' + r(BW) + '" height="' + r(depth) + '" fill="rgba(40,28,16,.25)" stroke="none"/>');
    // dentículos
    if (o.style !== 'moderno') {
      for (i = 0; i < bays * 4; i++) {
        var dx = x0 - 8 + (BW + 16) / (bays * 4) * i;
        out.push('<rect x="' + r(dx) + '" y="' + r(top - 4) + '" width="' + r((BW + 16) / (bays * 8)) + '" height="4" stroke-width="' + (sw * 0.6) + '"' + (isLine ? '' : ' fill="' + pal.wall2 + '"') + '/>');
      }
    }

    // Remate
    if (o.style === 'renacentista') {
      var pw = bw * Math.min(3, bays - 2), ph = pw / (PHI * 2.4);
      out.push('<path d="M' + r(W / 2 - pw / 2 - 10) + ' ' + r(top - corn) + ' L' + r(W / 2) + ' ' + r(top - corn - ph) + ' L' + r(W / 2 + pw / 2 + 10) + ' ' + r(top - corn) + 'Z"' + (isLine ? '' : ' fill="' + pal.trim + '"') + '/>');
      out.push('<circle cx="' + r(W / 2) + '" cy="' + r(top - corn - ph * 0.42) + '" r="' + r(ph * 0.22) + '"' + (isLine ? '' : ' fill="' + pal.wall2 + '"') + '/>');
    } else if (o.style === 'mediterraneo') {
      out.push('<path d="M' + r(x0 - 18) + ' ' + r(top - corn) + ' L' + r(x0 + BW * 0.18) + ' ' + r(top - corn - fh * 0.7) + ' H' + r(x0 + BW * 0.82) + ' L' + r(x0 + BW + 18) + ' ' + r(top - corn) + 'Z"' + (isLine ? '' : ' fill="' + pal.roof + '"') + '/>');
    } else {
      out.push('<rect x="' + r(x0 + BW * 0.62) + '" y="' + r(top - corn - fh * 0.55) + '" width="' + r(BW * 0.3) + '" height="' + r(fh * 0.55) + '"' + (isLine ? '' : ' fill="' + pal.wall2 + '"') + '/>');
    }
    out.push('</g>');

    // Cotas (modo plano)
    if (isLine) {
      var dy = ground + 30;
      out.push('<g stroke="var(--f-dim,#b0823a)" stroke-width="1" fill="var(--f-dim,#b0823a)" font-family="Manrope,system-ui,sans-serif" font-size="11">' +
        '<line x1="' + r(x0) + '" y1="' + dy + '" x2="' + r(x0 + BW) + '" y2="' + dy + '"/>' +
        '<line x1="' + r(x0) + '" y1="' + (dy - 6) + '" x2="' + r(x0) + '" y2="' + (dy + 6) + '"/><line x1="' + r(x0 + BW) + '" y1="' + (dy - 6) + '" x2="' + r(x0 + BW) + '" y2="' + (dy + 6) + '"/>' +
        '<text x="' + r(W / 2) + '" y="' + (dy - 6) + '" text-anchor="middle" stroke="none">' + (o.frontM ? o.frontM * 0.92 : bays * 2.6).toFixed(2) + ' m</text>' +
        '<line x1="' + r(x0 + BW + 34) + '" y1="' + r(top - corn) + '" x2="' + r(x0 + BW + 34) + '" y2="' + ground + '"/>' +
        '<text x="' + r(x0 + BW + 42) + '" y="' + r((top + ground) / 2) + '" stroke="none">' + (floors * 3.6 + 0.9).toFixed(2) + ' m</text>' +
        '</g>');
    }

    // Superposición áurea
    if (o.phi) {
      var bH = ground - (top - corn);
      var sw2 = BW + 24, sp;
      // ajusta la espiral al alto del edificio
      if (sw2 / PHI > bH) sw2 = bH * PHI;
      sp = spiral(W / 2 - sw2 / 2, ground - sw2 / PHI, sw2);
      out.push('<g class="f-phi" fill="none" stroke="' + (isLine ? 'var(--f-dim,#b0823a)' : 'rgba(214,178,106,.95)') + '" stroke-width="' + (isLine ? 1 : 1.4) + '">' +
        '<g opacity=".45" stroke-dasharray="3 4">' + sp.rects + '</g><path d="' + sp.path + '" class="f-spiral"/></g>');
    }

    out.push('</svg>');
    return out.join('');
  }

  global.RinovaFacade = { build: build, sun: sun, PHI: PHI };
})(window);
