/* RINOVAIA — Planos: vista «Planos por nivel» con editor de espacios.
   Por cada planta muestra la lámina arquitectónica en vivo y la lista de espacios: tamaño (m²), etiqueta
   (recámara principal, hijo, hija, visitas, estudio…), equipamiento (tina, jacuzzi, chimenea, isla…) y
   espacios agregados. La pestaña Jardín acomoda alberca, palapa, asador, fuente, espejo de agua, etc.
   Todo se guarda en el proyecto (p.rooms, p.extra, p.garden) y alimenta planos, recorrido, render 3D,
   presupuesto y análisis. */
(function () {
  'use strict';
  var E = window.RinovaEstudio, PR = window.RinovaProyecto, PL = window.RinovaPlanos;
  if (!E || !PR || !document.getElementById('pv-espacios')) return;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = E.esc, nf1 = E.nf1;
  var lvl = 0, sel = null, open = false, sideSig = '';
  var root = $('#pv-espacios'), elPlan = $('#esPlan'), elSide = $('#esSide'), elLv = $('#esLevels');

  function p() { return E.project(); }
  function set() { return E.sheets(); }
  function lvName(i) { return i === 0 ? 'Planta baja' : 'Nivel ' + i; }
  function garden() { return p().type === 'casa'; }
  function editable() { return p().type === 'casa' || p().type === 'deptos'; }
  function m1(v) { return nf1.format(Math.round(v * 10) / 10); }
  function touch() { root.dispatchEvent(new Event('change', { bubbles: true })); E.changed(); }

  /* ---------- Datos ---------- */
  function roomsOf(i) {
    var s = set(); if (!s || !s.levels[i]) return [];
    var cells = s.levels[i].cells, out = [], seen = {};
    cells.forEach(function (c) {
      (c.sub || [c]).forEach(function (u) {
        if (!u.id || seen[u.id] || u.k === 'circ' || u.k === 'coch' || u.k === 'ext') return;
        seen[u.id] = true; out.push(u);
      });
    });
    return out;
  }
  function override(id) { return p().rooms[id] || {}; }
  function setRoom(id, patch) {
    var o = Object.assign({}, p().rooms[id] || {}, patch);
    Object.keys(o).forEach(function (k) { if (o[k] == null || o[k] === '' || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; });
    if (Object.keys(o).length) p().rooms[id] = o; else delete p().rooms[id];
    touch();
  }
  function limits(c) {
    var base = c.base || c.a || 10, mn = PR.minFor({ n: c.n, k: c.k }) || 0;
    return { min: Math.max(1.5, Math.floor((mn ? mn * 0.8 : base * 0.5) * 2) / 2), max: Math.min(90, Math.max(30, Math.ceil(base * 3))) };
  }
  function kindFx(c) {
    var k = PR.kindOfRoom(c);
    return Object.keys(PR.EQUIPO).filter(function (x) { return PR.EQUIPO[x].k.indexOf(k) > -1; });
  }
  function areaOf(c) { var o = override(c.id); return o.a || c.a; }

  /* ---------- Barra de plantas ---------- */
  function renderLevels() {
    var s = set(); if (!s) return;
    var n = s.levels.length, tabs = [];
    if (lvl !== 'jardin' && lvl >= n) lvl = n - 1;
    for (var i = 0; i < n; i++) tabs.push('<button type="button" data-l="' + i + '" aria-pressed="' + (lvl === i) + '">' + lvName(i) + '</button>');
    if (garden()) tabs.push('<button type="button" data-l="jardin" aria-pressed="' + (lvl === 'jardin') + '">Jardín y exteriores</button>');
    elLv.innerHTML = tabs.join('');
    var r = E.result();
    $('#esInfo').textContent = nf1.format(r.footprint) + ' m² por planta · ' + nf1.format(r.area) + ' m² en total';
  }
  elLv.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-l]'); if (!b) return;
    lvl = b.dataset.l === 'jardin' ? 'jardin' : +b.dataset.l; sel = null; sideSig = ''; draw();
  });

  /* ---------- Plano en vivo ---------- */
  function drawPlan() {
    var s = set(); if (!s) return;
    var sh = lvl === 'jardin' ? s.sheets.filter(function (x) { return x.kind === 'site'; })[0]
      : s.sheets.filter(function (x) { return x.kind === 'plan' && x.level === lvl; })[0];
    if (!sh) { elPlan.innerHTML = ''; return; }
    elPlan.innerHTML = sh.render(sh.kind === 'plan' ? { arq: true, cot: true } : null);
    if (sel) $$('[data-rid="' + cssEsc(sel) + '"]', elPlan).forEach(function (r) { r.classList.add('es-on'); });
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
  elPlan.addEventListener('click', function (e) {
    var r = e.target.closest('[data-rid]'); if (!r) return;
    selectRoom(r.getAttribute('data-rid'), true);
  });
  function selectRoom(id, scroll) {
    sel = sel === id && !scroll ? null : id; sideSig = ''; draw();
    if (scroll) { var row = $('.es-room[data-rid="' + cssEsc(id) + '"]', elSide); if (!row) return;
      if (elSide.scrollHeight > elSide.clientHeight + 4) { var d = row.getBoundingClientRect().top - elSide.getBoundingClientRect().top; elSide.scrollTo({ top: elSide.scrollTop + d - 12, behavior: 'smooth' }); }
      else row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  /* ---------- Panel lateral ---------- */
  function labelField(c) {
    var o = override(c.id), cur = o.n || c.n, k = c.k === 'rec' || c.k === 'bano' || c.k === 'soc' ? c.k : null;
    var opts = (k ? PR.ETIQUETAS[k] : []).slice();
    if (opts.indexOf(cur) < 0) opts.unshift(cur);
    var orig = c.n !== cur ? c.n : null;
    return '<div class="field"><label>Nombre o etiqueta</label><div class="es-lbl">' +
      (opts.length > 1 ? '<select class="input" data-act="preset">' + opts.map(function (x) { return '<option' + (x === cur ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '<option value="__otro">Otro nombre…</option></select>' : '') +
      '<input class="input" data-act="name" maxlength="40" value="' + esc(cur) + '" ' + (opts.length > 1 ? 'hidden' : '') + ' aria-label="Nombre del espacio">' +
      '</div>' + (orig || o.n ? '<button type="button" class="btn-text" data-act="unname">Volver a «' + esc(roomDefaultName(c)) + '»</button>' : '') + '</div>';
  }
  function roomDefaultName(c) { var o = override(c.id); if (!o.n) return c.n; var q = Object.assign({}, p(), { rooms: Object.assign({}, p().rooms) }); delete q.rooms[c.id]; return nameIn(q, c.id) || c.n; }
  function nameIn(q, id) {
    var n = null;
    if (q.type === 'deptos') PR.deptoRooms(q.beds, q.baths, q.halfBaths, q.layout, q).forEach(function (r) { if (r.id === id) n = r.n; });
    else PR.program(q).forEach(function (L) { L.front.concat(L.back).forEach(function (r) { if (r.id === id) n = r.n; }); });
    return n;
  }
  function roomRow(c) {
    var o = override(c.id), on = sel === c.id, a = areaOf(c), lim = limits(c), fx = o.x || [];
    var head = '<button type="button" class="es-head" data-act="sel" aria-expanded="' + on + '"><span class="es-dot es-' + c.k + '"></span><b class="es-nm">' + esc(o.n || c.n) + '</b>' +
      '<span class="es-meta"><span class="es-m2 num">' + m1(c.m2) + ' m²</span><small class="es-dim">' + m1(c.w) + ' × ' + m1(c.h) + ' m</small></span></button>';
    var tags = fx.length ? '<div class="es-tags">' + fx.map(function (x) { return '<span class="chip gold">' + esc(PR.EQUIPO[x].n) + '</span>'; }).join('') + '</div>' : '';
    if (!on) return '<div class="es-room" data-rid="' + esc(c.id) + '">' + head + tags + '</div>';
    var fxOpts = kindFx(c);
    var body = labelField(c) +
      '<div class="range"><div class="lb"><label>Tamaño objetivo</label><output class="num"><span data-out="a">' + m1(a) + '</span> m²</output></div>' +
      '<input type="range" data-act="area" min="' + lim.min + '" max="' + lim.max + '" step="0.5" value="' + a + '" aria-label="Área de ' + esc(o.n || c.n) + ' en m²"></div>' +
      '<p class="hint">En planos queda de <b class="es-dim2">' + m1(c.w) + ' × ' + m1(c.h) + ' m (' + m1(c.m2) + ' m²)</b>. Las medidas se ajustan al reparto de la planta; si creces un espacio, los demás se acomodan.</p>' +
      (fxOpts.length ? '<div class="field"><label>Equipamiento</label><div class="es-fx">' + fxOpts.map(function (x) {
        var Q = PR.EQUIPO[x], pr = fx.indexOf(x) > -1;
        return '<button type="button" class="es-tog" data-act="fx" data-fx="' + x + '" aria-pressed="' + pr + '">' + (pr ? '✓ ' : '+ ') + esc(Q.n) + '<small>+' + m1(Q.a) + ' m²</small></button>';
      }).join('') + '</div></div>' : '') +
      '<div class="es-acts">' + (isAdded(c.id) ? '<button type="button" class="btn btn-ghost btn-sm" data-act="del">Quitar espacio</button>' : '') +
      (Object.keys(o).length ? '<button type="button" class="btn-text" data-act="reset">Restablecer este espacio</button>' : '') + '</div>';
    return '<div class="es-room on" data-rid="' + esc(c.id) + '">' + head + '<div class="es-body">' + body + '</div></div>';
  }
  function isAdded(id) { return p().extra.some(function (x) { return x.id === id; }); }

  function levelSide() {
    if (!editable()) return '<p class="note">La configuración por espacio está disponible para casas y departamentos. En ' + esc(PR.TIPOS[p().type].n.toLowerCase()) + ' los espacios se reparten con locales, andenes y circulaciones.</p>';
    var list = roomsOf(lvl), dep = p().type === 'deptos';
    var h = '<div class="es-ttl"><h4>' + (dep ? 'Departamento tipo' : 'Espacios · ' + lvName(lvl)) + '</h4><small>' + list.length + ' espacios</small></div>';
    if (dep) h += '<p class="hint" style="margin-top:0">Los cambios se aplican a todos los departamentos del edificio.</p>';
    if (!list.length) h += '<p class="note">' + (dep ? 'En planta baja van estacionamiento, vestíbulo y servicios. Elige un nivel con departamentos.' : 'Esta planta no tiene espacios configurables.') + '</p>';
    h += '<div class="es-list">' + list.map(roomRow).join('') + '</div>';
    if (!dep) h += '<div class="es-add"><label for="esAddSel">Agregar espacio en ' + lvName(lvl).toLowerCase() + '</label><div class="es-addrow"><select class="input" id="esAddSel">' +
      Object.keys(PR.ESPACIOS).map(function (k) { return '<option value="' + k + '">' + esc(PR.ESPACIOS[k].n) + ' · ' + PR.ESPACIOS[k].a + ' m²</option>'; }).join('') +
      '</select><button type="button" class="btn btn-ink btn-sm" data-act="add">Agregar</button></div></div>';
    var any = Object.keys(p().rooms).length || p().extra.length;
    if (any) h += '<button type="button" class="btn-text es-resetall" data-act="resetall">Restablecer todos los espacios</button>';
    return h;
  }
  function gardenSide() {
    var r = E.result(), yd = r.yard, items = PR.gardenItems(p());
    var h = '<div class="es-ttl"><h4>Jardín y exteriores</h4><small>' + items.length + ' elementos</small></div>';
    h += '<p class="hint" style="margin-top:0">Toca un elemento para agregarlo. Se acomoda en el patio posterior y aparece en la planta de conjunto, el render 3D y el recorrido.</p>';
    h += '<div class="es-fx es-cat">' + Object.keys(PR.JARDIN).map(function (k) { var J = PR.JARDIN[k]; return '<button type="button" class="es-tog" data-act="gadd" data-k="' + k + '">+ ' + esc(J.n) + '<small>' + m1(J.w) + ' × ' + m1(J.d) + ' m</small></button>'; }).join('') + '</div>';
    if (yd) h += '<p class="chip ' + (yd.fits ? 'ok' : 'warn') + ' es-fit"><span class="dot"></span>' + (yd.fits ? 'Cabe en un patio de ' + m1(yd.rear) + ' m de fondo' : 'Necesita ' + m1(yd.need) + ' m de patio y hay ' + m1(yd.rear) + ' m') + '</p>';
    h += '<div class="es-list">' + p().garden.map(function (g, i) {
      var J = PR.JARDIN[g.k]; if (!J) return '';
      var out = yd && yd.items[i] && yd.items[i].out;
      return '<div class="es-room es-g" data-gi="' + i + '"><div class="es-head"><span class="es-dot es-ext"></span><b>' + esc(J.n) + '</b>' + (out ? '<span class="chip warn">No cabe</span>' : '') +
        '<button type="button" class="btn-text" data-act="gdel" aria-label="Quitar ' + esc(J.n) + '">Quitar</button></div>' +
        (J.edit ? '<div class="es-wd"><label>Largo (m)<input class="input num" type="number" min="1" max="30" step="0.5" data-act="gw" value="' + (g.w || J.w) + '"></label><label>Ancho (m)<input class="input num" type="number" min="1" max="30" step="0.5" data-act="gd" value="' + (g.d || J.d) + '"></label></div>'
          : '<small class="muted">' + m1(J.w) + ' × ' + m1(J.d) + ' m</small>') + '</div>';
    }).join('') + '</div>';
    if (r.amen && r.amen.total) h += '<p class="hint">Amenidades y equipamiento en el presupuesto: <b>' + E.money(r.amen.total) + '</b>.</p>';
    return h;
  }
  function sigOf() {
    if (lvl === 'jardin') return 'g|' + JSON.stringify(p().garden.map(function (g) { return g.k; })) + '|' + JSON.stringify((E.result().yard || {}).fits) + JSON.stringify(((E.result().yard || {}).items || []).map(function (x) { return x.out; }));
    return lvl + '|' + p().type + '|' + sel + '|' + roomsOf(lvl).map(function (c) { var o = override(c.id); return c.id + ':' + (o.x || []).join(',') + ':' + (o.n ? 1 : 0) + ':' + (o.a ? 1 : 0); }).join(';');
  }
  function drawSide() {
    var sg = sigOf();
    if (sg === sideSig) { patchSide(); return; }
    sideSig = sg;
    elSide.innerHTML = lvl === 'jardin' ? gardenSide() : levelSide();
  }
  // Actualiza medidas sin reconstruir (para no cortar el arrastre del control de tamaño)
  function patchSide() {
    if (lvl === 'jardin') return;
    roomsOf(lvl).forEach(function (c) {
      var row = $('.es-room[data-rid="' + cssEsc(c.id) + '"]', elSide); if (!row) return;
      var o = override(c.id);
      var t = $('.es-m2', row); if (t) t.textContent = m1(c.m2) + ' m²';
      t = $('.es-dim', row); if (t) t.textContent = m1(c.w) + ' × ' + m1(c.h) + ' m';
      t = $('.es-dim2', row); if (t) t.textContent = m1(c.w) + ' × ' + m1(c.h) + ' m (' + m1(c.m2) + ' m²)';
      t = $('.es-nm', row); if (t) t.textContent = o.n || c.n;
    });
  }

  elSide.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.dataset.act, row = b.closest('[data-rid]'), id = row && row.dataset.rid, gi = b.closest('[data-gi]');
    if (act === 'sel') return selectRoom(id, false);
    if (act === 'fx') {
      var o = override(id), fx = (o.x || []).slice(), k = b.dataset.fx, Q = PR.EQUIPO[k], c = roomsOf(lvl).filter(function (x) { return x.id === id; })[0], a = o.a || (c && c.a) || 10;
      var i = fx.indexOf(k);
      if (i > -1) { fx.splice(i, 1); a = Math.max(1.5, a - Q.a); } else { fx.push(k); a = a + Q.a; }
      return setRoom(id, { x: fx, a: Math.round(a * 2) / 2 });
    }
    if (act === 'unname') return setRoom(id, { n: null });
    if (act === 'reset') { delete p().rooms[id]; return touch(); }
    if (act === 'resetall') { if (!confirmReset()) return; p().rooms = {}; p().extra = []; sel = null; return touch(); }
    if (act === 'del') { p().extra = p().extra.filter(function (x) { return x.id !== id; }); delete p().rooms[id]; sel = null; return touch(); }
    if (act === 'add') {
      var t = $('#esAddSel', elSide).value, nid = 'x-' + Date.now().toString(36);
      p().extra.push({ id: nid, t: t, lvl: lvl }); sel = nid; return touch();
    }
    if (act === 'gadd') { var J = PR.JARDIN[b.dataset.k]; p().garden.push({ k: b.dataset.k, w: J.w, d: J.d }); return touch(); }
    if (act === 'gdel' && gi) { p().garden.splice(+gi.dataset.gi, 1); return touch(); }
  });
  function confirmReset() { return window.confirm ? window.confirm('¿Quitar etiquetas, tamaños, equipamiento y espacios agregados de todas las plantas?') : true; }
  var aTmr;
  elSide.addEventListener('input', function (e) {
    var t = e.target, row = t.closest('[data-rid]'), gi = t.closest('[data-gi]');
    if (t.dataset.act === 'area' && row) {
      var v = +t.value; var out = $('[data-out="a"]', row); if (out) out.textContent = m1(v);
      clearTimeout(aTmr); aTmr = setTimeout(function () { setRoom(row.dataset.rid, { a: v }); }, 60);
    } else if (t.dataset.act === 'name' && row) setRoom(row.dataset.rid, { n: t.value.trim() || null });
    else if ((t.dataset.act === 'gw' || t.dataset.act === 'gd') && gi) {
      var g = p().garden[+gi.dataset.gi], v2 = parseFloat(t.value); if (!g || !(v2 >= 1 && v2 <= 30)) return;
      g[t.dataset.act === 'gw' ? 'w' : 'd'] = v2; touch();
    }
  });
  elSide.addEventListener('change', function (e) {
    var t = e.target, row = t.closest('[data-rid]');
    if (t.dataset.act === 'preset' && row) {
      if (t.value === '__otro') { var inp = $('[data-act="name"]', row); inp.hidden = false; t.hidden = true; inp.focus(); inp.select(); return; }
      setRoom(row.dataset.rid, { n: t.value });
    }
  });

  /* ---------- Ciclo ---------- */
  function draw() { if (!open) return; renderLevels(); drawPlan(); drawSide(); }
  document.addEventListener('rinova:change', function () { if (open) draw(); updateSummary(); });
  document.addEventListener('rinova:pv', function (e) { open = e.detail === 'espacios'; if (open) { sideSig = ''; draw(); } });

  /* ---------- Resumen y acceso desde el formulario ---------- */
  function updateSummary() {
    var el = $('#esSummary'); if (!el) return;
    var q = p(), n = Object.keys(q.rooms || {}).length + (q.extra || []).length, g = PR.gardenItems(q).map(function (x) { return x.n.toLowerCase(); });
    el.textContent = !editable() ? 'Plantas por nivel y láminas' : (n ? n + ' espacio(s) personalizados' : 'Tamaños, etiquetas y equipamiento') + (g.length ? ' · ' + g.slice(0, 3).join(', ') + (g.length > 3 ? '…' : '') : garden() ? ' · alberca, palapa, asador…' : '');
  }
  $$('[data-open-espacios]').forEach(function (b) {
    b.addEventListener('click', function () {
      E.showView('studio'); E.selectTab('planos');
      if (window.RinovaFachadaUI) window.RinovaFachadaUI.show('espacios');
      if (b.dataset.openEspacios === 'jardin') { lvl = 'jardin'; sideSig = ''; draw(); }
      setTimeout(function () { $('#pvTabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
    });
  });
  updateSummary();
  if (!root.hidden) { open = true; draw(); }
  window.RinovaEspacios = { level: function (i) { lvl = i; sideSig = ''; draw(); }, select: function (id) { selectRoom(id, true); } };
})();
