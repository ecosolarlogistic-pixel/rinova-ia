/* RINOVAIA — Estudio conectado a Supabase.
   - La plataforma solo se usa con sesión: sin ella manda a acceso.html y regresa aquí.
   - «Guardar» guarda el proyecto del Estudio en public.projects (cada usuario ve los suyos; el equipo, todos).
   - app.html?p=<id> abre un proyecto guardado; #nuevo empieza uno nuevo.
   - La vista Proyectos muestra la cartera real del usuario en lugar de los ejemplos. */
(function () {
  'use strict';
  var S = window.RinovaSesion, E = window.RinovaEstudio, F = window.RinovaFacade;
  var root = document.documentElement;
  if (!S || !E) { root.classList.remove('auth-wait'); return; }
  var db = S.db, $ = function (s, c) { return (c || document).querySelector(s); };
  var esc = E.esc, toast = E.toast;
  var params = new URLSearchParams(location.search);
  var current = null, list = [], me = null, dirty = false;
  var reveal = setTimeout(function () { root.classList.remove('auth-wait'); }, 8000);

  S.require({ next: 'app.html' + location.search + location.hash }).then(function (s) {
    me = s; clearTimeout(reveal); root.classList.remove('auth-wait');
    var a = s.access, name = a.full_name || s.user.email;
    var u = $('.side .user');
    if (u) u.innerHTML = '<span class="avatar">' + esc(name.trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase()) + '</span><div><b>' + esc(name) + '</b><small>' + esc(a.roleLabel) + '</small></div>';
    var back = document.createElement('a'); back.className = 'back'; back.href = 'interno.html'; back.textContent = (a.interno ? 'Portal interno' : 'Mi portal') + ' →';
    var firstBack = $('.side a.back'); if (firstBack) firstBack.parentNode.insertBefore(back, firstBack);
    addSaveButton();
    var id = params.get('p');
    if (id && /^[0-9a-f-]{36}$/i.test(id)) openProject(id);
    else if (location.hash === '#nuevo') { setCode(null); markDirty(); }
    else setCode(null);
    loadList();
  });

  function setCode(p) {
    current = p;
    var sm = $('#studioBar .title small');
    if (sm) sm.textContent = p ? 'Proyecto · ' + p.code : 'Proyecto nuevo · sin guardar';
    if (p) history.replaceState(null, '', 'app.html?p=' + p.id); else if (params.get('p')) history.replaceState(null, '', 'app.html');
  }
  var autoTmr = null;
  function markDirty() {
    dirty = true;
    // Guardado automático para proyectos que ya existen en la cuenta (los nuevos se guardan la primera vez con «Guardar»)
    clearTimeout(autoTmr); if (current) autoTmr = setTimeout(function () { if (dirty && current) save({ auto: true }); }, 20000); var b = $('#btnSave'); if (b) b.classList.add('pending'); var t = $('#liveTxt'); if (t) t.textContent = 'Cambios sin guardar'; }
  function markClean() { dirty = false; clearTimeout(autoTmr); var b = $('#btnSave'); if (b) b.classList.remove('pending'); var t = $('#liveTxt'); if (t) t.textContent = 'Guardado en tu cuenta'; }

  function addSaveButton() {
    var acts = $('#studioBar .acts'); if (!acts || $('#btnSave')) return;
    var st = document.createElement('style');
    st.textContent = '#btnSave.pending{box-shadow:0 0 0 3px var(--gold-glow)}#btnSave.pending::after{content:"";width:7px;height:7px;border-radius:50%;background:var(--bad);margin-left:2px}';
    document.head.appendChild(st);
    var b = document.createElement('button');
    b.className = 'btn btn-gold btn-sm'; b.id = 'btnSave'; b.type = 'button'; b.title = 'Guardar en tu cuenta (Ctrl+S)';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>Guardar';
    b.addEventListener('click', save);
    acts.insertBefore(b, acts.firstChild);
    // Cualquier cambio en el formulario del Estudio deja el proyecto "sin guardar"
    var main = $('#main');
    if (main) { main.addEventListener('input', function (e) { if (e.target.closest('[data-v="studio"]')) markDirty(); }); main.addEventListener('change', function (e) { if (e.target.closest('[data-v="studio"]')) markDirty(); }); }
    document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  function snapshot() {
    var p = JSON.parse(JSON.stringify(E.project() || {}));
    var r = E.result() || {};
    var city = r.city || {};
    return {
      name: String(p.name || 'Proyecto sin nombre').slice(0, 80),
      city: String(city.name || city.short || p.city || 'Sin ciudad').slice(0, 80),
      data: p,
      budget_total: r.total ? Math.round(r.total) : null,
      area_m2: r.area ? Math.round(r.area * 100) / 100 : null
    };
  }

  var saving = null;
  function save(opt) {
    opt = opt && opt.auto != null ? opt : {};
    if (!me) return Promise.resolve(false);
    if (saving) return saving;
    var b = $('#btnSave'); if (b) b.disabled = true;
    var row = snapshot();
    var q = current ? db.from('projects').update(row).eq('id', current.id).select('id,code,name').single()
      : db.from('projects').insert(row).select('id,code,name').single();
    saving = q.then(function (r) {
      if (r.error) throw r.error;
      setCode(r.data); markClean(); toast(opt.auto ? 'Guardado automático · ' + r.data.code : 'Proyecto guardado · ' + r.data.code); loadList();
      return true;
    }).catch(function (e) {
      toast(/row-level|permission/i.test(e.message) ? 'No tienes permiso para guardar este proyecto.' : 'No se pudo guardar: ' + e.message);
      return false;
    }).then(function (ok) { saving = null; if (b) b.disabled = false; return ok; });
    return saving;
  }

  /* ---------- Salir con cambios sin guardar: diálogo propio en lugar del aviso genérico del navegador ---------- */
  var dlg = null;
  function leaveDialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog'); dlg.id = 'dlgLeave'; dlg.style.width = 'min(600px,calc(100% - 32px))'; dlg.setAttribute('aria-labelledby', 'dlgLeaveT');
    dlg.innerHTML = '<form method="dialog"><h3 id="dlgLeaveT">¿Guardar los cambios del proyecto?</h3>' +
      '<p class="muted" id="dlgLeaveP" style="margin:0">Hiciste cambios que aún no están guardados en tu cuenta.</p>' +
      '<div class="acts"><button class="btn btn-ghost" value="cancel">Cancelar</button><button class="btn btn-ink" value="discard">Salir sin guardar</button><button class="btn btn-gold" value="save">Guardar y salir</button></div></form>';
    document.body.appendChild(dlg);
    return dlg;
  }
  // go(): lo que se hace al salir. Sin cambios pendientes se ejecuta de inmediato.
  function leave(go, what) {
    if (!dirty || !me) { go(); return; }
    var d = leaveDialog();
    d.querySelector('#dlgLeaveP').textContent = 'Hiciste cambios en «' + (E.project().name || 'el proyecto') + '» que aún no están guardados' + (what ? ' antes de ' + what : '') + '.';
    d.returnValue = '';
    d.onclose = function () {
      var v = d.returnValue;
      if (v === 'discard') { dirty = false; go(); }
      else if (v === 'save') save().then(function (ok) { if (ok) go(); });
    };
    d.showModal();
    setTimeout(function () { var g = d.querySelector('[value="save"]'); if (g) g.focus(); }, 30);
  }
  // Enlaces internos (Portal interno, Mi portal, distribuidores, inicio…)
  document.addEventListener('click', function (e) {
    if (!dirty || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest('a[href]'); if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    var href = a.getAttribute('href'); if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return;
    var url; try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    e.preventDefault();
    leave(function () { location.href = url.href; }, 'salir');
  });

  function openProject(id) {
    db.from('projects').select('id,code,name,data').eq('id', id).maybeSingle().then(function (r) {
      if (r.error || !r.data) { toast('No encontré ese proyecto o no tienes acceso.'); setCode(null); return; }
      var d = r.data.data || {};
      d.name = r.data.name;
      // proyectos anteriores no traen espacios ni jardín: que no hereden los del proyecto abierto antes
      d.rooms = d.rooms || {}; d.extra = d.extra || []; d.garden = d.garden || [];
      E.apply(d); E.refresh(); E.showView('studio');
      setCode(r.data); markClean(); toast('Abriste ' + r.data.name);
    });
  }

  /* ---------- Cartera real en la vista Proyectos ---------- */
  var STAGE = { diseno: 'Diseño', ingenieria: 'Ingeniería', licencias: 'Licencias', obra: 'Obra', entregado: 'Entregado' };
  var PST = { borrador: ['gold', 'Borrador'], en_revision: ['warn', 'En revisión'], aprobado: ['ok', 'Aprobado'], presentado: ['ok', 'Presentado'], contratado: ['ok', 'Contratado'], cancelado: ['bad', 'Cancelado'] };
  function loadList() {
    db.from('projects').select('id,code,name,city,status,stage,budget_total,data,updated_at').order('updated_at', { ascending: false }).limit(60).then(function (r) {
      if (r.error) { console.warn(r.error.message); return; }
      list = r.data || []; renderList();
    });
  }
  function renderList() {
    var grid = $('#projGrid'); if (!grid || !me) return;
    var cnt = $('.side [data-view="projects"] .count'); if (cnt) cnt.textContent = list.length;
    var total = 0, work = 0, rev = 0;
    grid.innerHTML = '<article class="card pcard" style="place-content:center;text-align:center;border-style:dashed;min-height:260px;cursor:pointer" data-cloud-new><div class="body"><div style="width:52px;height:52px;border-radius:50%;margin:0 auto;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold-ink);font-size:28px">+</div><h3>Crear proyecto</h3><span class="meta" style="justify-content:center">Empieza un diseño nuevo y guárdalo con «Guardar»</span></div></article>' +
      list.map(function (p, i) {
        var d = p.data || {}, st = PST[p.status] || ['gold', p.status];
        total += +p.budget_total || 0; if (p.stage === 'obra') work++; if (p.status === 'en_revision') rev++;
        var pic = '';
        try { var FXP = window.RinovaFachada; if (FXP && d.fx && d.fx.on) { var q = Object.assign({}, E.project(), d); pic = FXP.svg(q, E.simulate(d), d.fx, { id: 'c' + i, marks: false }).svg; } } catch (e) { pic = ''; }
        if (!pic) try { pic = F.build({ floors: d.floors || 2, bays: d.bays || 5, style: d.style || 'moderno', mode: 'render', phi: false, lat: 19.4, palette: d.palette || 'concreto', hour: d.hour || 17, width: 600, height: 340, id: 'c' + i }); } catch (e) { }
        return '<article class="card pcard"><div class="thumb">' + pic + '<span class="stage">' + esc(STAGE[p.stage] || 'Diseño') + '</span></div><div class="body"><div class="meta"><span>' + esc(p.code) + ' · ' + esc(p.city) + '</span><span class="chip ' + st[0] + '"><span class="dot"></span>' + esc(st[1]) + '</span></div><h3>' + esc(p.name) + '</h3>' +
          '<div class="meta"><span>Actualizado ' + new Date(p.updated_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + '</span><span class="num">' + (p.budget_total ? E.money(+p.budget_total, true) : '—') + '</span></div>' +
          '<button class="btn btn-ghost btn-sm" data-cloud="' + p.id + '">Abrir proyecto</button></div></article>';
      }).join('');
    var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    set('#pfActive', list.filter(function (p) { return p.status !== 'cancelado' && p.stage !== 'entregado'; }).length);
    set('#pfWork', work); set('#pfTotal', E.money(total, true)); set('#pfIssues', rev);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cloud]');
    if (b) { e.stopPropagation(); var id = b.dataset.cloud; leave(function () { openProject(id); }, 'abrir otro proyecto'); return; }
    if (e.target.closest('[data-cloud-new]')) leave(function () { dirty = false; location.href = 'app.html#nuevo'; location.reload(); }, 'crear un proyecto nuevo');
  }, true);
  // El Estudio vuelve a pintar sus ejemplos al cambiar de moneda: se repinta la cartera real
  var seg = $('#segCur'); if (seg) seg.addEventListener('click', function () { setTimeout(renderList, 20); });

  window.RinovaNube = { save: save, leave: function (url) { leave(function () { location.href = url; }, 'salir'); }, open: openProject, current: function () { return current; } };
})();
