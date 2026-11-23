/* RINOVAIA — Planos: vistas "Mejorar fachada" y "Render 3D 360°".
   Lee y guarda la configuración de fachada en el proyecto (p.fx) y se sincroniza con cada cambio
   del Estudio (evento rinova:change). */
(function () {
  'use strict';
  var E = window.RinovaEstudio, FX = window.RinovaFachada, R3 = window.RinovaRender3D, F = window.RinovaFacade;
  if (!E || !FX || !document.getElementById('pvTabs')) return;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = E.esc;
  var view = 'laminas', why = [], ctl = null, ctlBusy = false;

  function proj() { return E.project(); }
  function res() { return E.result(); }
  function fx() { var p = proj(); p.fx = FX.normalize(p.fx, p); return p.fx; }
  function commit() { E.refresh(); }

  /* ---------- Sub-vistas ---------- */
  function showPv(v) {
    view = v;
    $$('#pvTabs button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.pv === v); });
    $$('#p-planos .pv').forEach(function (el) { el.hidden = el.id !== 'pv-' + v; });
    if (v === 'fachada') renderFx();
    if (v === 'r3d') open3d();
    try { sessionStorage.setItem('rinova.pv', v); } catch (e) { }
    document.dispatchEvent(new CustomEvent('rinova:pv', { detail: v }));
  }
  $('#pvTabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-pv]'); if (b) showPv(b.dataset.pv); });
  $$('[data-pv-go]').forEach(function (b) { b.addEventListener('click', function () { showPv(b.dataset.pvGo); $('#pvTabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });

  /* ---------- Formulario de fachada ---------- */
  $('#fxStyles').innerHTML = Object.keys(FX.ESTILOS).map(function (k) { var s = FX.ESTILOS[k]; return '<button type="button" data-v="' + k + '" aria-pressed="false"><b>' + esc(s.n) + '</b><small>' + esc(s.d) + '</small></button>'; }).join('');
  function opt(keys, src) { return keys.map(function (k) { return '<option value="' + k + '">' + esc(src[k].n) + '</option>'; }).join(''); }
  $('#fxMat').innerHTML = opt(Object.keys(FX.MATERIALES), FX.MATERIALES);
  $('#fxAcc').innerHTML = opt(FX.ACENTOS, FX.MATERIALES);
  $('#fxCan').innerHTML = opt(Object.keys(FX.CANCEL), FX.CANCEL);
  $('#fxOpts').innerHTML = Object.keys(FX.OPCIONES).map(function (k) { var o = FX.OPCIONES[k]; return '<label class="fx-opt"><input type="checkbox" data-o="' + k + '"><span><b>' + esc(o.n) + '</b><small>' + esc(o.d) + '</small></span></label>'; }).join('');

  function syncFxForm() {
    var f = fx();
    $$('#fxStyles button').forEach(function (b) { b.setAttribute('aria-pressed', f.on && b.dataset.v === f.estilo); });
    $('#fxMat').value = f.material; $('#fxAcc').value = f.acento; $('#fxCan').value = f.cancel;
    $$('#fxOpts input').forEach(function (c) { c.checked = !!f.opts[c.dataset.o]; });
    $$('.fx-hora').forEach(function (g) { $$('button', g).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === f.hora); }); });
  }
  function touch(mut, msg) { var f = fx(); if (!f.on) { f.on = true; } mut(f); why = []; commit(); if (msg) E.toast(msg); }
  $('#fxStyles').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]'); if (!b) return;
    touch(function (f) { var pr = FX.preset(b.dataset.v); f.estilo = pr.estilo; f.material = pr.material; f.acento = pr.acento; f.cancel = pr.cancel; f.opts = pr.opts; }, 'Estilo ' + FX.ESTILOS[b.dataset.v].n.toLowerCase() + ' aplicado a la fachada');
  });
  $('#fxMat').addEventListener('change', function (e) { touch(function (f) { f.material = e.target.value; }); });
  $('#fxAcc').addEventListener('change', function (e) { touch(function (f) { f.acento = e.target.value; }); });
  $('#fxCan').addEventListener('change', function (e) { touch(function (f) { f.cancel = e.target.value; }); });
  $('#fxOpts').addEventListener('change', function (e) { var c = e.target.closest('input[data-o]'); if (c) touch(function (f) { f.opts[c.dataset.o] = c.checked; }); });
  $$('.fx-hora').forEach(function (g) {
    g.addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b) return; fx().hora = b.dataset.v; syncFxForm(); E.refresh(); });
  });
  $('#fxAuto').addEventListener('click', function () {
    var sg = FX.suggest(proj(), res()); proj().fx = sg.fx; why = sg.why; commit();
    E.toast('Fachada mejorada: ' + FX.ESTILOS[sg.fx.estilo].n.toLowerCase() + ' con ' + Object.keys(sg.fx.opts).filter(function (k) { return sg.fx.opts[k]; }).length + ' elementos');
  });
  $('#fxCompare').addEventListener('change', renderFx);
  $('#fxCmp').addEventListener('input', function () { $('#fxBefore').style.clipPath = 'inset(0 ' + (100 - this.value) + '% 0 0)'; $('#fxStage').style.setProperty('--cmp', this.value + '%'); });

  /* ---------- Render de fachada ---------- */
  function renderFx() {
    if (view !== 'fachada') return;
    var p = proj(), r = res(), f = fx(), on = f.on;
    syncFxForm();
    if (!on) {
      $('#fxAfter').innerHTML = F.build({ floors: p.floors, bays: p.bays, style: p.style, mode: 'render', phi: false, lat: r.city.lat, month: p.month, hour: f.hora === 'dia' ? 12 : f.hora === 'tarde' ? 17.5 : 20, palette: p.palette, width: 1200, height: 720, id: 'fxo' });
      $('#fxTagA').textContent = 'Fachada actual';
      $('#fxLegend').innerHTML = '<li class="fx-empty">Pulsa <b>Mejorar fachada</b> o elige un estilo para generar la propuesta.</li>';
      $('#fxBefore').hidden = true; $('#fxCmp').hidden = true; $('#fxTagB').hidden = true; $('#fxCompare').disabled = true;
      $('#fxWhy').innerHTML = '<li class="muted">Aún no hay mejoras aplicadas.</li>'; $('#fxCost').innerHTML = '<p class="muted" style="margin:0">—</p>';
      return;
    }
    var out = FX.svg(p, r, f, { id: 'fxa' });
    $('#fxAfter').innerHTML = out.svg;
    $('#fxTagA').textContent = 'Propuesta · ' + FX.ESTILOS[f.estilo].n;
    $('#fxLegend').innerHTML = out.marks.map(function (m, i) { return '<li><span class="n">' + (i + 1) + '</span>' + esc(m.t) + '</li>'; }).join('');
    var cmp = $('#fxCompare').checked; $('#fxCompare').disabled = false;
    $('#fxBefore').hidden = !cmp; $('#fxCmp').hidden = !cmp; $('#fxTagB').hidden = !cmp;
    if (cmp) {
      $('#fxBefore').innerHTML = F.build({ floors: p.floors, bays: p.bays, style: p.style, mode: 'render', phi: false, lat: r.city.lat, month: p.month, hour: f.hora === 'dia' ? 12 : f.hora === 'tarde' ? 17.5 : 20, palette: p.palette, width: 1200, height: 720, id: 'fxo' });
      $('#fxBefore').style.clipPath = 'inset(0 ' + (100 - $('#fxCmp').value) + '% 0 0)';
    }
    // Mejoras y por qué
    var list = why.length ? why : describe(out.spec);
    $('#fxWhy').innerHTML = list.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    var c = FX.cost(p, r, f);
    $('#fxCost').innerHTML = '<div class="costbars">' + c.items.map(function (x) { return '<div class="fx-ci"><span>' + esc(x[0]) + '</span><b>' + E.money(x[1]) + '</b></div>'; }).join('') + '</div>' +
      '<div class="total" style="margin-top:12px;padding-top:12px"><span>Total fachada <small class="muted">· ' + E.nf0.format(c.area) + ' m² · ' + Math.round(c.wwr * 100) + ' % vidrio</small></span><b class="num" style="font-size:24px">' + E.money(c.total) + '</b></div>';
  }
  function describe(s) {
    var t = ['Estilo ' + s.E.n.toLowerCase() + ': ' + s.E.d.toLowerCase() + '.', 'Muro en ' + s.M.n.toLowerCase() + (s.accent ? ' con volumen de acento en ' + s.A.n.toLowerCase() : '') + ' y cancelería de ' + s.C.n.toLowerCase() + '.'];
    Object.keys(FX.OPCIONES).forEach(function (k) { if (s.fx.opts[k]) t.push(FX.OPCIONES[k].n + ': ' + FX.OPCIONES[k].d.toLowerCase() + '.'); });
    return t;
  }
  function slug(s) { return String(s || 'proyecto').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proyecto'; }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  $('#fxPng').addEventListener('click', function () {
    var svgEl = $('#fxAfter svg'); if (!svgEl) return;
    var src = new XMLSerializer().serializeToString(svgEl), img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = 2400; c.height = 1440; var g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
      g.fillStyle = 'rgba(11,15,23,.8)'; g.fillRect(0, c.height - 96, c.width, 96); g.fillStyle = '#D4AF37'; g.fillRect(44, c.height - 34, 60, 4);
      g.fillStyle = '#fff'; g.font = '600 34px Montserrat, Inter, sans-serif'; g.fillText('RINOVAIA', 44, c.height - 46);
      g.fillStyle = '#C0C6D4'; g.font = '24px Inter, sans-serif'; g.textAlign = 'right'; g.fillText(proj().name + ' · Fachada ' + FX.ESTILOS[fx().estilo].n.toLowerCase(), c.width - 44, c.height - 40);
      c.toBlob(function (b) { download(b, 'rinovaia-' + slug(proj().name) + '-fachada.png'); E.toast('Imagen de la fachada descargada'); }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  });

  /* ---------- Render 3D ---------- */
  function updateChip() { var f = fx(); $('#r3dChip').textContent = (f.on ? FX.ESTILOS[f.estilo].n : 'Fachada base') + ' · ' + FX.HORAS[f.hora] + ' · ' + proj().floors + ' niveles'; }
  function specNow() {
    var p = proj(), r = res(), f = fx();
    // Sin mejora aplicada, el 3D usa la fachada base equivalente al estilo del formulario
    var base = f.on ? f : Object.assign(FX.preset({ moderno: 'contemporaneo', mediterraneo: 'mediterraneo', renacentista: 'colonial' }[p.style] || 'contemporaneo'), { hora: f.hora, opts: {} });
    if (!f.on) { base.material = { concreto: 'concreto', marmol: 'travertino', travertino: 'travertino', terracota: 'ocre' }[p.palette] || 'concreto'; }
    return FX.spec(p, r, base);
  }
  function open3d() {
    updateChip();
    if (ctl) { ctl.update(specNow(), { hora: fx().hora, lat: res().city.lat, month: proj().month }); ctl.resize(); return; }
    if (ctlBusy) return;
    if (!R3.webgl()) { $('#r3dLoad').textContent = 'Tu navegador no tiene WebGL activo, necesario para el render 3D.'; return; }
    ctlBusy = true; $('#r3dLoad').hidden = false; $('#r3dLoad').textContent = 'Generando modelo 3D…';
    R3.load().then(function () {
      ctl = R3.create($('#r3dCanvas'), { onInteract: function () { $('#r3dHint').classList.add('off'); } });
      ctl.update(specNow(), { hora: fx().hora, lat: res().city.lat, month: proj().month });
      $('#r3dLoad').hidden = true; ctlBusy = false;
      if (!ctl.canRecord()) { $('#r3dVid').disabled = true; $('#r3dVid').title = 'Este navegador no permite grabar video'; }
    }).catch(function (err) { ctlBusy = false; $('#r3dLoad').textContent = err.message || 'No se pudo generar el render 3D.'; });
  }
  $('#r3dSpin').addEventListener('click', function () {
    if (!ctl) return; var on = !ctl.spinning(); ctl.setSpin(on);
    this.setAttribute('aria-pressed', on); $('span', this).textContent = on ? 'Pausar giro' : 'Girar 360°';
  });
  $('#r3dViews').addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (b && ctl) ctl.setView(b.dataset.v); });
  $('#r3dPng').addEventListener('click', function () {
    if (!ctl) return;
    ctl.png(proj().name + ' · ' + res().city.name).then(function (b) { download(b, 'rinovaia-' + slug(proj().name) + '-3d.png'); E.toast('Imagen del render 3D descargada'); });
  });
  $('#r3dVid').addEventListener('click', function () {
    if (!ctl) return; var btn = this, lbl = btn.innerHTML;
    btn.disabled = true; $('#r3dRec').hidden = false;
    ctl.record360(12, function (f) { btn.textContent = 'Grabando… ' + Math.round(f * 100) + ' %'; }).then(function (out) {
      download(out.blob, 'rinovaia-' + slug(proj().name) + '-360.' + out.ext); E.toast('Video 360° descargado (' + out.ext.toUpperCase() + ')');
    }).catch(function (err) { E.toast(err.message || 'No se pudo grabar el video'); }).then(function () { btn.disabled = false; btn.innerHTML = lbl; $('#r3dRec').hidden = true; });
  });
  $('#r3dFull').addEventListener('click', function () {
    var box = $('#r3d');
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (box.classList.contains('full')) { box.classList.remove('full'); document.body.style.overflow = ''; }
    else if (box.requestFullscreen) box.requestFullscreen().catch(function () { box.classList.add('full'); document.body.style.overflow = 'hidden'; });
    else { box.classList.add('full'); document.body.style.overflow = 'hidden'; }
    setTimeout(function () { if (ctl) ctl.resize(); }, 120);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#r3d').classList.contains('full')) { $('#r3d').classList.remove('full'); document.body.style.overflow = ''; } });

  /* ---------- Sincronización con el Estudio ---------- */
  var t3;
  document.addEventListener('rinova:change', function () {
    if (view === 'fachada') renderFx();
    if (view === 'r3d' && ctl) { clearTimeout(t3); t3 = setTimeout(function () { updateChip(); ctl.update(specNow(), { hora: fx().hora, lat: res().city.lat, month: proj().month }); }, 180); }
  });
  try { var last = sessionStorage.getItem('rinova.pv'); if (last && last !== 'laminas') showPv(last); } catch (e) { }
  /* ---------- Encabezado fijo y accesos rápidos ---------- */
  var bar = $('#studioBar'), topm = $('.topm'), rootS = document.documentElement.style;
  function measure() {
    var off = topm && getComputedStyle(topm).display !== 'none' ? topm.offsetHeight : 0;
    rootS.setProperty('--top-off', off + 'px');
    if (bar) { rootS.setProperty('--bar-h', bar.offsetHeight + 'px'); bar.classList.toggle('stuck', window.scrollY > 4 && bar.getBoundingClientRect().top <= off + 0.5); }
  }
  window.addEventListener('scroll', measure, { passive: true });
  window.addEventListener('resize', measure);
  if (window.ResizeObserver && bar) new ResizeObserver(measure).observe(bar);
  measure();
  $$('[data-pv-jump]').forEach(function (b) {
    b.addEventListener('click', function () {
      E.showView('studio'); E.selectTab('planos'); showPv(b.dataset.pvJump);
      setTimeout(function () { $('#pvTabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
    });
  });
  window.RinovaFachadaUI = { show: showPv };
})();
