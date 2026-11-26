/* RINOVAIA — Ventana «Exportar plano».
   Al abrirla convierte la lámina elegida a SVG vectorial en automático; desde la misma ventana
   se convierte a AutoCAD (DXF a escala 1:1 en metros, con capas) y a Revit (modelo IFC con niveles,
   muros, losas y espacios). Todo ocurre en el navegador con RinovaMultiformato (svg-multiformato.js). */
(function () {
  'use strict';
  var MF = window.RinovaMultiformato, dlg = null, ctx = null, cur = null, busy = 0;
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kb(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1).replace('.', ',') + ' KB' : (n / 1048576).toFixed(2).replace('.', ',') + ' MB'; }
  function nf(v, d) { return Number(v).toLocaleString('es-MX', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function save(text, type, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }
  var ICO = {
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    cad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V4h16v16z"/><path d="M4 9h9v11M13 14h7"/><circle cx="8.5" cy="14.5" r="1.5"/></svg>',
    bim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18L10 6l4 8 2-4 4 8"/><circle cx="10" cy="6" r="1.6"/><circle cx="4" cy="18" r="1.6"/><circle cx="20" cy="18" r="1.6"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  function build() {
    dlg = document.createElement('dialog');
    dlg.id = 'dlgExport'; dlg.className = 'ex-dlg'; dlg.setAttribute('aria-labelledby', 'exTitle');
    dlg.innerHTML =
      '<div class="ex-in">' +
      '<header class="ex-hd"><img src="assets/img/isotipo.svg" alt="" class="ex-iso" width="34" height="34">' +
      '<div class="ex-ttl"><p class="ex-eyebrow">Exportar plano</p><h3 id="exTitle">SVG, AutoCAD y Revit</h3></div>' +
      '<button type="button" class="ex-x" data-ex-close aria-label="Cerrar">×</button></header>' +
      '<div class="ex-body">' +
      '<section class="ex-left" aria-label="Lámina">' +
      '<label class="ex-pick"><span>Lámina</span><select class="input" id="exSheet"></select></label>' +
      '<div class="ex-prev" id="exPrev" aria-live="polite"></div>' +
      '<p class="ex-cap" id="exCap"></p>' +
      '</section>' +
      '<ol class="ex-flow">' +
      step('svg', '1', ICO.svg, 'SVG vectorial', 'Se convierte en automático al abrir esta ventana.', '') +
      step('dxf', '2', ICO.cad, 'AutoCAD · DXF', 'Capas, cotas y textos a escala 1:1 en metros. Abre en AutoCAD, BricsCAD o LibreCAD.', '<button type="button" class="btn btn-ink btn-sm" id="exDxfGo">' + ICO.cad + 'Convertir a AutoCAD</button>') +
      step('ifc', '3', ICO.bim, 'Revit · IFC', 'Modelo BIM con niveles, muros, losas y espacios a su altura real.', '<button type="button" class="btn btn-ink btn-sm" id="exIfcGo">' + ICO.bim + 'Convertir a Revit</button>') +
      '</ol></div>' +
      '<footer class="ex-ft"><p>La conversión se hace en tu navegador: tus planos no se suben a ningún servidor.</p>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-ex-close>Cerrar</button></footer>' +
      '</div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-ex-close]')) dlg.close(); });
    $('#exSheet', dlg).addEventListener('change', function () { cur = this.value; runSvg(); });
    $('#exDxfGo', dlg).addEventListener('click', runDxf);
    $('#exIfcGo', dlg).addEventListener('click', runIfc);
  }
  function step(k, n, ico, title, txt, act) {
    return '<li class="ex-step" id="ex-' + k + '" data-state="idle"><span class="ex-num" aria-hidden="true"><b>' + n + '</b><i>' + ICO.ok + '</i></span>' +
      '<div class="ex-c"><div class="ex-h"><span class="ex-ico" aria-hidden="true">' + ico + '</span><h4>' + title + '</h4><span class="chip ex-chip" data-chip></span></div>' +
      '<p class="ex-txt">' + txt + '</p><ul class="ex-log" data-log></ul><div class="ex-meta" data-meta></div>' +
      '<div class="ex-act" data-act>' + act + '</div></div></li>';
  }
  function S(k) { return $('#ex-' + k, dlg); }
  function setState(k, state, chip) {
    var el = S(k); el.dataset.state = state;
    var c = $('[data-chip]', el); c.className = 'chip ex-chip ' + (state === 'done' ? 'ok' : state === 'run' ? 'gold' : state === 'warn' ? 'warn' : '');
    c.textContent = chip || '';
  }
  async function log(k, lines) {
    var ul = $('[data-log]', S(k)); ul.innerHTML = '';
    for (var i = 0; i < lines.length; i++) {
      var li = document.createElement('li'); li.textContent = lines[i]; ul.appendChild(li);
      await wait(170); li.classList.add('ok');
    }
  }
  function sheet() { return ctx.sheets.filter(function (s) { return s.code === cur; })[0] || ctx.sheets[0]; }
  function base() { return 'rinova-' + (ctx.slug || 'proyecto') + '-' + sheet().code.toLowerCase(); }
  function svgEl() { return $('#exPrev svg', dlg); }

  /* Paso 1 · SVG automático */
  async function runSvg() {
    var my = ++busy, sh = sheet(), isPlan = sh.kind === 'plan';
    ['dxf', 'ifc'].forEach(function (k) { $('[data-log]', S(k)).innerHTML = ''; $('[data-meta]', S(k)).innerHTML = ''; });
    resetAct('dxf'); setState('dxf', 'idle'); if (S('ifc').dataset.state !== 'done') setState('ifc', 'idle');
    setState('svg', 'run', 'Convirtiendo'); $('[data-meta]', S('svg')).innerHTML = ''; $('[data-act]', S('svg')).innerHTML = '';
    $('#exPrev', dlg).innerHTML = '<div class="ex-load"><span></span>Generando lámina ' + esc(sh.code) + '…</div>';
    var markup = sh.render(isPlan ? ctx.layers : null);
    await log('svg', ['Lámina ' + sh.code + ' · ' + sh.name, 'Trazos, textos y cuadro de datos en vectores', 'Fuentes y escala gráfica incluidas']);
    if (my !== busy) return;
    $('#exPrev', dlg).innerHTML = markup;
    var svg = svgEl(); svg.removeAttribute('class');
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + svg.outerHTML.replace(/ class="plan-svg"/, '');
    var n = svg.querySelectorAll('line,rect,path,circle,ellipse,polyline,polygon,text').length, pxm = svg.querySelector('[data-pxm]');
    cur = sh.code; ctx.svgText = xml;
    $('#exCap', dlg).textContent = sh.code + ' · ' + sh.name + (pxm ? ' · escala gráfica ' + nf(+pxm.getAttribute('data-pxm'), 1) + ' px/m' : '');
    $('[data-meta]', S('svg')).innerHTML = '<span><b>' + nf(n) + '</b> elementos</span><span><b>' + kb(new Blob([xml]).size) + '</b></span><span>Vectorial, sin pérdida</span>';
    $('[data-act]', S('svg')).innerHTML = '<button type="button" class="btn btn-gold btn-sm" id="exSvgDl">' + ICO.down + 'Descargar SVG</button>';
    $('#exSvgDl', dlg).addEventListener('click', function () { save(ctx.svgText, 'image/svg+xml', base() + '.svg'); toast('Lámina ' + cur + ' descargada en SVG.'); });
    setState('svg', 'done', 'Listo');
    $('#exDxfGo', dlg) && ($('#exDxfGo', dlg).disabled = false);
  }
  function resetAct(k) {
    if (k === 'dxf') $('[data-act]', S('dxf')).innerHTML = '<button type="button" class="btn btn-ink btn-sm" id="exDxfGo" disabled>' + ICO.cad + 'Convertir a AutoCAD</button>';
    if (k === 'dxf') $('#exDxfGo', dlg).addEventListener('click', runDxf);
  }

  /* Paso 2 · DXF para AutoCAD */
  async function runDxf() {
    var svg = svgEl(); if (!svg) return;
    var my = busy, b = $('#exDxfGo', dlg); if (b) b.disabled = true;
    setState('dxf', 'run', 'Convirtiendo');
    var res;
    try { res = MF.svgToDxf(svg); } catch (e) { setState('dxf', 'warn', 'Error'); $('[data-meta]', S('dxf')).textContent = 'No se pudo convertir esta lámina: ' + e.message; if (b) b.disabled = false; return; }
    var imgs = res.skipped.image;
    await log('dxf', ['Geometría SVG leída: trazos, curvas y textos', res.scale === '1:1 en metros' ? 'Escala 1:1 en metros con la escala gráfica' : 'Lámina sin escala gráfica: se conservan las unidades del dibujo', res.layers.length + ' capas con su color y tipo de línea', 'DXF R12 compatible con AutoCAD 2000 en adelante']);
    if (my !== busy) return;
    ctx.dxf = res;
    var lay = res.layers.filter(function (l) { return !l.off && !/-TEXTO$/.test(l.name); }).slice(0, 12).map(function (l) { return '<span class="ex-lay">' + esc(l.name) + '</span>'; }).join('');
    $('[data-meta]', S('dxf')).innerHTML =
      '<span><b>' + nf(res.entities) + '</b> entidades</span><span><b>' + kb(res.bytes.length) + '</b></span>' +
      (res.units === 'm' ? '<span>' + nf(res.size[0], 2) + ' × ' + nf(res.size[1], 2) + ' m</span>' : '') +
      '<div class="ex-lays">' + lay + '</div>' +
      (imgs ? '<p class="ex-note">Esta lámina incluye ' + imgs + ' imagen' + (imgs > 1 ? 'es' : '') + ' (croquis o render): el DXF lleva solo sus líneas y textos.</p>' : '') +
      '<p class="ex-note">¿Necesitas DWG? Abre el DXF en AutoCAD y usa <b>Guardar como › Dibujo (*.dwg)</b>.</p>';
    $('[data-act]', S('dxf')).innerHTML = '<button type="button" class="btn btn-gold btn-sm" id="exDxfDl">' + ICO.down + 'Descargar DXF</button>';
    $('#exDxfDl', dlg).addEventListener('click', function () { save(ctx.dxf.bytes, 'application/dxf', base() + '.dxf'); toast('Lámina ' + cur + ' descargada para AutoCAD (DXF).'); });
    setState('dxf', 'done', 'Listo');
  }

  /* Paso 3 · IFC para Revit (modelo completo, todos los niveles) */
  async function runIfc() {
    var b = $('#exIfcGo', dlg); if (b) b.disabled = true;
    setState('ifc', 'run', 'Modelando');
    var res, model;
    try {
      model = MF.modelFromPlans(ctx.levels, ctx.r, ctx.heights, ctx.wallSegments, ctx.p.name || 'Proyecto', (ctx.r.city && ctx.r.city.name) || 'Terreno');
      model.file = 'rinova-' + (ctx.slug || 'proyecto') + '-modelo';
      res = MF.modelToIfc(model);
    } catch (e) { setState('ifc', 'warn', 'Error'); $('[data-meta]', S('ifc')).textContent = 'No se pudo generar el modelo: ' + e.message; if (b) b.disabled = false; return; }
    await log('ifc', ['Niveles y alturas del corte', 'Muros exteriores 20 cm e interiores 12 cm', 'Losas de entrepiso, azotea y espacios con nombre y área', 'IFC2X3 · Coordination View (Revit, ArchiCAD, Navisworks)']);
    ctx.ifc = res;
    $('[data-meta]', S('ifc')).innerHTML =
      '<span><b>' + res.stats.levels + '</b> nivel' + (res.stats.levels > 1 ? 'es' : '') + '</span><span><b>' + res.stats.walls + '</b> muros</span><span><b>' + res.stats.slabs + '</b> losas</span><span><b>' + res.stats.spaces + '</b> espacios</span><span><b>' + kb(res.text.length) + '</b></span>' +
      '<p class="ex-note">En Revit: <b>Archivo › Abrir › IFC</b>. Para usar la lámina como base de dibujo: <b>Insertar › Vincular CAD</b> con el DXF.</p>';
    $('[data-act]', S('ifc')).innerHTML = '<button type="button" class="btn btn-gold btn-sm" id="exIfcDl">' + ICO.down + 'Descargar IFC</button>';
    $('#exIfcDl', dlg).addEventListener('click', function () { save(ctx.ifc.text, 'application/x-step', model.file + '.ifc'); toast('Modelo descargado para Revit (IFC).'); });
    setState('ifc', 'done', 'Listo');
  }
  function toast(m) { if (ctx && ctx.toast) ctx.toast(m); }

  function open(o) {
    if (!MF) return false;
    if (!dlg) build();
    ctx = o; cur = o.current || (o.sheets[0] && o.sheets[0].code);
    $('#exSheet', dlg).innerHTML = o.sheets.map(function (s) { return '<option value="' + esc(s.code) + '">' + esc(s.code + ' · ' + s.name) + '</option>'; }).join('');
    $('#exSheet', dlg).value = cur;
    // el modelo IFC no depende de la lámina: se reinicia al abrir
    $('[data-log]', S('ifc')).innerHTML = ''; $('[data-meta]', S('ifc')).innerHTML = '';
    $('[data-act]', S('ifc')).innerHTML = '<button type="button" class="btn btn-ink btn-sm" id="exIfcGo">' + ICO.bim + 'Convertir a Revit</button>';
    $('#exIfcGo', dlg).addEventListener('click', runIfc); setState('ifc', 'idle');
    $('.ex-txt', S('ifc')).textContent = 'Modelo BIM de ' + o.levels.length + ' nivel' + (o.levels.length > 1 ? 'es' : '') + ' con muros, losas y espacios a su altura real.';
    if (!dlg.open) dlg.showModal();
    runSvg();
    return true;
  }
  window.RinovaExport = { open: open };
})();
