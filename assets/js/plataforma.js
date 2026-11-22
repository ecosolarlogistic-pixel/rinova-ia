/* RINOVAIA — módulos de plataforma (maqueta funcional): Obra, archivos de planos y RINOVAIA AI.
   Usa la API que expone estudio.js (window.RinovaEstudio). Los datos se guardan solo en este navegador;
   en producción viven en Supabase con RLS (tablas de bitácora, incidencias y documentos). */
(function () {
  'use strict';
  var E = window.RinovaEstudio; if (!E) return;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = E.esc;
  var DAY = 864e5;
  var MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function load(key) { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; } }
  function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { } }
  function pkey() { return (E.project().name || 'proyecto').trim().toLowerCase(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmtDate(t) { var d = new Date(t); return d.getDate() + ' ' + MON[d.getMonth()]; }

  /* ================= OBRA ================= */
  var OKEY = 'rinova.obra.v1';
  // Programa tipo: fracción de inicio y fin de cada partida dentro del plazo total
  var SCHED = {
    'Preliminares y cimentación': [0, .14, 100], 'Estructura': [.08, .48, 92], 'Albañilería y muros': [.3, .66, 70],
    'Instalación eléctrica': [.4, .82, 45], 'Instalación hidrosanitaria': [.4, .82, 52], 'Acabados interiores': [.62, 1, 10],
    'Fachada y ornamentación': [.66, .96, 4], 'Honorarios, licencias e IA': [0, 1, 60]
  };
  function seed(fresh) {
    var now = Date.now(), prog = {};
    Object.keys(SCHED).forEach(function (k) { prog[k] = fresh ? 0 : SCHED[k][2]; });
    return {
      start: now - (fresh ? 0 : 14 * 7 * DAY), weeks: 22, prog: prog,
      log: fresh ? [] : [
        { t: now - 1 * DAY, part: 'Instalación eléctrica', pct: 45, note: 'Cableado de alumbrado en N+3.60, ejes 1 a 4.', who: 'Ing. Raúl Pérez' },
        { t: now - 3 * DAY, part: 'Estructura', pct: 92, note: 'Colado de losa de azotea. Se toman cilindros para prueba de resistencia.', who: 'Ing. Raúl Pérez' },
        { t: now - 6 * DAY, part: 'Albañilería y muros', pct: 70, note: 'Muros divisorios de planta alta terminados.', who: 'Arq. Lucía Méndez' }
      ],
      inc: fresh ? [] : [
        { id: 2, t: now - 2 * DAY, desc: 'Fisura superficial en losa N+3.60', part: 'Estructura', sev: 'media', struct: true, open: true },
        { id: 1, t: now - 5 * DAY, desc: 'Retraso en suministro de cable calibre 12', part: 'Instalación eléctrica', sev: 'baja', struct: false, open: true },
        { id: 0, t: now - 12 * DAY, desc: 'Nivel de desplante fuera de tolerancia en zapata Z-3', part: 'Preliminares y cimentación', sev: 'alta', struct: true, open: false }
      ]
    };
  }
  function obraState() {
    var all = load(OKEY), k = pkey();
    return all[k] || seed(/^proyecto nuevo/.test(k));
  }
  function saveObra(st) { var all = load(OKEY); all[pkey()] = st; store(OKEY, all); }

  function obraFigures(st, r) {
    var frac = clamp((Date.now() - st.start) / (st.weeks * 7 * DAY), 0, 1);
    var phys = 0, plan = 0, rows = [];
    r.parts.forEach(function (x) {
      var sc = SCHED[x.name] || [0, 1, 0], done = st.prog[x.name] || 0;
      var planned = clamp((frac - sc[0]) / (sc[1] - sc[0]), 0, 1) * 100;
      phys += done / 100 * x.pct; plan += planned / 100 * x.pct;
      rows.push({ name: x.name, done: done, planned: planned, v: x.v });
    });
    var week = Math.min(st.weeks, Math.floor((Date.now() - st.start) / (7 * DAY)) + 1);
    return { frac: frac, phys: phys, plan: plan, rows: rows, week: week, open: st.inc.filter(function (i) { return i.open; }) };
  }

  function renderObra() {
    var p = E.project(), r = E.result(), st = obraState(), f = obraFigures(st, r);
    $('#obraName').textContent = p.name;
    $('#oPhys').textContent = Math.round(f.phys * 100) + ' %';
    var diff = Math.round((f.phys - f.plan) * 100);
    $('#oPhysS').textContent = 'Programado ' + Math.round(f.plan * 100) + ' % · ' + (diff >= 0 ? '+' : '') + diff + ' pts';
    $('#oPhysS').style.color = diff < -3 ? 'var(--bad)' : '';
    var paid = r.total * f.phys * 0.92;
    $('#oFin').textContent = Math.round(f.phys * 92) + ' %';
    $('#oFinS').textContent = E.money(paid, true) + ' pagado de ' + E.money(r.total, true);
    $('#oTime').textContent = 'Semana ' + f.week;
    $('#oTimeS').textContent = 'de ' + st.weeks + ' · inicio ' + fmtDate(st.start);
    var structOpen = f.open.filter(function (i) { return i.struct; }).length;
    $('#oInc').textContent = f.open.length;
    $('#oIncS').textContent = structOpen ? structOpen + ' estructural' + (structOpen > 1 ? 'es' : '') + ' por revisar' : 'Sin pendientes estructurales';
    $('#oIncS').style.color = structOpen ? 'var(--warn)' : '';

    $('#gantt').innerHTML = f.rows.map(function (x) {
      var col = x.done >= 100 ? 'var(--graphite)' : x.done > 0 ? 'var(--gold)' : 'var(--silver)';
      var txt = x.done >= 100 ? 'Terminado' : x.done > 0 ? 'En proceso' : 'Por iniciar';
      var late = x.done < x.planned - 10;
      return '<div class="gr"><span>' + esc(x.name) + (late ? ' <span class="chip bad" style="padding:0 7px;font-size:10.5px">Atraso</span>' : '') + '</span>' +
        '<div class="tr" title="' + txt + ' · programado ' + Math.round(x.planned) + ' %"><i style="width:' + Math.max(x.done, 1.5) + '%;background:' + col + '"></i><em style="left:calc(' + x.planned + '% - 1px)"></em></div>' +
        '<b>' + Math.round(x.done) + ' %</b></div>';
    }).join('');

    var log = st.log.slice().sort(function (a, b) { return b.t - a.t; }).slice(0, 6);
    $('#logList').innerHTML = log.length ? log.map(function (l) {
      var d = new Date(l.t);
      return '<li><span class="d"><b>' + d.getDate() + '</b>' + MON[d.getMonth()] + '</span><div><small>' + esc(l.part) + ' · ' + l.pct + ' % · ' + esc(l.who) + '</small><p>' + esc(l.note || 'Avance registrado.') + '</p></div></li>';
    }).join('') : '<li class="empty">Aún no hay registros. Usa «Registrar avance» para iniciar la bitácora.</li>';

    var SEV = { baja: ['', 'Baja'], media: ['warn', 'Media'], alta: ['bad', 'Alta'] };
    var inc = st.inc.slice().sort(function (a, b) { return (b.open - a.open) || (b.t - a.t); });
    $('#incList').innerHTML = inc.length ? inc.map(function (i) {
      return '<tr><td><b style="font-weight:600">' + esc(i.desc) + '</b>' + (i.struct ? ' <span class="chip tech">Estructural</span>' : '') + '<br><small class="muted">' + fmtDate(i.t) + '</small></td>' +
        '<td>' + esc(i.part) + '</td><td><span class="chip ' + SEV[i.sev][0] + '"><span class="dot"></span>' + SEV[i.sev][1] + '</span></td>' +
        '<td><span class="chip ' + (i.open ? 'warn' : 'ok') + '">' + (i.open ? 'Abierta' : 'Cerrada') + '</span></td>' +
        '<td class="r"><button class="btn btn-text btn-sm" data-inc="' + i.id + '">' + (i.open ? 'Cerrar' : 'Reabrir') + '</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty">Sin incidencias registradas.</td></tr>';
  }

  function partOptions() {
    return E.result().parts.map(function (x) { return '<option>' + esc(x.name) + '</option>'; }).join('');
  }
  $('#btnAdvance').addEventListener('click', function () {
    var st = obraState(); $('#aPart').innerHTML = partOptions();
    $('#aPct').value = st.prog[$('#aPart').value] || 0; $('#aNote').value = '';
    $('#dlgAdvance').showModal();
  });
  $('#aPart').addEventListener('change', function () { $('#aPct').value = obraState().prog[this.value] || 0; });
  $('#dlgAdvance').addEventListener('close', function () {
    if (this.returnValue !== 'ok') return;
    var st = obraState(), part = $('#aPart').value, pct = clamp(Math.round(+$('#aPct').value || 0), 0, 100);
    st.prog[part] = pct;
    st.log.push({ t: Date.now(), part: part, pct: pct, note: $('#aNote').value.trim().slice(0, 280), who: 'Lucía Méndez' });
    saveObra(st); renderObra(); E.toast('Avance registrado en bitácora: ' + part + ' al ' + pct + ' %');
  });
  $('#btnIssue').addEventListener('click', function () {
    $('#iPart').innerHTML = partOptions(); $('#iDesc').value = ''; $('#iSev').value = 'media'; $('#iStruct').checked = false;
    $('#dlgIssue').showModal();
  });
  $('#dlgIssue').addEventListener('close', function () {
    if (this.returnValue !== 'ok') return;
    var st = obraState(), desc = $('#iDesc').value.trim().slice(0, 140); if (!desc) return;
    var id = st.inc.reduce(function (m, i) { return Math.max(m, i.id); }, -1) + 1;
    st.inc.push({ id: id, t: Date.now(), desc: desc, part: $('#iPart').value, sev: $('#iSev').value, struct: $('#iStruct').checked, open: true });
    saveObra(st); renderObra();
    E.toast($('#iStruct').checked ? 'Incidencia agregada. Se notificó al ingeniero responsable.' : 'Incidencia agregada');
  });
  $('#incList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-inc]'); if (!b) return;
    var st = obraState(), it = st.inc.filter(function (i) { return i.id === +b.dataset.inc; })[0]; if (!it) return;
    it.open = !it.open; saveObra(st); renderObra();
  });
  $('#btnReport').addEventListener('click', function () {
    $('#repDate').textContent = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    window.print();
  });

  /* ================= PLANOS: archivos y versiones ================= */
  var FKEY = 'rinova.planos.v1';
  function filesState() {
    var all = load(FKEY), k = pkey(), now = Date.now();
    return all[k] || [
      { name: 'A-01 Fachada principal.pdf', ver: 2, t: now - 4 * DAY, st: ['ok', 'Aprobado'], size: '2.4 MB' },
      { name: 'A-02 Planta baja.dwg', ver: 3, t: now - 2 * DAY, st: ['warn', 'En revisión'], size: '5.1 MB' },
      { name: 'E-01 Memoria estructural.pdf', ver: 1, t: now - 9 * DAY, st: ['ok', 'Firmado'], size: '1.8 MB' },
      { name: 'IE-01 Instalación eléctrica.dxf', ver: 1, t: now - 6 * DAY, st: ['ok', 'Aprobado'], size: '860 KB' }
    ];
  }
  function renderFiles() {
    $('#fileList').innerHTML = filesState().map(function (f) {
      return '<div class="file"><span class="ic"><svg><use href="#i-doc"/></svg></span><div>' + esc(f.name) + '<small>' + fmtDate(f.t) + ' · ' + esc(f.size) + '</small></div>' +
        '<span class="chip ver">v' + f.ver + '</span><span class="chip ' + f.st[0] + '">' + esc(f.st[1]) + '</span></div>';
    }).join('');
  }
  function size(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  $('#upPlans').addEventListener('change', function () {
    var list = filesState(), n = 0;
    Array.prototype.forEach.call(this.files, function (file) {
      var name = String(file.name).slice(0, 80), prev = list.filter(function (x) { return x.name === name; })[0];
      if (prev) { prev.ver++; prev.t = Date.now(); prev.st = ['warn', 'En revisión']; prev.size = size(file.size); }
      else list.unshift({ name: name, ver: 1, t: Date.now(), st: ['warn', 'En revisión'], size: size(file.size) });
      n++;
    });
    var all = load(FKEY); all[pkey()] = list; store(FKEY, all); renderFiles(); this.value = '';
    if (n) E.toast(n === 1 ? 'Plano registrado como nueva versión en revisión' : n + ' planos registrados en revisión');
  });

  /* ================= RINOVAIA AI (demostración con reglas) ================= */
  var panel = $('#aiPanel'), body = $('#aiBody'), greeted = false;
  function say(html, who) { var d = document.createElement('div'); d.className = 'm ' + who; d.innerHTML = html; body.appendChild(d); body.scrollTop = body.scrollHeight; }
  var REVIEW = '<span class="w">Requiere revisión y firma del ingeniero estructural responsable.</span>';
  var A = {
    resumen: function (p, r) {
      var f = obraFigures(obraState(), r);
      return '<b>' + esc(p.name) + '</b>: ' + (p.use === 'com' ? 'edificio comercial' : 'residencia') + ' de ' + p.floors + ' niveles, estilo ' + E.styleName[p.style] + ' en ' + esc(r.city.name) + '.' +
        '<ul><li>' + E.nf0.format(r.area) + ' m² construidos · ' + E.money(r.unit) + ' por m²</li><li>Presupuesto estimado: ' + E.money(r.total) + '</li>' +
        '<li>Estructura: uso máximo ' + E.pct(r.worst) + ' (' + (E.stateOf(r.worst) === 'bad' ? 'no cumple' : E.stateOf(r.worst) === 'warn' ? 'al límite' : 'cumple') + ')</li>' +
        '<li>Obra: ' + Math.round(f.phys * 100) + ' % de avance físico, semana ' + f.week + '</li></ul>';
    },
    obra: function (p, r) {
      var f = obraFigures(obraState(), r), late = f.rows.filter(function (x) { return x.done < x.planned - 10; });
      var h = 'Avance físico de <b>' + Math.round(f.phys * 100) + ' %</b> contra ' + Math.round(f.plan * 100) + ' % programado a la semana ' + f.week + '.';
      h += late.length ? '<ul>' + late.map(function (x) { return '<li>' + esc(x.name) + ': ' + Math.round(x.done) + ' % (programado ' + Math.round(x.planned) + ' %)</li>'; }).join('') + '</ul>' : ' Todas las partidas van dentro del programa.';
      if (f.open.length) h += '<br>Incidencias abiertas: ' + f.open.map(function (i) { return esc(i.desc); }).join('; ') + '.';
      if (f.open.some(function (i) { return i.struct; })) h += REVIEW;
      return h;
    },
    estructura: function (p, r) {
      var crit = r.elements.filter(function (e) { return e.u > 0.7; });
      var h = 'Revisión preliminar en zona sísmica ' + esc(r.city.zone.toLowerCase()) + '.';
      h += crit.length ? '<ul>' + crit.map(function (e) { return '<li>' + esc(e.name) + ' (' + esc(e.sec) + '): uso ' + E.pct(e.u) + '</li>'; }).join('') + '</ul>' : ' Ningún elemento supera el 70 % de uso.';
      return h + REVIEW;
    },
    presupuesto: function (p, r) {
      var top = r.parts.slice().sort(function (a, b) { return b.v - a.v; }).slice(0, 3);
      var h = 'Total estimado <b>' + E.money(r.total) + '</b> (' + E.money(r.unit) + ' por m²). Partidas principales:<ul>' +
        top.map(function (x) { return '<li>' + esc(x.name) + ': ' + E.money(x.v) + ' (' + Math.round(x.pct * 100) + ' %)</li>'; }).join('') + '</ul>';
      if (p.finish === 'pre') { var alt = E.simulate({ finish: 'med' }); h += 'Con acabados medios el total bajaría a ' + E.money(alt.total) + ' (' + Math.round((1 - alt.total / r.total) * 100) + ' % menos).'; }
      return h + '<span class="w">Estimación paramétrica; el monto final se confirma con la cotización del constructor.</span>';
    },
    riesgos: function (p, r) {
      var items = [], f = obraFigures(obraState(), r);
      if (r.city.c >= 0.3) items.push('Zona sísmica ' + esc(r.city.zone.toLowerCase()) + ': conviene detallar uniones viga-columna.');
      r.elements.filter(function (e) { return e.u > 0.9; }).forEach(function (e) { items.push(esc(e.name) + ' no cumple (' + E.pct(e.u) + ').'); });
      f.rows.filter(function (x) { return x.done < x.planned - 10; }).forEach(function (x) { items.push('Atraso en ' + esc(x.name).toLowerCase() + '.'); });
      f.open.forEach(function (i) { items.push('Incidencia abierta: ' + esc(i.desc) + (i.struct ? ' (estructural)' : '') + '.'); });
      if (r.city.wind >= 1.4) items.push('Región con huracanes: revisar cancelería y anclajes por viento.');
      return items.length ? 'Puntos que requieren atención:<ul>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' + (f.open.some(function (i) { return i.struct; }) ? REVIEW : '') : 'No detecto riesgos relevantes con la información actual.';
    }
  };
  var LABEL = { resumen: 'Resumen del proyecto', obra: '¿Cómo va la obra?', estructura: 'Revisión estructural', presupuesto: 'Ver presupuesto', riesgos: 'Riesgos y pendientes' };
  function intent(q) {
    q = q.toLowerCase();
    if (/presup|costo|precio|cuánto|cuanto|partida|ahorr/.test(q)) return 'presupuesto';
    if (/obra|avance|bit[aá]cora|semana|program|incidenc|retras/.test(q)) return 'obra';
    if (/estruct|viga|column|sism|losa|cimenta|zapata/.test(q)) return 'estructura';
    if (/riesg|pendient|problem|alert/.test(q)) return 'riesgos';
    if (/resum|proyecto|general|estado/.test(q)) return 'resumen';
    return null;
  }
  function ask(q, key) {
    say(esc(q), 'u');
    var k = key || intent(q);
    setTimeout(function () {
      say(k ? A[k](E.project(), E.result()) : 'Puedo ayudarte con el resumen del proyecto, el avance de obra, la revisión estructural, el presupuesto o los riesgos. Prueba con una de las sugerencias.', 'a');
    }, 260);
  }
  function openAI() {
    panel.classList.add('on'); panel.setAttribute('aria-hidden', 'false');
    $('#aiCtx').textContent = E.project().name + ' · RV-0142';
    if (!greeted) { greeted = true; say('Hola, soy RINOVAIA AI. Trabajo con los datos de <b>' + esc(E.project().name) + '</b>. ¿Qué necesitas revisar?', 'a'); }
    setTimeout(function () { $('#aiQ').focus(); }, 300);
  }
  function closeAI() { panel.classList.remove('on'); panel.setAttribute('aria-hidden', 'true'); }
  $$('[data-ai-open]').forEach(function (b) { b.addEventListener('click', openAI); });
  $('#aiClose').addEventListener('click', closeAI);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('on')) closeAI(); });
  $('#aiSug').addEventListener('click', function (e) { var b = e.target.closest('[data-q]'); if (b) ask(LABEL[b.dataset.q], b.dataset.q); });
  $('#aiForm').addEventListener('submit', function (e) { e.preventDefault(); var q = $('#aiQ').value.trim(); if (!q) return; $('#aiQ').value = ''; ask(q.slice(0, 200)); });
  window.RinovaAI = { open: openAI, close: closeAI };

  /* ================= Sincronía ================= */
  document.addEventListener('rinova:change', function () { renderObra(); renderFiles(); });
  renderObra(); renderFiles();
  if (location.hash === '#obra') E.showView('obra');
  if (location.hash === '#proyectos') E.showView('projects');
  if (location.hash === '#ai') openAI();
})();
