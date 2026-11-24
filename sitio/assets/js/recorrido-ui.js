/* RINOVAIA — Planos: vista "Recorrido virtual". Conecta el motor (RinovaRecorrido) con la interfaz:
   selector de planta, ir a un espacio, hora del día, recorrido guiado, foto, plano de ubicación,
   joystick táctil, botones de escalera y pantalla completa. Se sincroniza con el Estudio. */
(function () {
  'use strict';
  var E = window.RinovaEstudio, RV = window.RinovaRecorrido, PL = window.RinovaPlanos;
  if (!E || !RV || !document.getElementById('pv-rv')) return;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = E.esc, ctl = null, busy = false, stale = true, open = false, hora = 'tarde', mapBase = null, mapFit = null, level = 0, nLevels = 1;

  function lvName(i) { return i === 0 ? 'Planta baja' : 'Nivel ' + i; }
  function data() {
    var p = E.project(), r = E.result(), set = E.sheets && E.sheets();
    var levels = set && set.levels ? set.levels : PL.build(p, r, {}).levels;
    var yd = window.RinovaProyecto.siteYard(p, r);
    // terreno como en el render 3D: remetimiento al frente según el jardín posterior
    var lot = p.front > 0 && p.depth > 0 ? { W: p.front, D: p.depth, setback: yd ? Math.max(1, yd.front) : Math.max(1.5, (p.depth - r.D) * 0.7) } : null;
    return { levels: RV.buildModel(levels, PL.heights(p).hs, p.type), W: r.W, D: r.D, site: { yard: yd, sideM: (p.front - r.W) / 2, lot: lot } };
  }
  function show() {
    open = true;
    if (!RV.webgl()) { $('#rvLoad').textContent = 'Tu navegador no tiene WebGL activo; el recorrido virtual necesita aceleración gráfica.'; return; }
    if (ctl) { if (stale) rebuild(true); ctl.resize(); ctl.start(); return; }
    if (busy) return; busy = true;
    $('#rvLoad').hidden = false; $('#rvLoad').textContent = 'Amueblando los espacios…';
    RV.load().then(function () {
      return new Promise(function (res) { setTimeout(res, 30); }); // deja pintar el aviso de carga
    }).then(function () {
      ctl = RV.create($('#rvCanvas'), {
        onRoom: onRoom, onLevel: onLevel, onMove: drawMap,
        onInteract: function () { $('#rvHint').classList.add('off'); },
        onTour: function (on) { setTour(on); }
      });
      ctl.setHora(hora);
      rebuild(false);
      $('#rvLoad').hidden = true;
      if (open) ctl.start();
      setTimeout(function () { $('#rvHint').classList.add('off'); }, 9000);
    }).catch(function (err) {
      $('#rvLoad').textContent = (err && err.message) || 'No se pudo preparar el recorrido.';
      if (window.console) console.error(err);
    }).then(function () { busy = false; });
  }
  function hide() { open = false; if (ctl) ctl.stop(); setTour(false); }
  function rebuild(keep) {
    var d = data(); stale = false; nLevels = d.levels.length;
    ctl.setModel(d.levels, d.W, d.D, keep, d.site);
    $('#rvLevels').innerHTML = d.levels.map(function (L, i) { return '<button type="button" data-l="' + i + '" aria-pressed="false">' + lvName(i) + '</button>'; }).join('');
    $('#rvLevels').style.display = d.levels.length > 1 ? '' : 'none';
    onLevel(ctl.state().L);
  }
  function onLevel(L) {
    if (!L) return; level = L.index;
    $$('#rvLevels button').forEach(function (b) { b.setAttribute('aria-pressed', +b.dataset.l === L.index); });
    var rooms = L.rooms.filter(function (R) { return (!R.ext || R.reachable) && !R.side; }).sort(function (a, b) { return (a.outer === 'front' ? -1 : 0) - (b.outer === 'front' ? -1 : 0); });
    $('#rvRoom').innerHTML = '<option value="">Ir a un espacio…</option>' + rooms.map(function (R) { return '<option value="' + R.id + '">' + esc(R.label) + '</option>'; }).join('');
    mapBase = null; drawMap();
  }
  function onRoom(R, L) {
    $('#rvChip').textContent = lvName(L.index) + (R ? ' · ' + R.label : '');
    var st = $('#rvStairs'), h = '';
    if (R && /Escalera/.test(R.n) && ctl) {
      var n = nLevels;
      if (R.stairUp && L.index < n - 1) h += '<button type="button" data-go="' + (L.index + 1) + '">Subir a <b>' + lvName(L.index + 1) + '</b></button>';
      if (L.index > 0) h += '<button type="button" data-go="' + (L.index - 1) + '">Bajar a <b>' + lvName(L.index - 1) + '</b></button>';
    }
    st.innerHTML = h;
    if ($('#rvRoom').value && R && +$('#rvRoom').value !== R.id) $('#rvRoom').value = '';
  }
  function setTour(on) { var b = $('#rvTour'); b.setAttribute('aria-pressed', !!on); $('span', b).textContent = on ? 'Detener recorrido' : 'Recorrido guiado'; }

  /* ---------- Plano de ubicación ---------- */
  function drawMap() {
    if (!ctl) return;
    var c = $('#rvMap'), g = c.getContext('2d'), st = ctl.state(), L = st.L; if (!L) return;
    var B = st.B, bw = B.x1 - B.x0, bd = B.z1 - B.z0, n = c.width, pad = 16, s = Math.min((n - pad * 2) / bw, (n - pad * 2) / bd), ox = (n - bw * s) / 2 - B.x0 * s, oy = (n - bd * s) / 2 - B.z0 * s;
    mapFit = { s: s, ox: ox, oy: oy, el: c };
    if (!mapBase) {
      mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = n; var b = mapBase.getContext('2d');
      L.rooms.forEach(function (R) { b.fillStyle = R.outer ? 'rgba(120,160,110,.2)' : R.ext ? 'rgba(120,160,110,.35)' : 'rgba(243,245,247,.14)'; b.fillRect(ox + R.x * s, oy + R.y * s, R.w * s, R.h * s); });
      b.strokeStyle = 'rgba(192,198,212,.9)'; b.lineWidth = 2;
      (L.edges || []).forEach(function (e) {
        if (!e.A || (e.A.ext && (!e.B || e.B.ext))) return;
        var cur = e.lo, hs = e.open.filter(function (o) { return o.y0 < 0.3 && o.kind !== 'gdoor'; }).sort(function (a, b2) { return a.lo - b2.lo; });
        hs.concat([{ lo: e.hi, hi: e.hi }]).forEach(function (h) { if (h.lo > cur) { b.beginPath(); if (e.axis === 'x') { b.moveTo(ox + cur * s, oy + e.c * s); b.lineTo(ox + h.lo * s, oy + e.c * s); } else { b.moveTo(ox + e.c * s, oy + cur * s); b.lineTo(ox + e.c * s, oy + h.lo * s); } b.stroke(); } cur = Math.max(cur, h.hi); });
      });
    }
    g.clearRect(0, 0, n, n); g.drawImage(mapBase, 0, 0);
    var x = ox + st.x * s, y = oy + st.z * s, a = -st.yaw - Math.PI / 2;
    g.fillStyle = 'rgba(212,175,55,.28)'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, 34, a - 0.6, a + 0.6); g.closePath(); g.fill();
    g.fillStyle = '#D4AF37'; g.strokeStyle = '#0B0F17'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.stroke();
  }
  $('#rvMap').addEventListener('pointerup', function (e) {
    if (!ctl || !mapFit) return; var rc = e.currentTarget.getBoundingClientRect(), k = e.currentTarget.width / rc.width;
    var x = ((e.clientX - rc.left) * k - mapFit.ox) / mapFit.s, z = ((e.clientY - rc.top) * k - mapFit.oy) / mapFit.s; ctl.walkPoint(x, z); setTour(false);
  });

  /* ---------- Controles ---------- */
  $('#rvLevels').addEventListener('click', function (e) { var b = e.target.closest('button[data-l]'); if (b && ctl) { ctl.level(+b.dataset.l); setTour(false); } });
  $('#rvStairs').addEventListener('click', function (e) { var b = e.target.closest('button[data-go]'); if (b && ctl) ctl.level(+b.dataset.go, true); });
  $('#rvRoom').addEventListener('change', function (e) { if (ctl && e.target.value !== '') { ctl.gotoRoom(+e.target.value, false); setTour(false); } });
  $('#rvHora').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]'); if (!b) return; hora = b.dataset.v;
    $$('#rvHora button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); if (ctl) ctl.setHora(hora);
  });
  $('#rvTour').addEventListener('click', function () { if (!ctl) return; var on = $('#rvTour').getAttribute('aria-pressed') !== 'true'; ctl.tour(on); setTour(on); });
  $('#rvPng').addEventListener('click', function () {
    if (!ctl) return; var st = ctl.state(), a = document.createElement('a');
    a.href = ctl.snapshot(); a.download = (E.project().name || 'proyecto').replace(/[^\wáéíóúñü -]+/gi, '').trim().replace(/\s+/g, '-') + '-' + (st.room ? st.room.label : lvName(st.level)).replace(/[^\wáéíóúñü -]+/gi, '').replace(/\s+/g, '-') + '.jpg';
    document.body.appendChild(a); a.click(); a.remove(); E.toast('Foto del recorrido descargada');
  });
  $('#rvFull').addEventListener('click', function () {
    var box = $('#rv');
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    if (box.classList.contains('full')) { box.classList.remove('full'); document.body.style.overflow = ''; }
    else if (box.requestFullscreen) box.requestFullscreen().catch(function () { box.classList.add('full'); document.body.style.overflow = 'hidden'; });
    else { box.classList.add('full'); document.body.style.overflow = 'hidden'; }
    setTimeout(function () { if (ctl) ctl.resize(); }, 150);
  });
  document.addEventListener('fullscreenchange', function () { setTimeout(function () { if (ctl) ctl.resize(); }, 150); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#rv').classList.contains('full')) { $('#rv').classList.remove('full'); document.body.style.overflow = ''; if (ctl) setTimeout(ctl.resize, 100); } });
  window.addEventListener('resize', function () { if (ctl && open) ctl.resize(); });

  // Joystick táctil
  (function () {
    var st = $('#rvStick'), knob = $('span', st), id = null, cx = 0, cy = 0, R = 46;
    function setK(dx, dy) { knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; }
    st.addEventListener('pointerdown', function (e) { id = e.pointerId; st.setPointerCapture(id); var rc = st.getBoundingClientRect(); cx = rc.left + rc.width / 2; cy = rc.top + rc.height / 2; move(e); e.preventDefault(); });
    function move(e) { if (e.pointerId !== id) return; var dx = e.clientX - cx, dy = e.clientY - cy, l = Math.sqrt(dx * dx + dy * dy); if (l > R) { dx = dx / l * R; dy = dy / l * R; } setK(dx, dy); if (ctl) ctl.setStick(dx / R, -dy / R); setTour(false); }
    function end(e) { if (e.pointerId !== id) return; id = null; setK(0, 0); if (ctl) ctl.setStick(0, 0); }
    st.addEventListener('pointermove', move); st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  })();

  /* ---------- Sincronización ---------- */
  var tm;
  document.addEventListener('rinova:pv', function (e) { if (e.detail === 'rv') show(); else if (open) hide(); });
  document.addEventListener('rinova:change', function () { stale = true; if (open && ctl) { clearTimeout(tm); tm = setTimeout(function () { rebuild(true); }, 400); } });
  document.addEventListener('visibilitychange', function () { if (!ctl) return; if (document.hidden) ctl.stop(); else if (open) ctl.start(); });
  if (!$('#pv-rv').hidden) show();
  window.RinovaRecorridoUI = { show: show, ctl: function () { return ctl; } };
})();
