/* RINOVAIA — Datos del proyecto: ubicación (estado → ciudad), tipo de inmueble, programa arquitectónico
   y análisis experto con reglas de arquitecto. Corre en el navegador y no depende de la red.
   Los valores sísmicos, de suelo y de costo son aproximaciones preliminares por región; en producción
   se sustituyen por el estudio de mecánica de suelos y el reglamento municipal del predio. */
(function () {
  'use strict';

  /* ---------- Ubicación ----------
     c: coeficiente sísmico aproximado · q: capacidad de suelo (kPa) · f: factor de costo regional · w: factor de viento.
     Cada ciudad: [nombre, latitud, {ajustes opcionales}] */
  var ESTADOS = {
    ags: { n: 'Aguascalientes', a: 'Ags.', c: 0.10, q: 180, f: 0.98, w: 0.8, cities: [['Aguascalientes', 21.88], ['Jesús María', 21.96], ['Calvillo', 21.85]] },
    bc: { n: 'Baja California', a: 'B.C.', c: 0.32, q: 150, f: 1.06, w: 1.0, cities: [['Tijuana', 32.52], ['Mexicali', 32.62], ['Ensenada', 31.87], ['Playas de Rosarito', 32.36], ['Tecate', 32.57]] },
    bcs: { n: 'Baja California Sur', a: 'B.C.S.', c: 0.16, q: 160, f: 1.12, w: 1.5, cities: [['La Paz', 24.14], ['San José del Cabo', 23.06], ['Cabo San Lucas', 22.89], ['Loreto', 26.01]] },
    camp: { n: 'Campeche', a: 'Camp.', c: 0.06, q: 180, f: 0.95, w: 1.3, cities: [['Campeche', 19.85], ['Ciudad del Carmen', 18.65], ['Champotón', 19.35]] },
    chis: { n: 'Chiapas', a: 'Chis.', c: 0.38, q: 150, f: 0.93, w: 0.9, cities: [['Tuxtla Gutiérrez', 16.75], ['Tapachula', 14.91, { c: 0.45 }], ['San Cristóbal de las Casas', 16.74], ['Comitán', 16.25]] },
    chih: { n: 'Chihuahua', a: 'Chih.', c: 0.08, q: 200, f: 1.0, w: 1.0, cities: [['Chihuahua', 28.63], ['Ciudad Juárez', 31.69], ['Delicias', 28.19], ['Hidalgo del Parral', 26.93]] },
    cdmx: { n: 'Ciudad de México', a: 'CDMX', c: 0.32, q: 120, f: 1.08, w: 0.9, cities: [
      ['Cuauhtémoc', 19.43, { c: 0.40, q: 60, soil: 'lago' }], ['Benito Juárez', 19.37, { c: 0.40, q: 60, soil: 'lago' }],
      ['Miguel Hidalgo', 19.43, { c: 0.32, q: 120, soil: 'transición' }], ['Coyoacán', 19.35, { c: 0.36, q: 90, soil: 'transición' }],
      ['Álvaro Obregón', 19.36, { c: 0.24, q: 200, soil: 'lomas' }], ['Cuajimalpa', 19.36, { c: 0.24, q: 220, soil: 'lomas', f: 1.12 }],
      ['Tlalpan', 19.29, { c: 0.24, q: 200, soil: 'lomas' }], ['Iztapalapa', 19.36, { c: 0.40, q: 50, soil: 'lago', f: 1.0 }],
      ['Gustavo A. Madero', 19.48, { c: 0.40, q: 60, soil: 'lago', f: 1.0 }], ['Azcapotzalco', 19.48, { c: 0.36, q: 80, soil: 'transición' }],
      ['Xochimilco', 19.26, { c: 0.40, q: 45, soil: 'lago', f: 1.0 }]] },
    coah: { n: 'Coahuila', a: 'Coah.', c: 0.08, q: 200, f: 1.0, w: 1.0, cities: [['Saltillo', 25.42], ['Torreón', 25.54], ['Monclova', 26.91], ['Piedras Negras', 28.70]] },
    col: { n: 'Colima', a: 'Col.', c: 0.45, q: 150, f: 0.96, w: 1.3, cities: [['Colima', 19.24], ['Manzanillo', 19.05], ['Villa de Álvarez', 19.27], ['Tecomán', 18.91]] },
    dgo: { n: 'Durango', a: 'Dgo.', c: 0.08, q: 200, f: 0.95, w: 0.9, cities: [['Durango', 24.02], ['Gómez Palacio', 25.57], ['Lerdo', 25.54]] },
    gto: { n: 'Guanajuato', a: 'Gto.', c: 0.16, q: 170, f: 1.0, w: 0.8, cities: [['León', 21.12], ['Guanajuato', 21.02], ['Irapuato', 20.67], ['Celaya', 20.52], ['San Miguel de Allende', 20.91, { f: 1.08 }]] },
    gro: { n: 'Guerrero', a: 'Gro.', c: 0.45, q: 140, f: 0.98, w: 1.3, cities: [['Acapulco', 16.85, { f: 1.05 }], ['Chilpancingo', 17.55], ['Zihuatanejo', 17.64, { f: 1.05 }], ['Taxco', 18.56, { c: 0.32 }], ['Iguala', 18.34, { c: 0.32 }]] },
    hgo: { n: 'Hidalgo', a: 'Hgo.', c: 0.16, q: 170, f: 0.96, w: 0.8, cities: [['Pachuca', 20.10], ['Mineral de la Reforma', 20.07], ['Tulancingo', 20.08], ['Tula de Allende', 20.05]] },
    jal: { n: 'Jalisco', a: 'Jal.', c: 0.32, q: 160, f: 1.0, w: 0.8, cities: [['Guadalajara', 20.67], ['Zapopan', 20.72, { f: 1.04 }], ['San Pedro Tlaquepaque', 20.64], ['Tonalá', 20.62], ['Tlajomulco de Zúñiga', 20.47], ['Puerto Vallarta', 20.65, { f: 1.08, w: 1.3 }], ['Lagos de Moreno', 21.36, { c: 0.16 }]] },
    mex: { n: 'Estado de México', a: 'Edo. Méx.', c: 0.24, q: 160, f: 1.02, w: 0.8, cities: [['Toluca', 19.29], ['Metepec', 19.25], ['Naucalpan', 19.48], ['Huixquilucan', 19.36, { f: 1.10 }], ['Tlalnepantla', 19.54], ['Atizapán de Zaragoza', 19.56], ['Ecatepec', 19.60, { c: 0.36, q: 70, soil: 'lago' }], ['Nezahualcóyotl', 19.40, { c: 0.40, q: 50, soil: 'lago' }]] },
    mich: { n: 'Michoacán', a: 'Mich.', c: 0.28, q: 160, f: 0.95, w: 0.8, cities: [['Morelia', 19.70], ['Uruapan', 19.42], ['Zamora', 19.98], ['Lázaro Cárdenas', 17.96, { c: 0.45, w: 1.2 }]] },
    mor: { n: 'Morelos', a: 'Mor.', c: 0.30, q: 170, f: 0.99, w: 0.8, cities: [['Cuernavaca', 18.92], ['Jiutepec', 18.88], ['Cuautla', 18.81], ['Temixco', 18.85]] },
    nay: { n: 'Nayarit', a: 'Nay.', c: 0.30, q: 150, f: 0.97, w: 1.1, cities: [['Tepic', 21.50], ['Bahía de Banderas', 20.70, { f: 1.08, w: 1.3 }], ['Compostela', 21.24]] },
    nl: { n: 'Nuevo León', a: 'N.L.', c: 0.16, q: 200, f: 1.04, w: 1.0, cities: [['Monterrey', 25.69], ['San Pedro Garza García', 25.66, { f: 1.12 }], ['San Nicolás de los Garza', 25.75], ['Guadalupe', 25.68], ['Apodaca', 25.78], ['Santa Catarina', 25.67], ['García', 25.81]] },
    oax: { n: 'Oaxaca', a: 'Oax.', c: 0.45, q: 150, f: 0.94, w: 1.1, cities: [['Oaxaca de Juárez', 17.06], ['Salina Cruz', 16.17], ['Santa María Huatulco', 15.77, { f: 1.04 }], ['Puerto Escondido', 15.86, { f: 1.04 }], ['Juchitán', 16.43]] },
    pue: { n: 'Puebla', a: 'Pue.', c: 0.36, q: 140, f: 0.96, w: 0.8, cities: [['Puebla', 19.04], ['San Andrés Cholula', 19.05, { f: 1.02 }], ['Tehuacán', 18.46], ['Atlixco', 18.91]] },
    qro: { n: 'Querétaro', a: 'Qro.', c: 0.18, q: 180, f: 1.0, w: 0.8, cities: [['Querétaro', 20.59], ['Corregidora', 20.54], ['El Marqués', 20.62], ['San Juan del Río', 20.39]] },
    qroo: { n: 'Quintana Roo', a: 'Q. Roo', c: 0.08, q: 120, f: 1.12, w: 1.6, cities: [['Cancún', 21.16], ['Playa del Carmen', 20.63], ['Tulum', 20.21], ['Cozumel', 20.51], ['Chetumal', 18.50, { f: 1.0 }]] },
    slp: { n: 'San Luis Potosí', a: 'S.L.P.', c: 0.10, q: 190, f: 0.96, w: 0.9, cities: [['San Luis Potosí', 22.15], ['Soledad de Graciano Sánchez', 22.18], ['Ciudad Valles', 21.99], ['Matehuala', 23.65]] },
    sin: { n: 'Sinaloa', a: 'Sin.', c: 0.20, q: 150, f: 0.98, w: 1.2, cities: [['Culiacán', 24.80], ['Mazatlán', 23.25, { f: 1.05, w: 1.4 }], ['Los Mochis', 25.79]] },
    son: { n: 'Sonora', a: 'Son.', c: 0.16, q: 190, f: 1.0, w: 1.0, cities: [['Hermosillo', 29.07], ['Ciudad Obregón', 27.49], ['Nogales', 31.31], ['Guaymas', 27.92], ['Puerto Peñasco', 31.32]] },
    tab: { n: 'Tabasco', a: 'Tab.', c: 0.14, q: 80, f: 0.97, w: 1.1, cities: [['Villahermosa', 17.99], ['Cárdenas', 18.00], ['Comalcalco', 18.26], ['Paraíso', 18.40]] },
    tamps: { n: 'Tamaulipas', a: 'Tamps.', c: 0.08, q: 170, f: 0.98, w: 1.2, cities: [['Reynosa', 26.09], ['Matamoros', 25.87], ['Nuevo Laredo', 27.48], ['Tampico', 22.25, { w: 1.4, q: 120 }], ['Ciudad Victoria', 23.74]] },
    tlax: { n: 'Tlaxcala', a: 'Tlax.', c: 0.20, q: 160, f: 0.94, w: 0.8, cities: [['Tlaxcala', 19.32], ['Apizaco', 19.41], ['Huamantla', 19.31]] },
    ver: { n: 'Veracruz', a: 'Ver.', c: 0.24, q: 120, f: 0.98, w: 1.3, cities: [['Veracruz', 19.17], ['Boca del Río', 19.10, { f: 1.04 }], ['Xalapa', 19.54, { w: 0.9, q: 160 }], ['Coatzacoalcos', 18.14], ['Córdoba', 18.88, { w: 0.9 }], ['Poza Rica', 20.53]] },
    yuc: { n: 'Yucatán', a: 'Yuc.', c: 0.08, q: 220, f: 0.97, w: 1.2, cities: [['Mérida', 20.97], ['Progreso', 21.28, { w: 1.4 }], ['Valladolid', 20.69], ['Tizimín', 21.14]] },
    zac: { n: 'Zacatecas', a: 'Zac.', c: 0.10, q: 200, f: 0.94, w: 0.9, cities: [['Zacatecas', 22.77], ['Fresnillo', 23.17], ['Guadalupe', 22.75]] }
  };
  function slug(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  Object.keys(ESTADOS).forEach(function (k) {
    ESTADOS[k].cities = ESTADOS[k].cities.map(function (c) { return { id: slug(c[0]), n: c[0], lat: c[1], o: c[2] || {} }; });
  });
  // Claves de la versión anterior (una sola lista de ciudades)
  var LEGACY = { cdmx: ['cdmx', 'cuauhtemoc'], gdl: ['jal', 'guadalajara'], mty: ['nl', 'monterrey'], pue: ['pue', 'puebla'], qro: ['qro', 'queretaro'], mid: ['yuc', 'merida'], cun: ['qroo', 'cancun'] };

  function zoneText(c, q, w, soil) {
    var z = c < 0.12 ? 'Muy baja' : c < 0.2 ? 'Baja' : c < 0.34 ? 'Media' : c < 0.42 ? 'Alta' : 'Muy alta';
    if (soil === 'lago' || q <= 80) z += ' · suelo blando';
    if (w >= 1.4) z += ' · huracanes';
    return z;
  }
  function loc(state, city) {
    var e = ESTADOS[state] || ESTADOS.cdmx;
    var ci = e.cities.filter(function (x) { return x.id === city; })[0] || e.cities[0];
    var c = ci.o.c != null ? ci.o.c : e.c, q = ci.o.q != null ? ci.o.q : e.q, w = ci.o.w != null ? ci.o.w : e.w;
    return { id: ci.id, state: state in ESTADOS ? state : 'cdmx', stateName: e.n, name: ci.n + ', ' + e.a, short: ci.n, lat: ci.lat,
      c: c, q: q, f: ci.o.f != null ? ci.o.f : e.f, wind: w, soil: ci.o.soil || (q <= 80 ? 'blando' : 'firme'), zone: zoneText(c, q, w, ci.o.soil) };
  }
  function normalizeLoc(p) {
    if (LEGACY[p.city] && !p.state) { p.state = LEGACY[p.city][0]; p.city = LEGACY[p.city][1]; }
    if (!ESTADOS[p.state]) p.state = 'cdmx';
    var e = ESTADOS[p.state];
    if (!e.cities.some(function (c) { return c.id === p.city; })) p.city = e.cities[0].id;
    return p;
  }

  /* ---------- Tipos de inmueble ---------- */
  var TIPOS = {
    casa: { n: 'Casa', use: 'res', unitsLabel: null },
    deptos: { n: 'Departamentos', use: 'res', unitsLabel: 'Departamentos por piso', unitsMax: 8 },
    comercial: { n: 'Centro comercial', use: 'com', unitsLabel: 'Locales por piso', unitsMax: 24 },
    bodega: { n: 'Bodega', use: 'ind', unitsLabel: 'Andenes de carga', unitsMax: 12 }
  };
  var DISTRIBUCION = {
    abierto: 'Concepto abierto (sala, comedor y cocina integrados)',
    tradicional: 'Tradicional (espacios separados)',
    'rec-pb': 'Con recámara en planta baja',
    'planta-libre': 'Planta libre (muros mínimos)'
  };
  var PISOS = {
    porcelanato: { n: 'Porcelanato', k: 0 }, marmol: { n: 'Mármol', k: 5 }, madera: { n: 'Madera de ingeniería', k: 3 },
    concreto: { n: 'Concreto pulido', k: -3 }, vinil: { n: 'Vinil / SPC', k: -2 }, epoxico: { n: 'Epóxico industrial', k: -1 }
  };

  /* ---------- Programa arquitectónico ----------
     Devuelve por nivel: { front: [espacios hacia la calle], back: [espacios al fondo] }.
     Cada espacio: { n: nombre, a: área objetivo m², k: clase (soc, rec, bano, serv, coch, circ, com, alm, ofi, depto) } */
  function R(n, a, k, extra) { var o = { n: n, a: a, k: k }; if (extra) for (var x in extra) o[x] = extra[x]; return o; }

  function deptoRooms(beds, baths, half, layout) {
    var rooms = [];
    if (layout === 'tradicional') { rooms.push(R('Sala', 16, 'soc'), R('Comedor', 10, 'soc'), R('Cocina', 8, 'serv')); }
    else rooms.push(R('Estancia · comedor · cocina', 30 + beds * 2, 'soc'));
    for (var i = 0; i < beds; i++) rooms.push(R(i === 0 ? 'Rec. principal' : 'Recámara ' + (i + 1), i === 0 ? 14 : 10.5, 'rec'));
    for (i = 0; i < baths; i++) rooms.push(R(i === 0 && beds > 1 ? 'Baño principal' : 'Baño', 5, 'bano'));
    for (i = 0; i < half; i++) rooms.push(R('Medio baño', 2.6, 'bano'));
    rooms.push(R('Lavado', 3.5, 'serv'));
    return rooms;
  }
  function deptoArea(p) { return deptoRooms(p.beds, p.baths, p.halfBaths, p.layout).reduce(function (s, r) { return s + r.a; }, 0) * 1.12; }

  function program(p) {
    var F = Math.max(1, p.floors), lv = [], i, t = p.type || 'casa';
    var beds = Math.max(0, p.beds | 0), baths = Math.max(0, p.baths | 0), half = Math.max(0, p.halfBaths | 0), park = Math.max(0, p.parking | 0);
    var units = Math.max(1, p.units | 0);
    for (i = 0; i < F; i++) lv.push({ front: [], back: [], note: '' });

    if (t === 'casa') {
      var stair = F > 1;
      var bedsPB = F === 1 ? beds : (p.layout === 'rec-pb' ? Math.min(1, beds) : 0);
      var bathsPB = F === 1 ? baths : (bedsPB ? 1 : 0);
      var halfPB = Math.min(half, 1), halfUp = half - halfPB;
      var pb = lv[0];
      if (park > 0) pb.front.push(R('Cochera', Math.min(park, 3) * 15, 'coch', { cars: Math.min(park, 3) }));
      if (p.layout === 'abierto' || p.layout === 'planta-libre') pb.front.push(R('Sala · comedor', 34, 'soc'), R('Cocina abierta', 14, 'serv'));
      else pb.front.push(R('Sala', 22, 'soc'), R('Comedor', 15, 'soc'));
      if (!(p.layout === 'abierto' || p.layout === 'planta-libre')) pb.back.push(R('Cocina', 13, 'serv'));
      if (stair) pb.back.push(R('Escalera', 9, 'circ'));
      for (i = 0; i < halfPB; i++) pb.back.push(R('Medio baño', 3, 'bano'));
      for (i = 0; i < bedsPB; i++) pb.back.push(R(F === 1 && i === 0 ? 'Recámara principal' : 'Recámara ' + (i + 1), F === 1 && i === 0 ? 16 : 12, 'rec'));
      for (i = 0; i < bathsPB; i++) pb.back.push(R(F === 1 && i === 0 ? 'Baño principal' : 'Baño ' + (i + 1), i === 0 && F === 1 ? 7 : 5, 'bano'));
      pb.back.push(R('Patio de servicio', 7, 'serv'));
      if (F === 1) { pb.back.push(R('Estudio', 9, 'soc')); }
      else {
        // Reparte recámaras, baños y medios baños restantes entre los niveles superiores
        var restB = beds - bedsPB, restBa = baths - bathsPB, upper = F - 1, bi = bedsPB, bai = bathsPB;
        for (var l = 1; l < F; l++) {
          var nb = Math.ceil(restB / (upper - l + 1)), nba = Math.ceil(restBa / (upper - l + 1)), lvl = lv[l];
          lvl.back.push(R('Escalera', 9, 'circ'));
          for (i = 0; i < nb; i++) {
            bi++;
            var main = bi === 1 || (bi === bedsPB + 1 && l === 1 && bedsPB === 0);
            lvl[i % 2 ? 'back' : 'front'].push(R(main ? 'Recámara principal' : 'Recámara ' + bi, main ? 18 : 12.5, 'rec'));
            if (main) lvl.front.push(R('Vestidor', 6, 'rec'));
          }
          for (i = 0; i < nba; i++) { bai++; lvl.back.push(R(bai === 1 || (i === 0 && l === 1 && bathsPB === 0) ? 'Baño principal' : 'Baño ' + bai, i === 0 ? 7 : 5, 'bano')); }
          if (l === 1 && halfUp > 0) for (i = 0; i < halfUp; i++) lvl.back.push(R('Medio baño', 3, 'bano'));
          if (l === 1 || nb === 0) lvl.front.push(R(l === F - 1 && F > 2 ? 'Terraza' : 'Estancia familiar', 16, 'soc'));
          if (!nb && !nba) lvl.back.push(R('Cuarto de usos múltiples', 14, 'soc'));
          restB -= nb; restBa -= nba;
        }
      }
    } else if (t === 'deptos') {
      var dA = deptoArea(p);
      var pbL = lv[0];
      if (park > 0) pbL.front.push(R('Estacionamiento', 1, 'coch', { cars: park, flex: true }));
      pbL.back.push(R('Escalera y elevador', 18, 'circ'), R('Vestíbulo', 14, 'circ'), R('Cuarto de máquinas', 8, 'serv'), R('Basura y medidores', 8, 'serv'));
      if (F === 1) { pbL.front = []; for (i = 0; i < units; i++) pbL.front.push(R('Depto ' + (101 + i), dA, 'depto', { unit: true })); }
      for (var u = 1; u < F; u++) {
        lv[u].back.push(R('Escalera y elevador', 18, 'circ'), R('Pasillo', 6 + units * 4, 'circ'));
        for (i = 0; i < units; i++) lv[u][i % 2 ? 'back' : 'front'].push(R('Depto ' + ((u + 1) * 100 + i + 1), dA, 'depto', { unit: true }));
      }
    } else if (t === 'comercial') {
      for (var c = 0; c < F; c++) {
        var L2 = lv[c];
        if (c === 0) L2.front.push(R('Ancla', 1, 'com', { flex: true, w: 2.2 }));
        for (i = 0; i < units; i++) L2[i % 2 ? 'back' : 'front'].push(R('Local ' + (c === 0 ? 'L-' : 'N' + c + '-') + (i + 1), 1, 'com', { flex: true, w: 1 }));
        L2.back.push(R('Pasillo comercial', 1, 'circ', { flex: true, w: 0.8 + units * 0.06 }));
        L2.back.push(R('Sanitarios', Math.max(1, baths) * 6 + half * 3, 'bano'), R('Escalera y elevador', 22, 'circ'));
        if (c === 0) L2.back.push(R('Cuarto de máquinas', 12, 'serv'), R('Andén de servicio', 18, 'serv'));
        if (c === 1 || (F === 1 && c === 0)) L2.back.push(R('Administración', 14, 'ofi'));
        if (c === F - 1 && F > 1) L2.front.push(R('Food court', 1, 'com', { flex: true, w: 1.8 }));
      }
    } else { // bodega
      var b0 = lv[0];
      b0.front.push(R('Nave de almacenamiento', 1, 'alm', { flex: true, w: 4 }));
      b0.back.push(R('Andenes de carga', Math.max(1, units) * 14, 'serv', { docks: Math.max(1, units) }), R('Oficinas', 24, 'ofi'), R('Sanitarios y vestidores', Math.max(1, baths) * 5 + half * 2.5, 'bano'), R('Caseta de control', 6, 'ofi'));
      if (F > 1) b0.back.push(R('Escalera', 9, 'circ'));
      for (var m = 1; m < F; m++) {
        lv[m].front.push(R('Mezzanine de almacenamiento', 1, 'alm', { flex: true, w: 3 }));
        lv[m].back.push(R('Escalera', 9, 'circ'), R('Oficinas', 30, 'ofi'), R('Sanitarios', 10, 'bano'));
      }
    }
    return lv;
  }

  /* ---------- Mínimos de referencia (práctica común en reglamentos de construcción de México) ---------- */
  var MIN = { rec: 7.0, 'Recámara principal': 9.0, soc: 7.3, Cocina: 3.3, 'Cocina abierta': 6, bano: 2.5, 'Medio baño': 1.4, Cochera: 13.75 };
  function minFor(r) { return MIN[r.n] || (r.k === 'rec' && r.n !== 'Vestidor' ? MIN.rec : r.k === 'bano' && r.n.indexOf('Medio') === 0 ? MIN['Medio baño'] : r.k === 'bano' ? MIN.bano : r.k === 'soc' ? MIN.soc : 0); }

  function parkingRequired(p, area) {
    var t = p.type;
    if (t === 'casa') return area > 250 ? 3 : area > 120 ? 2 : 1;
    if (t === 'deptos') { var u = Math.max(1, p.units) * Math.max(1, p.floors - 1); var big = deptoArea(p) > 120; return Math.ceil(u * (big ? 2 : 1) + u * 0.1); }
    if (t === 'comercial') return Math.ceil(area / 40);
    return Math.max(2, Math.ceil(area / 150));
  }

  /* ---------- Análisis experto (reglas) ----------
     Recibe el proyecto, los resultados de cálculo y la geometría de planos. Devuelve secciones con
     hallazgos (ok/warn/bad), tablas y recomendaciones, con una calificación por área. */
  function analyze(p, r, sheetsInfo, ctx) {
    var nf0 = ctx.nf0, nf1 = ctx.nf1, money = ctx.money, L = r.city, T = TIPOS[p.type] || TIPOS.casa;
    var lotA = p.front * p.depth, cos = r.footprint / lotA, cus = r.area / lotA;
    var out = { score: 0, sections: [], summary: '', recs: [] };
    var scores = [];
    function sec(title, items, extra) { out.sections.push(Object.assign({ title: title, items: items }, extra || {})); }
    function it(st, txt) { return { st: st, t: txt }; }

    // 1. Programa arquitectónico
    var prog = program(p), rows = [], probs = 0;
    (sheetsInfo || []).forEach(function (lvl, li) {
      lvl.forEach(function (c) {
        if (c.unit || c.k === 'circ' || c.k === 'coch' || c.k === 'alm' || c.k === 'com') return;
        var mn = minFor(c); if (!mn) return;
        var st = c.m2 >= mn ? 'ok' : c.m2 >= mn * 0.85 ? 'warn' : 'bad'; if (st !== 'ok') probs++;
        rows.push([(li === 0 ? 'PB' : 'N' + li) + ' · ' + c.n, nf1.format(c.m2) + ' m²', nf1.format(mn) + ' m²', st]);
      });
    });
    var pItems = [];
    if (p.type === 'casa' || p.type === 'deptos') {
      var ratio = p.beds ? (p.baths + p.halfBaths * 0.5) / p.beds : 1;
      pItems.push(ratio >= 0.66 ? it('ok', 'Relación baños / recámaras de ' + nf1.format(ratio) + ': adecuada para el mercado residencial ' + (p.finish === 'pre' ? 'premium' : 'medio') + '.')
        : it('warn', 'Hay ' + p.beds + ' recámaras y ' + p.baths + ' baños completos. Para este segmento conviene al menos ' + Math.ceil(p.beds * 0.66) + ' baños completos.'));
      if (p.type === 'casa' && p.beds >= 3 && p.halfBaths === 0) pItems.push(it('warn', 'Sin medio baño de visitas: los invitados usarían baños privados. Se recomienda uno en planta baja.'));
      if (p.type === 'casa' && p.floors >= 3 && p.layout !== 'rec-pb') pItems.push(it('warn', 'Con ' + p.floors + ' niveles conviene prever una recámara en planta baja para adultos mayores o visitas (accesibilidad).'));
      if (p.layout === 'abierto') pItems.push(it('ok', 'El concepto abierto mejora la ventilación cruzada y la percepción de amplitud; considerar campana de extracción potente en la cocina.'));
      if (p.layout === 'planta-libre') pItems.push(it('ok', 'La planta libre exige estructura con claros amplios: los muros divisorios deben ser ligeros (tablaroca o muros móviles).'));
    }
    if (p.type === 'deptos') {
      var dA = deptoArea(p);
      pItems.push(it(dA >= 45 ? 'ok' : 'warn', 'Cada departamento tiene unos ' + nf0.format(dA) + ' m² útiles (' + p.beds + ' rec., ' + p.baths + ' baños). ' + (dA < 45 ? 'Por debajo de 45 m² muchos municipios exigen condiciones de vivienda mínima.' : '')));
      if (p.floors >= 5) pItems.push(it('ok', 'A partir de 5 niveles el elevador es obligatorio en la mayoría de los reglamentos; ya está incluido en el núcleo.'));
      else if (p.floors >= 4) pItems.push(it('warn', 'Con 4 niveles el elevador no siempre es obligatorio, pero eleva el valor de venta y la accesibilidad.'));
    }
    if (p.type === 'comercial') pItems.push(it('ok', p.units + ' locales por piso con pasillo comercial y ancla en planta baja; la tienda ancla debe ubicarse al fondo para generar recorrido frente a los locales.'));
    if (p.type === 'bodega') {
      pItems.push(it(p.units >= Math.ceil(r.footprint / 600) ? 'ok' : 'warn', p.units + ' andenes para ' + nf0.format(r.footprint) + ' m² de nave. La práctica es un andén por cada 500–700 m².'));
      pItems.push(it(p.floors <= 2 ? 'ok' : 'warn', p.floors <= 2 ? 'Altura libre recomendada: 9–12 m para rack selectivo.' : 'Las bodegas de más de dos niveles complican la logística; considerar mezzanines en lugar de pisos completos.'));
    }
    if (probs) pItems.push(it(probs > 2 ? 'bad' : 'warn', probs + ' espacio(s) quedan por debajo del área mínima de referencia con el terreno y los niveles actuales.'));
    else if (rows.length) pItems.push(it('ok', 'Todos los espacios habitables cumplen las áreas mínimas de referencia.'));
    scores.push(100 - probs * 9 - pItems.filter(function (x) { return x.st === 'warn'; }).length * 6);
    sec('Programa arquitectónico', pItems, rows.length ? { table: { head: ['Espacio', 'Área', 'Mínimo', 'Estado'], rows: rows } } : null);

    // 2. Normativa urbana
    var reqP = parkingRequired(p, r.area), nItems = [];
    nItems.push(it(cos <= 0.75 ? 'ok' : cos <= 0.85 ? 'warn' : 'bad', 'COS (desplante / terreno) de ' + nf0.format(cos * 100) + ' %. El máximo usual en zonas habitacionales es 60–75 %; verificar con el uso de suelo del predio.'));
    nItems.push(it(cus <= 3 ? 'ok' : 'warn', 'CUS (construcción / terreno) de ' + nf1.format(cus) + ' veces el terreno, con ' + nf0.format(r.area) + ' m² en ' + p.floors + ' niveles.'));
    nItems.push(it(1 - cos >= 0.2 ? 'ok' : 'warn', 'Área libre de ' + nf0.format((1 - cos) * 100) + ' %. Se recomienda al menos 20 % para absorción de agua pluvial (o pozos de absorción).'));
    nItems.push(it(p.parking >= reqP ? 'ok' : 'bad', 'Estacionamiento: ' + p.parking + ' cajón(es) propuestos contra ' + reqP + ' requeridos como referencia para ' + T.n.toLowerCase() + ' de ' + nf0.format(r.area) + ' m².' + (p.parking < reqP ? ' Es la causa más común de rechazo de licencia.' : '')));
    if (r.parkFit != null && r.parkFit < p.parking && p.type !== 'casa') nItems.push(it('warn', 'En el terreno caben unos ' + r.parkFit + ' cajones en superficie; los demás requieren sótano, semisótano o estacionamiento en planta baja.'));
    if (p.floors * 3.1 > 15 && p.type === 'casa') nItems.push(it('warn', 'La altura total (~' + nf0.format(p.floors * 3.1) + ' m) puede rebasar el máximo de muchas zonas habitacionales unifamiliares.'));
    scores.push(100 - nItems.filter(function (x) { return x.st === 'warn'; }).length * 8 - nItems.filter(function (x) { return x.st === 'bad'; }).length * 18);
    sec('Normativa urbana (preliminar)', nItems);

    // 3. Clima, asoleamiento y orientación
    var cItems = [], tropic = L.lat < 23.44;
    cItems.push(it('ok', L.name + ', latitud ' + nf1.format(L.lat) + '° N. ' + (tropic ? 'Al estar al sur del Trópico de Cáncer, en verano el sol del mediodía pasa ligeramente al norte: proteger también la fachada norte con aleros.' : 'El sol recorre siempre el sur: la fachada sur recibe la mayor radiación en invierno.')));
    cItems.push(it('ok', 'Orientación recomendada: áreas sociales al sur o sureste, recámaras al oriente (sol de mañana), servicios y escaleras al poniente como colchón térmico.'));
    if (L.wind >= 1.4) cItems.push(it('warn', 'Región con huracanes: cancelería con certificación de presión de viento, anclajes de cubierta y protecciones para ventanas.'));
    if (L.lat < 22 && (p.state === 'yuc' || p.state === 'qroo' || p.state === 'camp' || p.state === 'tab' || p.state === 'ver' || p.state === 'gro' || p.state === 'col')) cItems.push(it('ok', 'Clima cálido húmedo: priorizar ventilación cruzada, techos altos (≥ 3.0 m), aislamiento en losa de azotea y colores claros.'));
    if (p.state === 'son' || p.state === 'chih' || p.state === 'coah' || p.state === 'bc' || p.state === 'nl') cItems.push(it('ok', 'Clima extremoso seco: aislamiento térmico en muros y azotea, doble vidrio en fachadas oriente y poniente.'));
    scores.push(100 - cItems.filter(function (x) { return x.st === 'warn'; }).length * 6);
    sec('Clima, asoleamiento y orientación', cItems);

    // 4. Estructura
    var sItems = [], worst = r.worst;
    sItems.push(it(worst <= 0.7 ? 'ok' : worst <= 0.9 ? 'warn' : 'bad', 'Uso máximo de elementos: ' + Math.round(worst * 100) + ' % (' + r.elements.reduce(function (a, e) { return e.u > a.u ? e : a; }).name + ').'));
    sItems.push(it(L.c >= 0.34 ? 'warn' : 'ok', 'Zona sísmica ' + L.zone.toLowerCase() + ' (c ≈ ' + L.c.toFixed(2) + ').' + (L.c >= 0.34 ? ' Evitar plantas irregulares y voladizos grandes; confinar muros y detallar nudos viga-columna.' : '')));
    if (L.soil === 'lago' || L.q <= 80) sItems.push(it('warn', 'Suelo blando (' + L.q + ' kPa estimados): se recomienda estudio de mecánica de suelos y probablemente losa de cimentación o cajón.'));
    if (p.layout === 'planta-libre' || p.type === 'comercial' || p.type === 'bodega') sItems.push(it('ok', 'Por los claros amplios conviene evaluar estructura de acero o losa postensada contra concreto convencional.'));
    scores.push(worst <= 0.7 ? 92 : worst <= 0.9 ? 75 : 45);
    sec('Estructura', sItems);

    // 5. Costo y rentabilidad
    var kItems = [];
    kItems.push(it('ok', 'Costo paramétrico: ' + money(r.total) + ' (' + money(r.unit) + ' por m²) con acabados ' + r.fin.name.toLowerCase() + ' y pisos de ' + (PISOS[p.flooring] || PISOS.porcelanato).n.toLowerCase() + '.'));
    if (p.type === 'deptos') { var nU = Math.max(1, p.units) * Math.max(1, p.floors - 1); kItems.push(it('ok', nU + ' departamentos: costo directo aproximado de ' + money(r.total / nU) + ' por unidad, antes de terreno, licencias y comercialización.')); }
    if (p.type === 'comercial') { var nL = Math.max(1, p.units) * p.floors; kItems.push(it('ok', nL + ' locales más ancla. Área rentable estimada ' + nf0.format(r.area * 0.72) + ' m² (72 % de eficiencia).')); }
    if (p.type === 'bodega') kItems.push(it('ok', 'Costo por m² de nave ' + money(r.unit) + '. Rentas industriales típicas permiten recuperar la inversión en 7 a 10 años.'));
    if (p.finish === 'pre' && p.type === 'bodega') kItems.push(it('warn', 'Acabados premium en bodega elevan el costo sin aumentar la renta: considerar acabados económicos en nave y medios en oficinas.'));
    scores.push(90 - kItems.filter(function (x) { return x.st === 'warn'; }).length * 10);
    sec('Costo y rentabilidad', kItems);

    // Calificación y resumen
    out.score = Math.max(30, Math.min(98, Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length)));
    out.scores = { programa: scores[0], normativa: scores[1], clima: scores[2], estructura: scores[3], costo: scores[4] };
    var bad = [], warn = [];
    out.sections.forEach(function (s) { s.items.forEach(function (x) { if (x.st === 'bad') bad.push(x.t); else if (x.st === 'warn') warn.push(x.t); }); });
    out.recs = bad.concat(warn).slice(0, 6);
    if (bad.length) out.score = Math.min(out.score, 74 - (bad.length - 1) * 6);
    out.summary = T.n + ' de ' + p.floors + (p.floors === 1 ? ' nivel' : ' niveles') + ' en ' + L.name + ' con ' + nf0.format(r.area) + ' m² construidos sobre un terreno de ' + nf0.format(lotA) + ' m². ' +
      (bad.length ? 'Hay ' + bad.length + ' punto(s) críticos que resolver antes de tramitar la licencia.' : warn.length ? 'El proyecto es viable; hay ' + warn.length + ' punto(s) a mejorar.' : 'El proyecto es viable y está bien resuelto en esta etapa.');
    return out;
  }

  window.RinovaProyecto = {
    ESTADOS: ESTADOS, TIPOS: TIPOS, DISTRIBUCION: DISTRIBUCION, PISOS: PISOS,
    loc: loc, normalizeLoc: normalizeLoc, program: program, analyze: analyze, parkingRequired: parkingRequired, deptoArea: deptoArea, minFor: minFor
  };
})();
