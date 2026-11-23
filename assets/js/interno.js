/* RINOVAIA — portal interno (Supabase). Cada consulta usa la sesión del usuario: lo que ve lo decide RLS.
   Secciones: Mi panel (resumen + calendario día/semana/mes/año), Proyectos, Obras y etapas, Prospectos,
   Usuarios (Dirección, vía función gestion-usuarios), Asistentes y Mi cuenta. */
(function () {
  'use strict';
  var S = window.RinovaSesion, db = window.rinovaDB;
  if (!S) return;
  var FN = 'https://evjoqaphylggvojthezj.supabase.co/functions/v1/';
  var KEY = 'sb_publishable_ll_SpxeCPe8VEFVVX1KpMg_s6DfoWkX';
  var DOM = '@rinovaia.com';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  function money(v) { v = +v || 0; return v >= 1e6 ? '$' + (v / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 2 }) + ' M' : '$' + nf0.format(v); }
  var tt; function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, 3400); }
  function initials(n) { return String(n || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase() || '?'; }

  /* ---------- Fechas (siempre locales, AAAA-MM-DD) ---------- */
  function d0(x) { var d = x ? new Date(x) : new Date(); d.setHours(0, 0, 0, 0); return d; }
  function pd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addD(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function monday(d) { var x = d0(d); var w = (x.getDay() + 6) % 7; return addD(x, -w); }
  var TODAY = d0();
  var fLong = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  var fMonth = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });
  var fShort = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
  var fDayHead = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric' });
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fdate(s) { return s ? fShort.format(pd(s)) : '—'; }
  function fdt(s) { return s ? new Date(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }

  /* ---------- Estado ---------- */
  var me = null, A = {}, people = {}, projects = [], obras = [], resumen = {};
  var can = { admin: false, staff: false, obra: false, ventas: false, dist: false };
  var OBRA_ST = { planeada: 'Planeada', en_curso: 'En curso', pausada: 'Pausada', terminada: 'Terminada', cancelada: 'Cancelada' };
  var ET_ST = { pendiente: 'Pendiente', en_proceso: 'En proceso', terminada: 'Terminada' };
  var PROJ_ST = { borrador: 'Borrador', en_revision: 'En revisión', aprobado: 'Aprobado', presentado: 'Presentado', contratado: 'Contratado', cancelado: 'Cancelado' };
  var STAGE = { diseno: 'Diseño', ingenieria: 'Ingeniería', licencias: 'Licencias', obra: 'Obra', entregado: 'Entregado' };

  function personName(id) { var p = people[id]; return p ? (p.full_name || p.email || '—') : '—'; }

  /* ---------- Navegación ---------- */
  var TITLES = { panel: 'Mi panel', proyectos: 'Proyectos', obras: 'Obras y etapas', prospectos: 'Prospectos', usuarios: 'Usuarios', asistentes: 'Asistentes', cuenta: 'Mi cuenta' };
  var loaded = {};
  function go(sec, push) {
    if (!TITLES[sec]) sec = 'panel';
    var btn = $('.pt-nv[data-sec="' + sec + '"]');
    if (btn && btn.closest('[hidden]')) sec = 'panel';
    $$('.sec').forEach(function (s) { s.classList.toggle('on', s.dataset.s === sec); });
    $$('.pt-nv[data-sec]').forEach(function (b) { if (b.dataset.sec === sec) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('#secTitle').textContent = TITLES[sec];
    document.title = TITLES[sec] + ' · RINOVAIA';
    if (push !== false) history.replaceState(null, '', '#' + sec);
    menu(false); window.scrollTo(0, 0);
    if (sec === 'proyectos') renderProjects();
    if (sec === 'obras') renderObras();
    if (sec === 'prospectos' && !loaded.leads) loadLeads();
    if (sec === 'usuarios' && !loaded.users) loadUsers();
    if (sec === 'asistentes' && !loaded.ai) loadAI();
    if (sec === 'cuenta') fillMe();
  }
  $$('.pt-nv[data-sec]').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.sec); }); });
  document.addEventListener('click', function (e) { var g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
  function menu(on) { $('#side').classList.toggle('open', on); $('#scrim').classList.toggle('on', on); $('#menuBtn').setAttribute('aria-expanded', on); }
  $('#menuBtn').addEventListener('click', function () { menu(!$('#side').classList.contains('open')); });
  $('#scrim').addEventListener('click', function () { menu(false); });
  $('#btnOut').addEventListener('click', function () { S.signOut(); });

  /* ---------- Arranque ---------- */
  if (location.hash === '#crear') { location.replace('app.html#nuevo'); return; }
  S.require({ next: 'interno.html' + location.hash }).then(function (s) {
    me = s; A = s.access;
    var r = A.roles || [];
    can.admin = !!A.is_admin;
    can.staff = !!A.interno;
    can.obra = can.admin || r.some(function (x) { return ['arquitecto', 'ingeniero', 'supervisor'].indexOf(x) >= 0; });
    can.ventas = can.admin || r.indexOf('ventas') >= 0;
    can.dist = can.admin || r.indexOf('distribuidor') >= 0;
    $$('[data-need]').forEach(function (el) { var n = el.dataset.need; el.hidden = !(n === 'admin' ? can.admin : n === 'staff' ? can.staff : n === 'obra' ? can.obra : n === 'ventas' ? can.ventas : n === 'dist' ? can.dist : true); });
    var name = A.full_name || s.user.email;
    $('#meName').textContent = name; $('#meRole').textContent = A.roleLabel;
    $('#meAv').textContent = $('#topAv').textContent = initials(name); $('#topAv').title = name;
    hello(name);
    $('#projScope').textContent = can.staff ? 'Todos los proyectos de la cartera RINOVAIA.' : 'Tus proyectos guardados desde el Estudio de diseño.';
    $('#calScope').textContent = can.staff ? 'Todo el equipo' : 'Mis obras';
    if (!can.staff) { $('#helloChatS').textContent = 'Escríbenos por WhatsApp'; }
    go((location.hash || '#panel').slice(1), false);
    return loadAll();
  });

  function loadAll() {
    return Promise.all([
      db.rpc('portal_resumen'),
      db.from('profiles').select('id,full_name,email,phone,company,job_title,active').order('full_name'),
      db.from('projects').select('id,code,name,client_name,city,status,stage,budget_total,area_m2,owner_id,created_at,updated_at').order('updated_at', { ascending: false }).limit(500),
      db.from('obras').select('*,obra_etapas(*)').order('start_date').limit(500)
    ]).then(function (res) {
      res.forEach(function (r) { if (r.error) console.warn(r.error.message); });
      if (res[0].error && /portal_resumen|function/i.test(res[0].error.message)) toast('Falta aplicar el esquema del portal en Supabase.');
      resumen = res[0].data || {};
      people = {}; (res[1].data || []).forEach(function (p) { people[p.id] = p; });
      projects = res[2].data || [];
      obras = (res[3].data || []).map(function (o) { o.obra_etapas = (o.obra_etapas || []).sort(function (a, b) { return a.sort_order - b.sort_order || (a.start_date < b.start_date ? -1 : 1); }); return o; });
      renderKpis(); fillFilters(); renderCal(); renderRecent(); renderAttn();
      var on = $('.sec.on'); if (on && on.dataset.s === 'proyectos') renderProjects(); if (on && on.dataset.s === 'obras') renderObras();
      count('#cntProj', projects.length); count('#cntObras', obras.filter(function (o) { return o.status === 'en_curso'; }).length);
      count('#cntLeads', can.ventas ? resumen.prospectos_nuevos : 0);
    });
  }
  function count(sel, n) { var el = $(sel); el.hidden = !n; el.textContent = n; }

  /* ---------- Bienvenida y "Abrir mi correo" (skill VerCorreo) ---------- */
  var myMail = '';
  function hello(name) {
    $('#hDate').textContent = cap(fLong.format(new Date()));
    $('#hName').textContent = (name || '').trim().split(/\s+/)[0] || 'equipo';
    $('#hRole').textContent = A.roleLabel + (A.job_title ? ' · ' + A.job_title : '');
    var email = String(A.email || me.user.email || '').toLowerCase();
    var own = email.slice(-DOM.length) === DOM;
    myMail = own ? email : '';
    $('#myMailAddr').textContent = own ? email : 'Tu cuenta no es ' + DOM + '; se abrirá Hostinger Mail.';
  }
  $('#myMailBtn').addEventListener('click', function () {
    var url = myMail ? 'https://mail.hostinger.com/auth/login?_user=' + encodeURIComponent(myMail) + '&mode=add' : 'https://mail.hostinger.com/auth/login';
    var w = Math.min(1200, screen.availWidth - 40), h = Math.min(850, screen.availHeight - 60);
    var l = Math.max(0, (screen.availWidth - w) / 2), t = Math.max(0, (screen.availHeight - h) / 2);
    var win = window.open(url, 'rinovaCorreo', 'popup=yes,width=' + w + ',height=' + h + ',left=' + l + ',top=' + t);
    if (win) win.focus(); else window.open(url, '_blank', 'noopener');
  });
  $('#helloChat').addEventListener('click', function () {
    if (can.staff && window.chatInterno) return window.chatInterno.open();
    window.open('https://wa.me/?text=' + encodeURIComponent('Hola RINOVAIA, tengo una duda sobre mi proyecto.'), '_blank', 'noopener');
  });

  /* ---------- Tarjetas de resumen ---------- */
  function renderKpis() {
    var R = resumen, k = [];
    k.push(['Proyectos activos', R.proyectos_activos, R.proyectos_mes ? R.proyectos_mes + ' nuevos este mes' : 'Diseño, ingeniería u obra', 'proyectos']);
    k.push(['Obras en curso', R.obras_en_curso, (R.obras || 0) + ' obras abiertas', 'obras']);
    k.push(['Etapas activas hoy', R.etapas_hoy, (R.etapas_semana || 0) + ' inician esta semana', 'panel']);
    if (can.ventas) k.push(['Prospectos nuevos', R.prospectos_nuevos, 'Sitio y chatbot', 'prospectos']);
    else k.push(['Etapas atrasadas', R.etapas_atrasadas, 'Fin vencido sin terminar', 'obras', R.etapas_atrasadas > 0]);
    if (can.admin) {
      k.splice(3, 0, ['Etapas atrasadas', R.etapas_atrasadas, 'Fin vencido sin terminar', 'obras', R.etapas_atrasadas > 0]);
      k.push(['Presupuesto en cartera', money(R.cartera), 'Suma de proyectos vigentes', 'proyectos']);
      k.push(['Equipo', R.usuarios_internos, (R.usuarios || 0) + ' cuentas activas', 'usuarios']);
      k.push(['Proyectos totales', R.proyectos, 'Incluye borradores', 'proyectos']);
    }
    $('#kpis').innerHTML = k.map(function (x) {
      return '<div class="card kpi' + (x[4] ? ' alert' : '') + '" data-go="' + x[3] + '" role="button" tabindex="0"><span>' + esc(x[0]) + '</span><b class="num">' + esc(x[1] == null ? '—' : x[1]) + '</b><small>' + esc(x[2]) + '</small></div>';
    }).join('');
  }

  /* ---------- Calendario de obras ---------- */
  var cal = { v: 'mes', d: d0() };
  try { var sv = localStorage.getItem('rinova.cal.v'); if (sv) cal.v = sv; } catch (e) { }
  function fillFilters() {
    var fo = $('#fObra'), cur = fo.value;
    fo.innerHTML = '<option value="">Todas las obras</option>' + obras.map(function (o) { return '<option value="' + o.id + '">' + esc(o.code + ' · ' + o.name) + '</option>'; }).join('');
    fo.value = cur;
    var ids = {}; obras.forEach(function (o) { if (o.responsible_id) ids[o.responsible_id] = 1; o.obra_etapas.forEach(function (e) { if (e.responsible_id) ids[e.responsible_id] = 1; }); });
    var fr = $('#fResp'), cr = fr.value;
    fr.innerHTML = '<option value="">Todos los responsables</option>' + Object.keys(ids).map(function (id) { return '<option value="' + id + '">' + esc(personName(id)) + '</option>'; }).join('');
    fr.value = cr;
  }
  function isLate(e) { return e.status !== 'terminada' && pd(e.end_date) < TODAY; }
  function events() {
    var fo = $('#fObra').value, fs = $('#fStat').value, fr = $('#fResp').value, out = [];
    obras.forEach(function (o) {
      if (fo && o.id !== fo) return;
      if (o.status === 'cancelada' && fs !== '') return;
      var list = o.obra_etapas.length ? o.obra_etapas : [{ id: null, name: OBRA_ST[o.status], start_date: o.start_date, end_date: o.end_date, progress: o.status === 'terminada' ? 100 : 0, status: o.status === 'terminada' ? 'terminada' : 'pendiente', responsible_id: o.responsible_id, _obra: true }];
      list.forEach(function (e) {
        var resp = e.responsible_id || o.responsible_id;
        if (fr && resp !== fr) return;
        if (fs === 'activas' && e.status === 'terminada') return;
        if (fs === 'atrasadas' && !isLate(e)) return;
        if (fs === 'terminada' && e.status !== 'terminada') return;
        out.push({ e: e, o: o, s: pd(e.start_date), f: pd(e.end_date), resp: resp });
      });
    });
    return out;
  }
  function evBtn(x, long) {
    var cls = 'ev' + (isLate(x.e) ? ' late' : '') + (x.e.status === 'terminada' ? ' done' : '');
    var t = long ? x.o.name + ' · ' + x.e.name + ' (' + x.e.progress + ' %)' : x.e.name;
    return '<button type="button" class="' + cls + '" style="--c:' + esc(x.o.color) + '" data-ev="' + (x.e.id || '') + '" data-obra="' + x.o.id + '" title="' + esc(x.o.name + ' — ' + x.e.name + ': ' + fdate(x.e.start_date) + ' a ' + fdate(x.e.end_date) + ', ' + x.e.progress + ' %') + '">' + esc(t) + '</button>';
  }
  function on(x, d) { return x.s <= d && x.f >= d; }
  function renderCal() {
    $$('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === cal.v); });
    var ev = events(), body = $('#calBody'), d = cal.d, html = '';
    if (!obras.length) {
      $('#calTitle').textContent = cap(fMonth.format(d));
      body.innerHTML = '<div class="empty">' + (can.obra ? 'Aún no hay obras. Crea la primera con <b>Nueva obra</b> y sus etapas aparecerán aquí.' : 'Aún no hay obras asignadas a tu cuenta. Cuando el equipo programe tu obra, verás aquí cada etapa.') + '</div>';
      $('#calLegend').innerHTML = ''; return;
    }
    if (cal.v === 'mes') {
      $('#calTitle').textContent = cap(fMonth.format(d));
      var first = new Date(d.getFullYear(), d.getMonth(), 1), start = monday(first);
      var last = new Date(d.getFullYear(), d.getMonth() + 1, 0), weeks = Math.ceil(((last - start) / 864e5 + 1) / 7);
      html = '<div class="month">' + ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(function (x) { return '<div class="dow">' + x + '</div>'; }).join('');
      for (var i = 0; i < weeks * 7; i++) {
        var day = addD(start, i), list = ev.filter(function (x) { return on(x, day); });
        html += '<div class="day' + (day.getMonth() !== d.getMonth() ? ' out' : '') + (+day === +TODAY ? ' today' : '') + '" data-day="' + iso(day) + '"><span class="n">' + day.getDate() + '</span>' +
          list.slice(0, 3).map(function (x) { return evBtn(x); }).join('') + (list.length > 3 ? '<span class="more">+' + (list.length - 3) + ' más</span>' : '') + '</div>';
      }
      html += '</div>';
    } else if (cal.v === 'semana') {
      var m = monday(d), e7 = addD(m, 6);
      $('#calTitle').textContent = fShort.format(m) + ' – ' + fShort.format(e7) + ' ' + e7.getFullYear();
      html = '<div class="week">';
      for (var j = 0; j < 7; j++) {
        var dd = addD(m, j), ls = ev.filter(function (x) { return on(x, dd); });
        html += '<div class="wcol' + (+dd === +TODAY ? ' today' : '') + '"><h4><span>' + esc(fDayHead.format(dd)) + '</span><small>' + ls.length + '</small></h4>' + (ls.map(function (x) { return evBtn(x, true); }).join('') || '<span class="more">Sin etapas</span>') + '</div>';
      }
      html += '</div>';
    } else if (cal.v === 'dia') {
      $('#calTitle').textContent = cap(fLong.format(d)) + ' ' + d.getFullYear();
      var ld = ev.filter(function (x) { return on(x, d); });
      html = ld.length ? '<div class="dlist">' + ld.map(function (x) {
        var tag = +x.s === +d ? '<span class="tag gold">Inicia hoy</span> ' : +x.f === +d ? '<span class="tag">Termina hoy</span> ' : '';
        if (isLate(x.e)) tag = '<span class="tag off">Atrasada</span> ';
        return '<div class="drow" style="--c:' + esc(x.o.color) + '" data-ev="' + (x.e.id || '') + '" data-obra="' + x.o.id + '" role="button" tabindex="0"><span class="bar"></span><div><b>' + esc(x.e.name) + '</b><small>' + tag + esc(x.o.code + ' · ' + x.o.name) + (x.o.city ? ' · ' + esc(x.o.city) : '') + '</small></div>' +
          '<div><div class="prog"><i style="width:' + x.e.progress + '%"></i></div><small>' + x.e.progress + ' % · ' + esc(ET_ST[x.e.status] || x.e.status) + '</small></div><small>' + esc(personName(x.resp)) + '<br>' + fdate(x.e.start_date) + ' – ' + fdate(x.e.end_date) + '</small></div>';
      }).join('') + '</div>' : '<div class="empty">Sin etapas programadas este día.</div>';
    } else {
      var y = d.getFullYear(), y0 = new Date(y, 0, 1), y1 = new Date(y + 1, 0, 1), span = (y1 - y0);
      $('#calTitle').textContent = 'Año ' + y;
      var pos = function (s, f) { var a = Math.max(s, y0), b = Math.min(+addD(f, 1), +y1); return { l: (a - y0) / span * 100, w: Math.max(0.4, (b - a) / span * 100) }; };
      var mnames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      var nowL = TODAY.getFullYear() === y ? '<span class="now" style="left:' + ((TODAY - y0) / span * 100) + '%"></span>' : '';
      html = '<div class="year"><div class="yr head"><div class="lbl">Obra / etapa</div><div class="track">' + mnames.map(function (n) { return '<div class="m">' + n + '</div>'; }).join('') + '</div></div>';
      var byObra = {};
      ev.forEach(function (x) { if (x.f >= y0 && x.s < y1) (byObra[x.o.id] = byObra[x.o.id] || { o: x.o, l: [] }).l.push(x); });
      var keys = Object.keys(byObra);
      keys.forEach(function (k) {
        var g = byObra[k], o = g.o, p = pos(pd(o.start_date), pd(o.end_date));
        html += '<div class="yr obra"><div class="lbl" title="' + esc(o.name) + '">' + esc(o.code + ' · ' + o.name) + '</div><div class="track">' + mnames.map(function () { return '<div class="m"></div>'; }).join('') + nowL +
          '<span class="gb obra" style="--c:' + esc(o.color) + ';left:' + p.l + '%;width:' + p.w + '%" data-obra-edit="' + o.id + '" title="' + esc(o.name + ': ' + fdate(o.start_date) + ' a ' + fdate(o.end_date)) + '"></span></div></div>';
        g.l.forEach(function (x) {
          var q = pos(x.s, x.f);
          html += '<div class="yr etapa"><div class="lbl" title="' + esc(x.e.name) + '">' + esc(x.e.name) + '</div><div class="track">' + mnames.map(function () { return '<div class="m"></div>'; }).join('') + nowL +
            '<span class="gb" style="--c:' + esc(o.color) + ';--p:' + x.e.progress + '%;left:' + q.l + '%;width:' + q.w + '%" data-ev="' + (x.e.id || '') + '" data-obra="' + o.id + '" title="' + esc(x.e.name + ': ' + fdate(x.e.start_date) + ' a ' + fdate(x.e.end_date) + ', ' + x.e.progress + ' %') + '"><i></i></span></div></div>';
        });
      });
      if (!keys.length) html += '<div class="empty" style="border:0">Sin obras en ' + y + ' con estos filtros.</div>';
      html += '</div>';
    }
    body.innerHTML = html;
    var used = {}; ev.forEach(function (x) { used[x.o.id] = x.o; });
    $('#calLegend').innerHTML = Object.keys(used).slice(0, 12).map(function (k) { return '<span><i style="--c:' + esc(used[k].color) + '"></i>' + esc(used[k].name) + '</span>'; }).join('') + '<span><i style="--c:#FBEEEC;border:1px solid #EBC6C1"></i>Atrasada</span>';
  }
  $$('.seg button').forEach(function (b) { b.addEventListener('click', function () { cal.v = b.dataset.v; try { localStorage.setItem('rinova.cal.v', cal.v); } catch (e) { } renderCal(); }); });
  function step(n) {
    var d = cal.d;
    cal.d = cal.v === 'mes' ? new Date(d.getFullYear(), d.getMonth() + n, 1) : cal.v === 'semana' ? addD(d, 7 * n) : cal.v === 'dia' ? addD(d, n) : new Date(d.getFullYear() + n, 0, 1);
    renderCal();
  }
  $('#calPrev').addEventListener('click', function () { step(-1); });
  $('#calNext').addEventListener('click', function () { step(1); });
  $('#calToday').addEventListener('click', function () { cal.d = d0(); renderCal(); });
  ['#fObra', '#fStat', '#fResp'].forEach(function (s) { $(s).addEventListener('change', renderCal); });
  $('#calRefresh').addEventListener('click', function () { loadAll().then(function () { toast('Calendario actualizado.'); }); });
  $('#calBody').addEventListener('click', function (e) {
    var t = e.target.closest('[data-ev],[data-obra-edit]');
    if (t) { e.stopPropagation(); if (t.dataset.obraEdit) return openObra(t.dataset.obraEdit); return t.dataset.ev ? openEtapa(+t.dataset.ev) : openObra(t.dataset.obra); }
    var day = e.target.closest('[data-day]');
    if (day) { cal.d = pd(day.dataset.day); cal.v = 'dia'; renderCal(); }
  });
  $('#calBody').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('.drow')) e.target.click(); });
  $('#kpis').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.dataset.go) go(e.target.dataset.go); });

  /* ---------- Listas del panel ---------- */
  function projCard(p) {
    return '<div class="card pc"><div class="top"><div><small class="meta">' + esc(p.code) + (p.city ? ' · ' + esc(p.city) : '') + '</small><h4>' + esc(p.name) + '</h4></div><span class="chip ' + (p.status === 'contratado' ? 'ok' : p.status === 'cancelado' ? 'bad' : 'gold') + '"><span class="dot"></span>' + esc(PROJ_ST[p.status] || p.status) + '</span></div>' +
      '<div class="fig"><span><b>' + (p.area_m2 ? nf0.format(p.area_m2) + ' m²' : '—') + '</b>Construcción</span><span><b>' + (p.budget_total ? money(p.budget_total) : '—') + '</b>Presupuesto</span><span><b>' + esc(STAGE[p.stage] || '—') + '</b>Etapa</span></div>' +
      '<div class="meta">' + (can.staff ? 'Cliente: ' + esc(p.client_name || personName(p.owner_id)) + ' · ' : '') + 'Actualizado ' + fdt(p.updated_at) + '</div>' +
      '<div class="acts"><a class="btn btn-ink btn-sm" href="app.html?p=' + p.id + '">Abrir en el Estudio</a>' + (can.admin ? '<button class="btn btn-danger btn-sm" data-del-proj="' + p.id + '">Eliminar</button>' : '') + '</div></div>';
  }
  function renderRecent() {
    $('#recentProj').className = '';
    $('#recentProj').innerHTML = projects.length ? '<table class="tbl"><tbody>' + projects.slice(0, 6).map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b><small>' + esc(p.code) + ' · ' + esc(PROJ_ST[p.status] || p.status) + '</small></td><td class="num">' + (p.budget_total ? money(p.budget_total) : '—') + '</td><td style="text-align:right"><a class="btn btn-ghost btn-sm" href="app.html?p=' + p.id + '">Abrir</a></td></tr>';
    }).join('') + '</tbody></table>' : '<div class="empty">Aún no hay proyectos. <a href="app.html#nuevo" style="color:var(--gold-ink);font-weight:600">Crea el primero</a>: se guarda en tu cuenta.</div>';
  }
  function renderAttn() {
    var lim = addD(TODAY, 7), list = [];
    obras.forEach(function (o) { o.obra_etapas.forEach(function (e) { if (e.status === 'terminada') return; var f = pd(e.end_date); if (f < TODAY || f <= lim) list.push({ o: o, e: e, late: f < TODAY }); }); });
    list.sort(function (a, b) { return a.e.end_date < b.e.end_date ? -1 : 1; });
    $('#attn').className = '';
    $('#attn').innerHTML = list.length ? '<table class="tbl"><tbody>' + list.slice(0, 8).map(function (x) {
      return '<tr style="cursor:pointer" data-open-et="' + x.e.id + '"><td><b>' + esc(x.e.name) + '</b><small>' + esc(x.o.name) + '</small></td><td>' + (x.late ? '<span class="tag off">Atrasada</span>' : '<span class="tag gold">Vence ' + fdate(x.e.end_date) + '</span>') + '</td><td class="num">' + x.e.progress + ' %</td></tr>';
    }).join('') + '</tbody></table>' : '<div class="empty">Todo al día: ninguna etapa vencida ni por vencer esta semana.</div>';
  }
  $('#attn').addEventListener('click', function (e) { var r = e.target.closest('[data-open-et]'); if (r) openEtapa(+r.dataset.openEt); });

  /* ---------- Proyectos ---------- */
  function renderProjects() {
    var q = ($('#projQ').value || '').toLowerCase();
    var list = projects.filter(function (p) { return !q || (p.name + ' ' + (p.client_name || '') + ' ' + p.code + ' ' + (p.city || '') + ' ' + personName(p.owner_id)).toLowerCase().indexOf(q) >= 0; });
    $('#projGrid').innerHTML = '<a class="card pc new" href="app.html#nuevo"><div class="plus">+</div><b>Crear proyecto</b><span>Diseña en el Estudio y guárdalo en tu cartera</span></a>' + list.map(projCard).join('');
  }
  $('#projQ').addEventListener('input', renderProjects);
  $('#projGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del-proj]'); if (!b) return;
    var p = projects.find(function (x) { return x.id === b.dataset.delProj; });
    if (!p || !confirm('¿Eliminar el proyecto "' + p.name + '"? No se puede deshacer.')) return;
    db.from('projects').delete().eq('id', p.id).then(function (r) { if (r.error) return toast(r.error.message); toast('Proyecto eliminado.'); loadAll(); });
  });

  /* ---------- Obras y etapas ---------- */
  function renderObras() {
    var box = $('#obrasList');
    if (!obras.length) { box.innerHTML = '<div class="empty">' + (can.obra ? 'Aún no hay obras. Usa <b>Nueva obra</b> para programar la primera.' : 'Aún no hay obras asignadas a tu cuenta.') + '</div>'; return; }
    box.innerHTML = obras.map(function (o) {
      var et = o.obra_etapas, avg = et.length ? Math.round(et.reduce(function (s, e) { return s + e.progress; }, 0) / et.length) : (o.status === 'terminada' ? 100 : 0);
      var late = et.filter(isLate).length;
      var editable = can.obra || o.responsible_id === A.id;
      return '<div class="card obra-c"><div class="obra-h" style="--c:' + esc(o.color) + '"><span class="bar"></span><div><small class="meta">' + esc(o.code) + ' · ' + esc(OBRA_ST[o.status]) + (late ? ' · <span style="color:var(--bad)">' + late + ' atrasada' + (late > 1 ? 's' : '') + '</span>' : '') + '</small><h4>' + esc(o.name) + '</h4>' +
        '<div class="meta">' + esc([o.client_name, o.city].filter(Boolean).join(' · ') || '—') + ' · ' + fdate(o.start_date) + ' – ' + fdate(o.end_date) + ' · Responsable: ' + esc(personName(o.responsible_id)) + (o.budget ? ' · ' + money(o.budget) : '') + '</div>' +
        '<div class="prog" style="margin-top:8px;max-width:420px"><i style="width:' + avg + '%"></i></div><small class="meta">' + avg + ' % de avance promedio</small></div>' +
        '<div class="rowacts">' + (editable ? '<button class="btn btn-ghost btn-sm" data-add-et="' + o.id + '">+ Etapa</button><button class="btn btn-ink btn-sm" data-edit-obra="' + o.id + '">Editar</button>' : '') + '</div></div>' +
        (et.length ? '<div class="obra-e">' + et.map(function (e) {
          return '<div class="erow"><span><b>' + esc(e.name) + '</b>' + (isLate(e) ? ' <span class="tag off">Atrasada</span>' : '') + '</span><small class="meta">' + fdate(e.start_date) + ' – ' + fdate(e.end_date) + '</small><div><div class="prog"><i style="width:' + e.progress + '%"></i></div><small class="meta">' + e.progress + ' %</small></div><small class="meta">' + esc(ET_ST[e.status]) + '</small><button class="btn btn-text btn-sm" data-open-et="' + e.id + '">' + (editable || e.responsible_id === A.id ? 'Actualizar' : 'Ver') + '</button></div>';
        }).join('') + '</div>' : '') + '</div>';
    }).join('');
  }
  $('#obrasList').addEventListener('click', function (e) {
    var t = e.target.closest('[data-edit-obra],[data-add-et],[data-open-et]'); if (!t) return;
    if (t.dataset.editObra) openObra(t.dataset.editObra);
    else if (t.dataset.addEt) openEtapa(null, t.dataset.addEt);
    else openEtapa(+t.dataset.openEt);
  });
  $('#btnNewObra').addEventListener('click', function () { openObra(null); });
  $('#calNewObra').addEventListener('click', function () { openObra(null); });

  function peopleOptions(sel, filter, first) {
    var ids = Object.keys(people).filter(function (id) { return people[id].active !== false && (!filter || filter(people[id])); });
    ids.sort(function (a, b) { return personName(a).localeCompare(personName(b)); });
    sel.innerHTML = '<option value="">' + first + '</option>' + ids.map(function (id) { return '<option value="' + id + '">' + esc(personName(id) + (people[id].email ? ' · ' + people[id].email : '')) + '</option>'; }).join('');
  }
  var isTeam = function (p) { return String(p.email || '').slice(-DOM.length) === DOM; };

  var editObra = null;
  function openObra(id) {
    var o = id ? obras.find(function (x) { return x.id === id; }) : null;
    editObra = o;
    if (o && !(can.obra || o.responsible_id === A.id)) { toast('Solo el equipo de obra puede editarla.'); return; }
    if (!o && !can.obra) return;
    peopleOptions($('#oOwner'), function (p) { return !isTeam(p); }, 'Sin cuenta');
    peopleOptions($('#oResp'), isTeam, 'Sin asignar');
    $('#oProject').innerHTML = '<option value="">Ninguno</option>' + projects.map(function (p) { return '<option value="' + p.id + '">' + esc(p.code + ' · ' + p.name) + '</option>'; }).join('');
    $('#dlgObraT').textContent = o ? 'Editar obra ' + o.code : 'Nueva obra';
    var start = iso(TODAY), end = iso(addD(TODAY, 180));
    $('#oName').value = o ? o.name : ''; $('#oClient').value = o ? o.client_name || '' : '';
    $('#oOwner').value = o ? o.owner_id || '' : ''; $('#oProject').value = o ? o.project_id || '' : ''; $('#oResp').value = o ? o.responsible_id || '' : '';
    $('#oCity').value = o ? o.city || '' : ''; $('#oAddr').value = o ? o.address || '' : '';
    $('#oStart').value = o ? o.start_date : start; $('#oEnd').value = o ? o.end_date : end; $('#oStatus').value = o ? o.status : 'planeada';
    $('#oBudget').value = o && o.budget != null ? o.budget : ''; $('#oColor').value = o ? o.color : ['#D4AF37', '#2F4B7C', '#2E7D4F', '#9A5F0E', '#7A4FA3', '#B4382F'][obras.length % 6];
    $('#oNotes').value = o ? o.notes || '' : '';
    $('#oTplRow').hidden = !!o; $('#oDel').hidden = !(o && can.admin); $('#oErr').textContent = '';
    $('#oProject').onchange = function () { var p = projects.find(function (x) { return x.id === $('#oProject').value; }); if (p) { if (!$('#oName').value) $('#oName').value = p.name; if (!$('#oCity').value) $('#oCity').value = p.city || ''; if (!$('#oOwner').value && p.owner_id && people[p.owner_id] && !isTeam(people[p.owner_id])) $('#oOwner').value = p.owner_id; if (!$('#oBudget').value && p.budget_total) $('#oBudget').value = Math.round(p.budget_total); } };
    $('#dlgObra').showModal();
  }
  var TPL = [['Preliminares y trazo', .05], ['Cimentación', .14], ['Estructura', .24], ['Muros y losas', .17], ['Instalaciones', .15], ['Acabados', .2], ['Limpieza y entrega', .05]];
  $('#fObraD').addEventListener('submit', function (e) {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    var rec = {
      name: $('#oName').value.trim(), client_name: $('#oClient').value.trim() || null, owner_id: $('#oOwner').value || null,
      project_id: $('#oProject').value || null, responsible_id: $('#oResp').value || null, city: $('#oCity').value.trim() || null,
      address: $('#oAddr').value.trim() || null, start_date: $('#oStart').value, end_date: $('#oEnd').value, status: $('#oStatus').value,
      budget: $('#oBudget').value === '' ? null : +$('#oBudget').value, color: $('#oColor').value, notes: $('#oNotes').value.trim() || null
    };
    if (!rec.name || !rec.start_date || !rec.end_date) { $('#oErr').textContent = 'Escribe el nombre y las fechas.'; return; }
    if (rec.end_date < rec.start_date) { $('#oErr').textContent = 'La entrega no puede ser antes del inicio.'; return; }
    var b = $('#oSave'); b.disabled = true;
    var q = editObra ? db.from('obras').update(rec).eq('id', editObra.id).select().single() : db.from('obras').insert(rec).select().single();
    q.then(function (r) {
      if (r.error) throw r.error;
      if (!editObra && $('#oTpl').checked) {
        var s = pd(rec.start_date), total = Math.max(7, (pd(rec.end_date) - s) / 864e5 + 1), acc = 0;
        var rows = TPL.map(function (t, i) {
          var a = addD(s, Math.round(acc * total)); acc += t[1];
          var f = i === TPL.length - 1 ? pd(rec.end_date) : addD(s, Math.max(Math.round(acc * total) - 1, Math.round((acc - t[1]) * total)));
          return { obra_id: r.data.id, name: t[0], start_date: iso(a), end_date: iso(f < a ? a : f), sort_order: i };
        });
        return db.from('obra_etapas').insert(rows).then(function (r2) { if (r2.error) throw r2.error; });
      }
    }).then(function () {
      $('#dlgObra').close(); toast(editObra ? 'Obra actualizada.' : 'Obra creada.'); return loadAll();
    }).catch(function (err) { $('#oErr').textContent = err.message || 'No se pudo guardar.'; }).then(function () { b.disabled = false; });
  });
  $('#oDel').addEventListener('click', function () {
    if (!editObra || !confirm('¿Eliminar la obra "' + editObra.name + '" y todas sus etapas?')) return;
    db.from('obras').delete().eq('id', editObra.id).then(function (r) { if (r.error) { $('#oErr').textContent = r.error.message; return; } $('#dlgObra').close(); toast('Obra eliminada.'); loadAll(); });
  });

  var editEt = null, etObra = null;
  function openEtapa(id, obraId) {
    var e = null, o = null;
    if (id) obras.some(function (x) { var f = x.obra_etapas.find(function (y) { return y.id === id; }); if (f) { e = f; o = x; return true; } });
    else o = obras.find(function (x) { return x.id === obraId; });
    if (!o) return;
    editEt = e; etObra = o;
    var editable = can.obra || o.responsible_id === A.id || (e && e.responsible_id === A.id);
    peopleOptions($('#eResp'), isTeam, 'El de la obra');
    $('#dlgEtT').textContent = e ? e.name : 'Nueva etapa';
    $('#eObra').textContent = o.code + ' · ' + o.name + ' (' + fdate(o.start_date) + ' – ' + fdate(o.end_date) + ')';
    $('#eName').value = e ? e.name : ''; $('#eStart').value = e ? e.start_date : o.start_date; $('#eEnd').value = e ? e.end_date : o.end_date;
    $('#eStatus').value = e ? e.status : 'pendiente'; $('#eProg').value = e ? e.progress : 0; $('#eProgV').textContent = $('#eProg').value + ' %';
    $('#eResp').value = e ? e.responsible_id || '' : ''; $('#eNotes').value = e ? e.notes || '' : ''; $('#eErr').textContent = '';
    $$('#fEtapa .input, #eProg').forEach(function (i) { i.disabled = !editable; });
    $('#eSave').hidden = !editable; $('#eDel').hidden = !(e && (can.obra || o.responsible_id === A.id));
    $('#dlgEtapa').showModal();
  }
  $('#eProg').addEventListener('input', function () {
    var v = +this.value; $('#eProgV').textContent = v + ' %';
    if (v === 100) $('#eStatus').value = 'terminada'; else if (v > 0 && $('#eStatus').value !== 'en_proceso') $('#eStatus').value = 'en_proceso';
  });
  $('#eStatus').addEventListener('change', function () { if (this.value === 'terminada') { $('#eProg').value = 100; $('#eProgV').textContent = '100 %'; } });
  $('#fEtapa').addEventListener('submit', function (ev) {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    var rec = { name: $('#eName').value.trim(), start_date: $('#eStart').value, end_date: $('#eEnd').value, status: $('#eStatus').value, progress: +$('#eProg').value, responsible_id: $('#eResp').value || null, notes: $('#eNotes').value.trim() || null };
    if (!rec.name || !rec.start_date || !rec.end_date) { $('#eErr').textContent = 'Escribe el nombre y las fechas.'; return; }
    if (rec.end_date < rec.start_date) { $('#eErr').textContent = 'El fin no puede ser antes del inicio.'; return; }
    if (!editEt) { rec.obra_id = etObra.id; rec.sort_order = etObra.obra_etapas.length; }
    var b = $('#eSave'); b.disabled = true;
    (editEt ? db.from('obra_etapas').update(rec).eq('id', editEt.id) : db.from('obra_etapas').insert(rec)).then(function (r) {
      if (r.error) throw r.error; $('#dlgEtapa').close(); toast('Etapa guardada.'); return loadAll();
    }).catch(function (err) { $('#eErr').textContent = err.message || 'No se pudo guardar.'; }).then(function () { b.disabled = false; });
  });
  $('#eDel').addEventListener('click', function () {
    if (!editEt || !confirm('¿Eliminar la etapa "' + editEt.name + '"?')) return;
    db.from('obra_etapas').delete().eq('id', editEt.id).then(function (r) { if (r.error) { $('#eErr').textContent = r.error.message; return; } $('#dlgEtapa').close(); toast('Etapa eliminada.'); loadAll(); });
  });

  /* ---------- Prospectos ---------- */
  var leads = [];
  function loadLeads() {
    loaded.leads = true;
    Promise.all([
      db.from('leads').select('id,name,phone,email,kind,city,message,status,created_at').order('created_at', { ascending: false }).limit(300),
      db.from('chatbot_leads').select('*').order('created_at', { ascending: false }).limit(300)
    ]).then(function (r) {
      leads = (r[0].data || []).map(function (x) { return { t: 'leads', id: x.id, at: x.created_at, name: x.name, phone: x.phone, email: x.email, int: [x.kind, x.city].filter(Boolean).join(' · '), msg: x.message, src: 'Formulario', st: x.status }; })
        .concat((r[1].data || []).map(function (x) { return { t: 'chatbot_leads', id: x.id, at: x.created_at, name: x.full_name, phone: x.phone, email: x.email, int: [x.project_type, x.city].filter(Boolean).join(' · '), msg: x.notes, src: x.kind === 'asesor' ? 'Chatbot · pide asesor' : 'Chatbot', st: x.status }; }))
        .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
      renderLeads();
    });
  }
  function renderLeads() {
    var f = $('#leadStat').value, list = leads.filter(function (l) { return !f || l.st === f; });
    var opts = function (t, st) { var o = t === 'leads' ? ['nuevo', 'contactado', 'calificado', 'convertido', 'descartado'] : ['nuevo', 'contactado', 'descartado']; return o.map(function (x) { return '<option' + (x === st ? ' selected' : '') + '>' + x + '</option>'; }).join(''); };
    $('#leadRows').innerHTML = list.length ? list.map(function (l) {
      var wa = l.phone ? 'https://wa.me/' + String(l.phone).replace(/\D/g, '').replace(/^(\d{10})$/, '52$1') : '';
      return '<tr><td>' + fdt(l.at) + '</td><td><b>' + esc(l.name) + '</b>' + (l.msg ? '<small>' + esc(String(l.msg).slice(0, 140)) + '</small>' : '') + '</td><td>' + (l.email ? '<a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' : '') + (wa ? '<small><a href="' + wa + '" target="_blank" rel="noopener">WhatsApp ' + esc(l.phone) + '</a></small>' : '') + '</td><td>' + esc(l.int || '—') + '</td><td><span class="tag' + (/asesor/.test(l.src) ? ' off' : '') + '">' + esc(l.src) + '</span></td>' +
        '<td><select class="sel" data-lead="' + l.t + ':' + l.id + '">' + opts(l.t, l.st) + '</select></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty" style="border:0">Sin prospectos con este filtro.</div></td></tr>';
  }
  $('#leadStat').addEventListener('change', renderLeads);
  $('#leadRows').addEventListener('change', function (e) {
    var s = e.target.closest('[data-lead]'); if (!s) return;
    var k = s.dataset.lead.split(':'), t = k[0], id = k[1];
    db.from(t).update({ status: s.value }).eq('id', t === 'leads' ? +id : id).then(function (r) {
      if (r.error) return toast(r.error.message);
      leads.forEach(function (l) { if (l.t === t && String(l.id) === id) l.st = s.value; }); toast('Prospecto actualizado.');
    });
  });

  /* ---------- Usuarios (Dirección) — función gestion-usuarios ---------- */
  var ROLE_HELP = {
    admin: 'Control total: todas las áreas, usuarios, asistentes y prospectos.',
    administracion: 'Ve proyectos, obras y presupuestos de todo el equipo, sin gestionar usuarios.',
    arquitecto: 'Diseña y edita proyectos; crea y actualiza obras y etapas.',
    ingeniero: 'Ingeniería estructural e instalaciones; crea y actualiza obras y etapas.',
    supervisor: 'Supervisor de obra: programa obras, registra avance de cada etapa.',
    ventas: 'Prospectos del sitio y del chatbot; ve proyectos y obras.',
    distribuidor: 'Cuenta externa: portal de distribuidores con su enlace de referido. Puede usar cualquier correo.',
    cliente: 'Cuenta externa: ve y guarda sus propios proyectos y sus obras. Puede usar cualquier correo.'
  };
  var INTERNAL = ['admin', 'administracion', 'arquitecto', 'ingeniero', 'supervisor', 'ventas'];
  function fn(name, body) {
    return db.auth.getSession().then(function (r) {
      var t = r.data.session && r.data.session.access_token;
      if (!t) throw new Error('Tu sesión venció. Vuelve a entrar.');
      return fetch(FN + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (res.status === 404) throw new Error('Falta publicar la función "' + name + '" en Supabase.');
        if (!res.ok) throw new Error(j.error || j.message || 'Error ' + res.status);
        return j;
      });
    });
  }
  var users = [];
  $('#userRole').innerHTML = '<option value="">Todos los roles</option>' + Object.keys(S.roles).map(function (r) { return '<option value="' + r + '">' + S.roles[r] + '</option>'; }).join('');
  $('#uRole').innerHTML = Object.keys(S.roles).map(function (r) { return '<option value="' + r + '">' + S.roles[r] + '</option>'; }).join('');
  function loadUsers() {
    loaded.users = true;
    $('#userRows').innerHTML = '<tr><td colspan="6" class="loading">Cargando…</td></tr>';
    fn('gestion-usuarios', { action: 'list' }).then(function (j) { users = j.users || []; renderUsers(); })
      .catch(function (e) { loaded.users = false; $('#userRows').innerHTML = '<tr><td colspan="6"><div class="empty" style="border:0">' + esc(e.message) + '</div></td></tr>'; });
  }
  function renderUsers() {
    var q = ($('#userQ').value || '').toLowerCase(), fr = $('#userRole').value;
    var list = users.filter(function (u) { return (!q || (u.full_name + ' ' + u.email).toLowerCase().indexOf(q) >= 0) && (!fr || u.role === fr); });
    $('#userRows').innerHTML = list.length ? list.map(function (u) {
      return '<tr><td><b>' + esc(u.full_name || '—') + '</b>' + (u.job_title ? '<small>' + esc(u.job_title) + '</small>' : '') + '</td><td>' + esc(u.email) + (u.phone ? '<small>' + esc(u.phone) + '</small>' : '') + '</td><td><span class="tag' + (u.role === 'admin' ? ' gold' : '') + '">' + esc(S.roles[u.role] || u.role) + '</span></td>' +
        '<td>' + (u.last_sign_in_at ? fdt(u.last_sign_in_at) : (u.confirmed ? 'Nunca' : 'Sin confirmar')) + '</td><td>' + (u.active ? '<span class="chip ok"><span class="dot"></span>Activo</span>' : '<span class="chip bad"><span class="dot"></span>Bloqueado</span>') + '</td>' +
        '<td class="rowacts"><button class="btn btn-ghost btn-sm" data-edit-user="' + u.id + '">Editar</button></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty" style="border:0">Sin usuarios con este filtro.</div></td></tr>';
  }
  $('#userQ').addEventListener('input', renderUsers); $('#userRole').addEventListener('change', renderUsers);

  // Generador (como el botón Generar de EcoSolar): 14 caracteres, uno de cada grupo, sin confusos
  function genPw() {
    var G = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%*-_+?'], all = G.join('');
    var rnd = function (n) { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
    var c = G.map(function (g) { return g[rnd(g.length)]; });
    while (c.length < 14) c.push(all[rnd(all.length)]);
    for (var i = c.length - 1; i > 0; i--) { var j = rnd(i + 1), t = c[i]; c[i] = c[j]; c[j] = t; }
    return c.join('');
  }
  function strong(p) { return p.length >= 8 && p.length <= 50 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p); }
  var editUser = null;
  function syncRoleUi() {
    var r = $('#uRole').value, internal = INTERNAL.indexOf(r) >= 0;
    $('#uRoleHelp').textContent = ROLE_HELP[r] || '';
    if (!editUser) {
      $('#uDom').hidden = !internal;
      $('#uLocal').placeholder = internal ? 'nombre.apellido' : 'correo@dominio.com';
      if (internal && $('#uLocal').value.indexOf('@') > 0) $('#uLocal').value = $('#uLocal').value.split('@')[0];
    }
  }
  $('#uRole').addEventListener('change', syncRoleUi);
  $('#uGen').addEventListener('click', function () { $('#uPw').value = genPw(); });
  $('#uName').addEventListener('input', function () {
    if (editUser || $('#uLocal').dataset.touched || INTERNAL.indexOf($('#uRole').value) < 0) return;
    var w = this.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n').replace(/[^a-z\s]/g, '').trim().split(/\s+/);
    $('#uLocal').value = w[0] ? w[0] + (w[1] ? '.' + w[1] : '') : '';
  });
  $('#uLocal').addEventListener('input', function () { this.dataset.touched = '1'; });
  function openUser(u) {
    editUser = u || null;
    $('#fUser').reset(); delete $('#uLocal').dataset.touched;
    $('#uSecret').hidden = true; $('#uErr').textContent = ''; $('#uSave').hidden = false; $('#uCancel').textContent = 'Cancelar';
    $('#dlgUT').textContent = u ? 'Editar usuario' : 'Crear usuario';
    $('#uSave').textContent = u ? 'Guardar cambios' : 'Crear usuario';
    $('#uPwBox').hidden = !!u; $('#uReset').hidden = !u; $('#uActRow').hidden = !u;
    $('#uLocal').disabled = !!u;
    if (u) {
      $('#uName').value = u.full_name || ''; $('#uRole').value = u.role; $('#uJob').value = u.job_title || ''; $('#uPhone').value = u.phone || '';
      $('#uLocal').value = u.email; $('#uDom').hidden = true; $('#uActive').checked = !!u.active;
    } else { $('#uRole').value = 'arquitecto'; $('#uPw').value = genPw(); $('#uDom').hidden = false; }
    syncRoleUi();
    $('#dlgUser').showModal();
  }
  $('#btnNewUser').addEventListener('click', function () { openUser(null); });
  $('#userRows').addEventListener('click', function (e) { var b = e.target.closest('[data-edit-user]'); if (b) openUser(users.find(function (u) { return u.id === b.dataset.editUser; })); });
  function showSecret(email, pw, extra) {
    $('#uSecret').hidden = false;
    $('#uSecret').innerHTML = 'Comparte estos datos con la persona por un medio privado (se muestran solo esta vez):<br><br>Portal: <b>www.rinovaia.com/acceso.html</b><br>Correo: <b>' + esc(email) + '</b><br>Contraseña: <code>' + esc(pw) + '</code>' + (extra || '');
    $('#uSave').hidden = true; $('#uCancel').textContent = 'Listo';
  }
  $('#fUser').addEventListener('submit', function (e) {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    var role = $('#uRole').value, internal = INTERNAL.indexOf(role) >= 0, name = $('#uName').value.trim(), phone = $('#uPhone').value.replace(/\D/g, '');
    if (name.length < 3) { $('#uErr').textContent = 'Escribe nombre y apellidos.'; return; }
    if (phone && phone.length !== 10) { $('#uErr').textContent = 'El celular debe tener 10 dígitos.'; return; }
    var b = $('#uSave'); b.disabled = true; $('#uErr').textContent = '';
    var p;
    if (editUser) {
      if (editUser.id === A.id && role !== 'admin') { $('#uErr').textContent = 'No puedes quitarte el rol Admin a ti mismo.'; b.disabled = false; return; }
      p = fn('gestion-usuarios', { action: 'update', user_id: editUser.id, full_name: name, phone: phone || null, job_title: $('#uJob').value.trim() || null, role: role })
        .then(function () { if ($('#uActive').checked !== !!editUser.active) return fn('gestion-usuarios', { action: 'active', user_id: editUser.id, active: $('#uActive').checked }); })
        .then(function () { $('#dlgUser').close(); toast('Usuario actualizado.'); loadUsers(); });
    } else {
      var local = $('#uLocal').value.trim().toLowerCase(), email = internal ? local.split('@')[0] + DOM : local, pw = $('#uPw').value;
      if (internal && !/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(local.split('@')[0])) { $('#uErr').textContent = 'El correo solo lleva letras, números y . _ - (sin acentos ni ñ).'; b.disabled = false; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('#uErr').textContent = 'Revisa el correo.'; b.disabled = false; return; }
      if (!strong(pw)) { $('#uErr').textContent = 'La contraseña necesita 8 a 50 caracteres con mayúscula, minúscula, número y símbolo. Usa Generar.'; b.disabled = false; return; }
      p = fn('gestion-usuarios', { action: 'create', email: email, full_name: name, phone: phone || null, job_title: $('#uJob').value.trim() || null, role: role, password: pw }).then(function (j) {
        showSecret(email, pw, internal ? '<br><br>Crea su buzón <b>' + esc(email) + '</b> en Hostinger con la misma contraseña para que use una sola.' + (j.mailbox === 'created' ? '' : '') : '');
        loadUsers();
      });
    }
    p.catch(function (err) { $('#uErr').textContent = err.message; }).then(function () { b.disabled = false; });
  });
  $('#uReset').addEventListener('click', function () {
    if (!editUser || !confirm('¿Generar una contraseña nueva para ' + editUser.email + '?')) return;
    var pw = genPw();
    fn('gestion-usuarios', { action: 'password', user_id: editUser.id, password: pw }).then(function () { showSecret(editUser.email, pw, '<br><br>Si tiene buzón @rinovaia.com, cámbiala también en Hostinger.'); })
      .catch(function (err) { $('#uErr').textContent = err.message; });
  });

  /* ---------- Asistentes ---------- */
  function loadAI() {
    loaded.ai = true;
    db.from('asistente_settings').select('*').then(function (r) {
      (r.data || []).forEach(function (s) { var p = s.id === 'ventas' ? 'kv' : 'ki'; $('#' + p + 'Txt').value = s.knowledge || ''; $('#' + p + 'On').checked = s.enabled; });
      if (r.error) toast(r.error.message);
    });
  }
  $$('[data-save-ai]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.dataset.saveAi, p = id === 'ventas' ? 'kv' : 'ki';
      b.disabled = true;
      db.from('asistente_settings').update({ knowledge: $('#' + p + 'Txt').value.trim(), enabled: $('#' + p + 'On').checked, updated_at: new Date().toISOString(), updated_by: A.id }).eq('id', id).then(function (r) {
        $('#' + p + 'Msg').textContent = r.error ? r.error.message : 'Guardado. El asistente lo usará en menos de un minuto.';
      }).then(function () { b.disabled = false; });
    });
  });

  /* ---------- Mi cuenta ---------- */
  function fillMe() {
    var p = people[A.id] || {};
    $('#meFull').value = p.full_name || A.full_name || ''; $('#mePhone').value = p.phone || ''; $('#meCompany').value = p.company || ''; $('#meEmail').value = A.email || me.user.email;
  }
  $('#fMe').addEventListener('submit', function (e) {
    e.preventDefault();
    var rec = { full_name: $('#meFull').value.trim(), phone: $('#mePhone').value.trim() || null, company: $('#meCompany').value.trim() || null };
    if (rec.full_name.length < 3) { $('#meMsg').textContent = 'Escribe tu nombre completo.'; return; }
    db.from('profiles').update(rec).eq('id', A.id).then(function (r) {
      if (r.error) { $('#meMsg').textContent = r.error.message; return; }
      $('#meMsg').textContent = 'Guardado.'; A.full_name = rec.full_name; $('#meName').textContent = rec.full_name; hello(rec.full_name);
      people[A.id] = Object.assign(people[A.id] || {}, rec);
    });
  });
  $('#fPw').addEventListener('submit', function (e) {
    e.preventDefault();
    var a = $('#pw1').value, b = $('#pw2').value;
    if (a !== b) { $('#pwMsg').textContent = 'No coinciden.'; return; }
    if (a.length < 8 || !/[a-z]/i.test(a) || !/\d/.test(a)) { $('#pwMsg').textContent = 'Mínimo 8 caracteres, con letras y números.'; return; }
    db.auth.updateUser({ password: a }).then(function (r) { $('#pwMsg').textContent = r.error ? r.error.message : 'Contraseña actualizada.'; if (!r.error) this.reset(); }.bind(this));
  });

  window.RinovaPortal = { reload: loadAll, access: function () { return A; } };
})();
