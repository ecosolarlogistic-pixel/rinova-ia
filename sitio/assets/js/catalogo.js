/* RINOVAIA — Catálogo de obra: conceptos con análisis de precio unitario (APU), insumos y presupuestos por obra.
   Datos en Supabase (tablas cat_* y budgets / budget_items, ver supabase/migrations/20261123180000_catalogo_conceptos.sql).
   Los costos y totales los calcula la base; aquí solo se muestran, se editan cantidades y se exporta a PDF y Excel.
   Sesión: window.RinovaSesion (sesion.js del portal interno). Para pruebas se puede inyectar window.CatalogoAPI. */
(function () {
  'use strict';

  var STAFF = ['admin', 'administracion', 'arquitecto', 'ingeniero', 'supervisor', 'ventas'];
  var EDITORS = ['admin', 'arquitecto', 'ingeniero'];
  var TIPO = { material: 'Material', mano_obra: 'Mano de obra', equipo: 'Equipo' };
  var TIPO_PREF = { material: 'MAT', mano_obra: 'MO', equipo: 'EQ' };
  var ESTADOS = { borrador: 'Borrador', enviado: 'Enviado', aceptado: 'Aceptado', rechazado: 'Rechazado' };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  function money(n) { return MXN.format(+n || 0); }
  function num(n, d) { return (+n || 0).toLocaleString('es-MX', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 3 : d }); }
  function r2(n) { return Math.round((+n || 0) * 100) / 100; }
  function today() { return new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }); }
  function slug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50); }

  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2800); }
  function fail(e) { console.error(e); toast('No se pudo guardar: ' + ((e && (e.message || e.details)) || 'error')); }

  /* ------------------------------------------------------------------ datos (Supabase) */
  function supaAPI(db) {
    function ok(r) { if (r.error) throw r.error; return r.data; }
    function all(q) { // PostgREST entrega máx. 1,000 filas por consulta
      var out = [], page = 1000;
      function next(from) { return q().range(from, from + page - 1).then(ok).then(function (rows) { out = out.concat(rows); return rows.length === page ? next(from + page) : out; }); }
      return next(0);
    }
    return {
      catalogo: function () {
        return Promise.all([
          db.from('cat_partidas').select('*').order('orden').then(ok),
          all(function () { return db.from('cat_insumos').select('*').order('clave'); }),
          all(function () { return db.from('cat_conceptos').select('*').order('clave'); }),
          all(function () { return db.from('cat_concepto_insumos').select('*').order('concepto_id'); }),
          db.from('cat_parametros').select('*').maybeSingle().then(ok)
        ]).then(function (r) { return { partidas: r[0], insumos: r[1], conceptos: r[2], comp: r[3], params: r[4] || {} }; });
      },
      conceptos: function () { return all(function () { return db.from('cat_conceptos').select('*').order('clave'); }); },
      updInsumo: function (id, p) { return db.from('cat_insumos').update(p).eq('id', id).select().single().then(ok); },
      newInsumo: function (p) { return db.from('cat_insumos').insert(p).select().single().then(ok); },
      newConcepto: function (p) { return db.from('cat_conceptos').insert(p).select().single().then(ok); },
      updConcepto: function (id, p) { return db.from('cat_conceptos').update(p).eq('id', id).select().single().then(ok); },
      setComp: function (cid, iid, q) { return db.from('cat_concepto_insumos').upsert({ concepto_id: cid, insumo_id: iid, cantidad: q }).then(ok); },
      delComp: function (cid, iid) { return db.from('cat_concepto_insumos').delete().eq('concepto_id', cid).eq('insumo_id', iid).then(ok); },
      proyectos: function () { return db.from('projects').select('id,code,name,client_name,city').order('created_at', { ascending: false }).then(ok); },
      presupuestos: function (pid) { return db.from('budgets').select('*').eq('project_id', pid).order('created_at', { ascending: false }).then(ok); },
      newPresupuesto: function (p) { return db.from('budgets').insert(p).select().single().then(ok); },
      presupuesto: function (id) {
        return Promise.all([db.from('budgets').select('*').eq('id', id).single().then(ok),
          db.from('budget_items').select('*').eq('budget_id', id).order('sort_order').order('id').then(ok)])
          .then(function (r) { return { bud: r[0], items: r[1] }; });
      },
      updPresupuesto: function (id, p) { return db.from('budgets').update(p).eq('id', id).select().single().then(ok); },
      agregar: function (bid, ids, cant) { return db.rpc('presupuesto_agregar_conceptos', { p_budget_id: bid, p_conceptos: ids, p_cantidad: cant }).then(ok); },
      actualizarPrecios: function (bid) { return db.rpc('presupuesto_actualizar_precios', { p_budget_id: bid }).then(ok); },
      newItem: function (p) { return db.from('budget_items').insert(p).select().single().then(ok); },
      updItem: function (id, p) { return db.from('budget_items').update(p).eq('id', id).select().single().then(ok); },
      delItem: function (id) { return db.from('budget_items').delete().eq('id', id).then(ok); }
    };
  }

  /* ------------------------------------------------------------------ estado */
  var API, S = { partidas: [], insumos: [], conceptos: [], comp: [], params: {}, canEdit: false, access: {}, proyectos: [], proj: null, buds: [], bud: null, items: [], proyecto: null };
  var byId = function (arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; };
  function factor(b) { b = b || S.params; return (1 + (+b.indirectos_pct || 0) / 100) * (1 + (+b.financiamiento_pct || 0) / 100) * (1 + (+b.utilidad_pct || 0) / 100); }
  function puCat(c) { return r2(c.costo_directo * factor()); }
  function partidaDe(c) { return byId(S.partidas, c.partida_id) || { nombre: '—', clave: '', orden: 99 }; }
  function compDe(cid) { return S.comp.filter(function (x) { return x.concepto_id === cid; }).map(function (x) { var i = byId(S.insumos, x.insumo_id) || {}; return { ins: i, cantidad: +x.cantidad, importe: r2(x.cantidad * i.costo) }; }).sort(function (a, b) { return (['material', 'mano_obra', 'equipo'].indexOf(a.ins.tipo) - ['material', 'mano_obra', 'equipo'].indexOf(b.ins.tipo)) || String(a.ins.clave).localeCompare(b.ins.clave); }); }
  function partidaOrden(nombre) { for (var i = 0; i < S.partidas.length; i++) if (S.partidas[i].nombre === nombre) return S.partidas[i].orden; return 999; }

  /* ------------------------------------------------------------------ arranque */
  function start() {
    if (window.CatalogoAPI) return boot(window.CatalogoAPI, window.CatalogoAPI.access || {});
    if (!window.RinovaSesion || !window.rinovaDB) { $('#gate').hidden = false; $('#gate h2').textContent = 'No se pudo iniciar la sesión'; return; }
    window.RinovaSesion.require({ next: 'catalogo.html' }).then(function (r) { boot(supaAPI(window.rinovaDB), (r && r.access) || {}); }).catch(function (e) { console.error(e); $('#gate').hidden = false; });
  }

  function boot(api, access) {
    API = api; S.access = access;
    var roles = access.roles || [];
    var staff = access.is_admin || roles.some(function (r) { return STAFF.indexOf(r) >= 0; });
    S.canEdit = !!access.is_admin || roles.some(function (r) { return EDITORS.indexOf(r) >= 0; });
    $('#who').innerHTML = '<b>' + esc(access.full_name || access.email || '') + '</b>' + esc(roles.join(' · '));
    if (!staff) { $('#gate').hidden = false; return; }
    $('#app').hidden = false;
    if (!S.canEdit) $$('[data-edit]').forEach(function (el) { el.hidden = true; });
    bindUI();
    API.catalogo().then(function (d) {
      S.partidas = d.partidas; S.insumos = d.insumos; S.conceptos = d.conceptos; S.comp = d.comp; S.params = d.params;
      $('#fPartida').innerHTML = '<option value="">Todas las partidas</option>' + S.partidas.map(function (p) { return '<option value="' + p.id + '">' + esc(p.clave + ' · ' + p.nombre) + '</option>'; }).join('');
      if (S.params.vigencia) $('#vig').textContent = 'Conceptos con análisis de precio unitario, reutilizables en cada obra. ' + S.params.vigencia + '. Precios en MXN, sin IVA.';
      renderConceptos(); renderInsumos();
      var t = (location.hash || '').replace('#', '');
      if (t === 'presupuestos' || t === 'insumos') tab(t);
    }).catch(function (e) { console.error(e); toast('No se pudo cargar el catálogo'); });
  }

  function tab(name) {
    $$('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === name)); });
    $$('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    history.replaceState(null, '', '#' + name);
    if (name === 'presupuestos' && !S.proyectosCargados) loadProyectos();
  }

  function bindUI() {
    $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { tab(b.dataset.tab); }); });
    $('#qC').addEventListener('input', renderConceptos);
    $('#fPartida').addEventListener('change', renderConceptos);
    $('#qI').addEventListener('input', renderInsumos);
    $('#fTipo').addEventListener('change', renderInsumos);
    $('#newC').addEventListener('click', formConcepto);
    $('#newI').addEventListener('click', formInsumo);
    $('#xlsCat').addEventListener('click', xlsCatalogo);
    $('#pdfCat').addEventListener('click', function () { pdfOpciones('catalogo'); });
    $('#xlsIns').addEventListener('click', xlsCatalogo);
    $('#fProj').addEventListener('change', function () { S.proj = $('#fProj').value; loadPresupuestos(); });
    $('#newB').addEventListener('click', formPresupuesto);
    $('#bBack').addEventListener('click', function () { $('#budDetail').hidden = true; $('#budList').hidden = false; S.bud = null; loadPresupuestos(); });
    $('#bAdd').addEventListener('click', pickConceptos);
    $('#bRefresh').addEventListener('click', function () {
      API.actualizarPrecios(S.bud.id).then(function (n) { toast(n + ' partidas actualizadas con los precios vigentes'); return openPresupuesto(S.bud.id); }).catch(fail);
    });
    $('#bXls').addEventListener('click', xlsPresupuesto);
    $('#bPdf').addEventListener('click', function () { pdfOpciones('presupuesto'); });
    $('#tC tbody').addEventListener('click', function (e) { var tr = e.target.closest('tr.row'); if (tr) verConcepto(+tr.dataset.id); });
    $('#dClose').addEventListener('click', closeDrawer);
    $('#shade').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
    window.addEventListener('afterprint', function () { $('#doc').innerHTML = ''; });
  }

  /* ------------------------------------------------------------------ catálogo de conceptos */
  function filtrarConceptos() {
    var q = $('#qC').value.trim().toLowerCase(), p = +$('#fPartida').value || 0;
    return S.conceptos.filter(function (c) { return (!p || c.partida_id === p) && (!q || (c.clave + ' ' + c.descripcion).toLowerCase().indexOf(q) >= 0); });
  }
  function agrupar(list, keyFn) {
    var g = [], idx = {};
    list.forEach(function (x) { var k = keyFn(x); if (!(k.id in idx)) { idx[k.id] = g.length; g.push({ key: k, rows: [] }); } g[idx[k.id]].rows.push(x); });
    return g.sort(function (a, b) { return a.key.orden - b.key.orden; });
  }
  function renderConceptos() {
    var list = filtrarConceptos();
    var act = S.conceptos.filter(function (c) { return c.activo; });
    var avg = act.length ? act.reduce(function (a, c) { return a + c.costo_directo; }, 0) : 0;
    $('#kpiCat').innerHTML = [
      ['Conceptos', S.conceptos.length], ['Partidas', S.partidas.length], ['Insumos', S.insumos.length],
      ['Factor de sobrecosto', num(factor(), 4)]
    ].map(function (k) { return '<div class="card kpi"><small>' + esc(k[0]) + '</small><b>' + esc(k[1]) + '</b></div>'; }).join('');
    void avg;
    var h = [];
    agrupar(list, function (c) { var p = partidaDe(c); return { id: p.id, orden: p.orden, nombre: p.clave + ' · ' + p.nombre }; }).forEach(function (g) {
      h.push('<tr class="grp"><td colspan="8">' + esc(g.key.nombre) + ' <span class="muted" style="font-weight:500">(' + g.rows.length + ')</span></td></tr>');
      g.rows.forEach(function (c) {
        h.push('<tr class="row" data-id="' + c.id + '" tabindex="0"><td class="k">' + esc(c.clave) + (c.activo ? '' : ' <span class="chip warn">inactivo</span>') + '</td><td class="desc">' + esc(c.descripcion) + '</td><td>' + esc(c.unidad) +
          '</td><td class="n">' + money(c.costo_material) + '</td><td class="n">' + money(c.costo_mano_obra) + '</td><td class="n">' + money(c.costo_equipo) +
          '</td><td class="n">' + money(c.costo_directo) + '</td><td class="n"><b>' + money(puCat(c)) + '</b></td></tr>');
      });
    });
    $('#tC tbody').innerHTML = h.join('') || '<tr><td colspan="8" class="empty">Sin conceptos con ese filtro.</td></tr>';
    $$('#tC tr.row').forEach(function (tr) { tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') verConcepto(+tr.dataset.id); }); });
    $('#factNote').textContent = 'P.U. = costo directo × (1 + indirectos ' + num(S.params.indirectos_pct, 2) + '%) × (1 + financiamiento ' + num(S.params.financiamiento_pct, 2) + '%) × (1 + utilidad ' + num(S.params.utilidad_pct, 2) + '%). Cada presupuesto puede usar sus propios factores. Toca un concepto para ver su análisis.';
  }

  function openDrawer(eyebrow, title, body, foot) {
    $('#dEyebrow').textContent = eyebrow; $('#dTitle').textContent = title;
    $('#dBody').innerHTML = body; $('#dFoot').innerHTML = foot || '';
    $('#shade').classList.add('on'); $('#drawer').classList.add('on');
    setTimeout(function () { var f = $('#dBody input:not([type=checkbox]),#dBody select,#dBody textarea'); if (f) f.focus(); }, 320);
  }
  function closeDrawer() { $('#shade').classList.remove('on'); $('#drawer').classList.remove('on'); }

  function apuTabla(c, editable) {
    var comp = compDe(c.id), h = ['<div class="tbl-wrap"><table class="t"><thead><tr><th>Clave</th><th>Insumo</th><th>Unidad</th><th class="n">Cantidad</th><th class="n">Costo</th><th class="n">Importe</th>' + (editable ? '<th></th>' : '') + '</tr></thead><tbody>'];
    ['material', 'mano_obra', 'equipo'].forEach(function (t) {
      var rows = comp.filter(function (x) { return x.ins.tipo === t; });
      if (!rows.length) return;
      h.push('<tr class="grp"><td colspan="' + (editable ? 7 : 6) + '">' + esc(t === 'material' ? 'Materiales' : t === 'mano_obra' ? 'Mano de obra' : 'Equipo y herramienta') + '</td></tr>');
      rows.forEach(function (x) {
        h.push('<tr><td class="k">' + esc(x.ins.clave) + '</td><td>' + esc(x.ins.descripcion) + '</td><td>' + esc(x.ins.unidad) + '</td><td class="n">' +
          (editable ? '<input class="cell" type="number" step="any" min="0" data-ci="' + x.ins.id + '" value="' + x.cantidad + '" aria-label="Cantidad de ' + esc(x.ins.clave) + '">' : num(x.cantidad, 5)) +
          '</td><td class="n">' + money(x.ins.costo) + '</td><td class="n">' + money(x.importe) + '</td>' + (editable ? '<td><button class="btn btn-text btn-sm" data-del="' + x.ins.id + '" aria-label="Quitar insumo">Quitar</button></td>' : '') + '</tr>');
      });
    });
    if (!comp.length) h.push('<tr><td colspan="7" class="empty">Este concepto aún no tiene insumos. Agrega materiales, mano de obra y equipo para calcular su precio.</td></tr>');
    h.push('</tbody></table></div>');
    return h.join('');
  }
  function apuTotales(c, b) {
    var cd = +c.costo_directo, f = b || S.params, ind = cd * (+f.indirectos_pct || 0) / 100, fin = (cd + ind) * (+f.financiamiento_pct || 0) / 100, uti = (cd + ind + fin) * (+f.utilidad_pct || 0) / 100;
    return '<div class="apu-tot"><span>Materiales</span><b>' + money(c.costo_material) + '</b><span>Mano de obra</span><b>' + money(c.costo_mano_obra) + '</b><span>Equipo y herramienta</span><b>' + money(c.costo_equipo) +
      '</b><span><b style="text-align:left">Costo directo</b></span><b>' + money(cd) + '</b><span>Indirectos ' + num(f.indirectos_pct, 2) + '%</span><b>' + money(ind) + '</b><span>Financiamiento ' + num(f.financiamiento_pct, 2) + '%</span><b>' + money(fin) +
      '</b><span>Utilidad ' + num(f.utilidad_pct, 2) + '%</span><b>' + money(uti) + '</b><span class="pu">Precio unitario</span><b class="pu">' + money(cd * factor(f)) + '</b></div>';
  }

  function verConcepto(id) {
    var c = byId(S.conceptos, id); if (!c) return;
    var p = partidaDe(c), ed = S.canEdit;
    var body = (ed ? '<div class="grid2" style="margin-bottom:12px"><div class="field"><label for="ecDesc">Descripción</label><textarea class="input" id="ecDesc" rows="3">' + esc(c.descripcion) + '</textarea></div>' +
      '<div class="grid2"><div class="field"><label for="ecUni">Unidad</label><input class="input" id="ecUni" value="' + esc(c.unidad) + '"></div><div class="field"><label for="ecPar">Partida</label><select class="input" id="ecPar">' +
      S.partidas.map(function (x) { return '<option value="' + x.id + '"' + (x.id === c.partida_id ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('') + '</select></div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:14px;grid-column:1/-1"><input type="checkbox" id="ecAct"' + (c.activo ? ' checked' : '') + '> Activo (disponible para presupuestos)</label></div></div>'
      : '<p style="margin-top:0">' + esc(c.descripcion) + '</p><p class="muted" style="font-size:13px">Unidad: <b>' + esc(c.unidad) + '</b> · Partida: <b>' + esc(p.nombre) + '</b></p>') +
      '<div class="sec-h"><h3>Análisis de precio unitario</h3><span class="chip tech">por ' + esc(c.unidad) + '</span></div>' + apuTabla(c, ed) +
      (ed ? '<div class="tools" style="margin-top:12px"><input class="input" id="addInsQ" list="insList" placeholder="Agregar insumo: escribe clave o nombre"><datalist id="insList">' +
        S.insumos.filter(function (i) { return i.activo; }).map(function (i) { return '<option value="' + esc(i.clave + ' · ' + i.descripcion) + '">'; }).join('') +
        '</datalist><input class="input" id="addInsC" type="number" step="any" min="0" placeholder="Cantidad" style="flex:0 1 130px"><button class="btn btn-ink btn-sm" id="addInsB">Agregar</button></div>' : '') +
      apuTotales(c);
    openDrawer(p.clave + ' · ' + p.nombre, c.clave, body, ed ? '<button class="btn btn-gold" id="ecSave">Guardar cambios</button>' : '');
    if (!ed) return;
    function refresh() { return API.conceptos().then(function (cs) { S.conceptos = cs; renderConceptos(); verConcepto(id); }); }
    $$('#dBody [data-ci]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var q = +inp.value; if (!(q > 0)) { toast('La cantidad debe ser mayor que cero'); return; }
        var iid = +inp.dataset.ci;
        API.setComp(id, iid, q).then(function () { S.comp.forEach(function (x) { if (x.concepto_id === id && x.insumo_id === iid) x.cantidad = q; }); return refresh(); }).then(function () { toast('Análisis actualizado'); }).catch(fail);
      });
    });
    $$('#dBody [data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '¿Quitar?'; return; }
        var iid = +b.dataset.del;
        API.delComp(id, iid).then(function () { S.comp = S.comp.filter(function (x) { return !(x.concepto_id === id && x.insumo_id === iid); }); return refresh(); }).catch(fail);
      });
    });
    $('#addInsB').addEventListener('click', function () {
      var k = $('#addInsQ').value.split(' · ')[0].trim().toUpperCase(), q = +$('#addInsC').value;
      var ins = S.insumos.filter(function (i) { return i.clave === k; })[0];
      if (!ins) { toast('Elige un insumo de la lista'); return; }
      if (!(q > 0)) { toast('Escribe la cantidad por ' + c.unidad); return; }
      API.setComp(id, ins.id, q).then(function () {
        S.comp = S.comp.filter(function (x) { return !(x.concepto_id === id && x.insumo_id === ins.id); }).concat([{ concepto_id: id, insumo_id: ins.id, cantidad: q }]);
        return refresh();
      }).then(function () { toast('Insumo agregado'); }).catch(fail);
    });
    $('#ecSave').addEventListener('click', function () {
      var d = $('#ecDesc').value.trim(), u = $('#ecUni').value.trim();
      if (d.length < 5 || !u) { toast('Completa descripción y unidad'); return; }
      API.updConcepto(id, { descripcion: d, unidad: u, partida_id: +$('#ecPar').value, activo: $('#ecAct').checked }).then(function () { return refresh(); }).then(function () { toast('Concepto guardado'); }).catch(fail);
    });
  }

  function siguienteClave(lista, pref) {
    var max = 0; lista.forEach(function (x) { var m = String(x.clave).match(/^([A-Z]+)-(\d{3})$/); if (m && m[1] === pref) max = Math.max(max, +m[2]); });
    return pref + '-' + String(max + 1).padStart(3, '0');
  }
  function prefijoPartida(pid) {
    var c = S.conceptos.filter(function (x) { return x.partida_id === pid; })[0];
    return c ? c.clave.split('-')[0] : 'GEN';
  }
  function formConcepto() {
    var p0 = +$('#fPartida').value || (S.partidas[0] && S.partidas[0].id);
    openDrawer('Catálogo', 'Nuevo concepto',
      '<div class="grid2"><div class="field"><label for="ncPar">Partida</label><select class="input" id="ncPar">' + S.partidas.map(function (x) { return '<option value="' + x.id + '"' + (x.id === p0 ? ' selected' : '') + '>' + esc(x.clave + ' · ' + x.nombre) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="ncClave">Clave</label><input class="input" id="ncClave" value="' + esc(siguienteClave(S.conceptos, prefijoPartida(p0))) + '"></div></div>' +
      '<div class="field" style="margin-top:12px"><label for="ncDesc">Descripción completa (alcance, materiales, acabado)</label><textarea class="input" id="ncDesc" rows="4" placeholder="Ej. Muro de block hueco de concreto 15x20x40 cm, junteado con mortero cemento-arena 1:5…"></textarea></div>' +
      '<div class="field" style="margin-top:12px;max-width:200px"><label for="ncUni">Unidad</label><input class="input" id="ncUni" placeholder="m2, m3, m, kg, pza, sal, lote"></div>' +
      '<p class="muted" style="font-size:13px">Después de crearlo agregas sus insumos y el precio se calcula solo.</p>',
      '<button class="btn btn-gold" id="ncSave">Crear concepto</button>');
    $('#ncPar').addEventListener('change', function () { $('#ncClave').value = siguienteClave(S.conceptos, prefijoPartida(+$('#ncPar').value)); });
    $('#ncSave').addEventListener('click', function () {
      var row = { partida_id: +$('#ncPar').value, clave: $('#ncClave').value.trim().toUpperCase(), descripcion: $('#ncDesc').value.trim(), unidad: $('#ncUni').value.trim() };
      if (!/^[A-Z]{2,4}-\d{3}$/.test(row.clave)) { toast('La clave debe tener la forma ABC-001'); return; }
      if (row.descripcion.length < 5 || !row.unidad) { toast('Completa descripción y unidad'); return; }
      API.newConcepto(row).then(function (c) { S.conceptos.push(c); renderConceptos(); verConcepto(c.id); toast('Concepto creado. Agrega sus insumos.'); }).catch(fail);
    });
  }

  /* ------------------------------------------------------------------ insumos */
  function renderInsumos() {
    var q = $('#qI').value.trim().toLowerCase(), t = $('#fTipo').value, uso = {};
    S.comp.forEach(function (x) { uso[x.insumo_id] = (uso[x.insumo_id] || 0) + 1; });
    var rows = S.insumos.filter(function (i) { return (!t || i.tipo === t) && (!q || (i.clave + ' ' + i.descripcion).toLowerCase().indexOf(q) >= 0); });
    $('#tI tbody').innerHTML = rows.map(function (i) {
      return '<tr><td class="k">' + esc(i.clave) + '</td><td><span class="pill ' + (i.tipo === 'mano_obra' ? 'mo' : i.tipo === 'equipo' ? 'eq' : '') + '">' + esc(TIPO[i.tipo]) + '</span></td><td class="desc">' + esc(i.descripcion) + '</td><td>' + esc(i.unidad) +
        '</td><td class="n">' + (S.canEdit ? '<input class="cell" type="number" step="0.01" min="0" data-ic="' + i.id + '" value="' + i.costo + '" aria-label="Costo de ' + esc(i.clave) + '">' : money(i.costo)) +
        '</td><td class="n">' + (uso[i.id] || 0) + ' conceptos</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">Sin insumos con ese filtro.</td></tr>';
    $$('#tI [data-ic]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var v = r2(inp.value), id = +inp.dataset.ic; if (!(v >= 0)) return;
        API.updInsumo(id, { costo: v }).then(function (row) {
          var i = byId(S.insumos, id); i.costo = row.costo;
          return API.conceptos();
        }).then(function (cs) { S.conceptos = cs; renderConceptos(); toast('Costo actualizado; ' + ((uso[id] || 0)) + ' conceptos recalculados'); }).catch(fail);
      });
    });
  }
  function formInsumo() {
    openDrawer('Insumos', 'Nuevo insumo',
      '<div class="grid2"><div class="field"><label for="niTipo">Tipo</label><select class="input" id="niTipo"><option value="material">Material</option><option value="mano_obra">Mano de obra (cuadrilla por jornada)</option><option value="equipo">Equipo y herramienta</option></select></div>' +
      '<div class="field"><label for="niClave">Clave</label><input class="input" id="niClave" value="' + siguienteClave(S.insumos, 'MAT') + '"></div></div>' +
      '<div class="field" style="margin-top:12px"><label for="niDesc">Descripción</label><input class="input" id="niDesc" placeholder="Ej. Cemento gris CPC 30R, saco 50 kg"></div>' +
      '<div class="grid2" style="margin-top:12px"><div class="field"><label for="niUni">Unidad</label><input class="input" id="niUni" placeholder="saco, m3, kg, jor, hr"></div><div class="field"><label for="niCosto">Costo (MXN, sin IVA)</label><input class="input" id="niCosto" type="number" step="0.01" min="0"></div></div>',
      '<button class="btn btn-gold" id="niSave">Crear insumo</button>');
    $('#niTipo').addEventListener('change', function () { $('#niClave').value = siguienteClave(S.insumos, TIPO_PREF[$('#niTipo').value]); });
    $('#niSave').addEventListener('click', function () {
      var row = { tipo: $('#niTipo').value, clave: $('#niClave').value.trim().toUpperCase(), descripcion: $('#niDesc').value.trim(), unidad: $('#niUni').value.trim(), costo: r2($('#niCosto').value) };
      if (!/^[A-Z]{2,4}-\d{3}$/.test(row.clave) || row.descripcion.length < 2 || !row.unidad || !($('#niCosto').value !== '' && row.costo >= 0)) { toast('Completa todos los campos'); return; }
      API.newInsumo(row).then(function (i) { S.insumos.push(i); S.insumos.sort(function (a, b) { return a.clave.localeCompare(b.clave); }); renderInsumos(); closeDrawer(); toast('Insumo creado'); }).catch(fail);
    });
  }

  /* ------------------------------------------------------------------ presupuestos por obra */
  function loadProyectos() {
    API.proyectos().then(function (ps) {
      S.proyectos = ps; S.proyectosCargados = true;
      if (!ps.length) {
        $('#fProj').innerHTML = '<option>Sin proyectos</option>'; $('#newB').disabled = true;
        $('#bList').innerHTML = '<div class="card empty">Aún no hay proyectos. Crea uno en la <a href="app.html">plataforma</a> y vuelve aquí para armar su presupuesto.</div>';
        return;
      }
      $('#fProj').innerHTML = ps.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.code + ' · ' + p.name + (p.city ? ' (' + p.city + ')' : '')) + '</option>'; }).join('');
      var want = new URLSearchParams(location.search).get('proyecto');
      S.proj = (want && ps.some(function (p) { return p.id === want; })) ? want : ps[0].id;
      $('#fProj').value = S.proj;
      loadPresupuestos();
    }).catch(fail);
  }
  function loadPresupuestos() {
    if (!S.proj) return;
    API.presupuestos(S.proj).then(function (bs) {
      S.buds = bs;
      $('#bList').innerHTML = bs.map(function (b) {
        return '<button class="card" data-b="' + b.id + '"><div><b>' + esc(b.nombre || ('Presupuesto ' + b.id)) + '</b><div class="muted" style="font-size:13px">Folio P-' + b.id + ' · actualizado ' + esc(new Date(b.updated_at).toLocaleDateString('es-MX')) + '</div></div><span class="sp"></span>' +
          '<span class="chip ' + (b.status === 'aceptado' ? 'ok' : b.status === 'rechazado' ? 'bad' : b.status === 'enviado' ? 'tech' : 'gold') + '">' + esc(ESTADOS[b.status] || b.status) + '</span><b class="num">' + money(b.total) + '</b></button>';
      }).join('') || '<div class="card empty">Este proyecto aún no tiene presupuesto. Pulsa «Nuevo presupuesto» y agrega conceptos del catálogo.</div>';
      $$('#bList [data-b]').forEach(function (el) { el.addEventListener('click', function () { openPresupuesto(+el.dataset.b); }); });
    }).catch(fail);
  }
  function formPresupuesto() {
    var p = byId(S.proyectos, S.proj) || {};
    openDrawer('Presupuesto por obra', 'Nuevo presupuesto',
      '<p class="muted" style="margin-top:0">Proyecto: <b>' + esc(p.code + ' · ' + p.name) + '</b></p>' +
      '<div class="field"><label for="nbNom">Nombre del presupuesto</label><input class="input" id="nbNom" value="Presupuesto de obra"></div>' +
      '<div class="grid3" style="margin-top:12px"><div class="field"><label>Indirectos %</label><input class="input" id="nbInd" type="number" step="0.01" value="' + (S.params.indirectos_pct || 12) + '"></div>' +
      '<div class="field"><label>Financiamiento %</label><input class="input" id="nbFin" type="number" step="0.01" value="' + (S.params.financiamiento_pct || 1.5) + '"></div>' +
      '<div class="field"><label>Utilidad %</label><input class="input" id="nbUti" type="number" step="0.01" value="' + (S.params.utilidad_pct || 10) + '"></div></div>',
      '<button class="btn btn-gold" id="nbSave">Crear y agregar conceptos</button>');
    $('#nbSave').addEventListener('click', function () {
      var row = { project_id: S.proj, nombre: $('#nbNom').value.trim() || 'Presupuesto de obra', indirectos_pct: +$('#nbInd').value || 0, financiamiento_pct: +$('#nbFin').value || 0, utilidad_pct: +$('#nbUti').value || 0 };
      API.newPresupuesto(row).then(function (b) { closeDrawer(); return openPresupuesto(b.id).then(pickConceptos); }).catch(fail);
    });
  }

  function openPresupuesto(id) {
    return API.presupuesto(id).then(function (d) {
      S.bud = d.bud; S.items = d.items; S.proyecto = byId(S.proyectos, d.bud.project_id) || {};
      $('#budList').hidden = true; $('#budDetail').hidden = false;
      renderPresupuesto();
    }).catch(fail);
  }
  function gruposPresupuesto() {
    return agrupar(S.items, function (it) { return { id: it.category, orden: partidaOrden(it.category), nombre: it.category }; });
  }
  function renderPresupuesto() {
    var b = S.bud, draft = b.status === 'borrador', p = S.proyecto;
    $$('[data-draft]').forEach(function (el) { el.hidden = !draft; });
    $('#bHead').innerHTML = '<div class="status-row"><div style="flex:1;min-width:220px"><span class="eyebrow">' + esc((p.code || '') + ' · ' + (p.name || '')) + '</span>' +
      '<input class="input" id="bNom" value="' + esc(b.nombre || '') + '" style="font-family:var(--display);font-size:18px;font-weight:600;margin-top:6px"' + (draft ? '' : ' readonly') + ' aria-label="Nombre del presupuesto"></div>' +
      '<div class="field" style="min-width:160px"><label for="bSt">Estado</label><select class="input" id="bSt">' + Object.keys(ESTADOS).map(function (k) { return '<option value="' + k + '"' + (k === b.status ? ' selected' : '') + '>' + ESTADOS[k] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="grid3" style="grid-template-columns:repeat(4,minmax(0,1fr))">' +
      [['bInd', 'Indirectos %', b.indirectos_pct], ['bFin', 'Financiamiento %', b.financiamiento_pct], ['bUti', 'Utilidad %', b.utilidad_pct], ['bIva', 'IVA %', b.tax_rate]].map(function (f) {
        return '<div class="field"><label for="' + f[0] + '">' + f[1] + '</label><input class="input" id="' + f[0] + '" type="number" step="0.01" min="0" max="100" value="' + f[2] + '"' + (draft ? '' : ' readonly') + '></div>';
      }).join('') + '</div>' +
      '<div class="field" style="margin-top:12px"><label for="bNotas">Notas y alcances (salen en el PDF)</label><textarea class="input" id="bNotas" rows="2"' + (draft ? '' : ' readonly') + ' placeholder="Vigencia, condiciones de pago, exclusiones…">' + esc(b.notes || '') + '</textarea></div>' +
      (draft ? '' : '<p class="muted" style="font-size:13px;margin:10px 0 0">Este presupuesto ya no está en borrador; para modificarlo cambia su estado a «Borrador».</p>');
    function save(patch, msg) { return API.updPresupuesto(b.id, patch).then(function () { return openPresupuesto(b.id); }).then(function () { if (msg) toast(msg); }).catch(fail); }
    $('#bSt').addEventListener('change', function () { save({ status: $('#bSt').value }, 'Estado actualizado'); });
    if (draft) {
      $('#bNom').addEventListener('change', function () { save({ nombre: $('#bNom').value.trim() || null }); });
      $('#bNotas').addEventListener('change', function () { save({ notes: $('#bNotas').value.trim() || null }); });
      [['bInd', 'indirectos_pct'], ['bFin', 'financiamiento_pct'], ['bUti', 'utilidad_pct'], ['bIva', 'tax_rate']].forEach(function (f) {
        $('#' + f[0]).addEventListener('change', function () { var o = {}; o[f[1]] = Math.max(0, Math.min(100, +$('#' + f[0]).value || 0)); save(o, 'Precios recalculados'); });
      });
    }
    var h = [], n = 0;
    gruposPresupuesto().forEach(function (g) {
      var sub = 0;
      h.push('<tr class="grp"><td colspan="7">' + esc(g.key.nombre) + '</td></tr>');
      g.rows.forEach(function (it) {
        sub += +it.amount; n++;
        h.push('<tr><td class="k">' + esc(it.clave || '—') + '</td><td class="desc">' + esc(it.description) + '</td><td>' + esc(it.unit) + '</td><td class="n">' +
          (draft ? '<input class="cell" type="number" step="any" min="0" data-q="' + it.id + '" value="' + (+it.quantity) + '" aria-label="Cantidad">' : num(it.quantity)) +
          '</td><td class="n">' + (draft && !it.concepto_id && it.costo_material == null ? '<input class="cell" type="number" step="0.01" min="0" data-pu="' + it.id + '" value="' + (+it.unit_price) + '" aria-label="Precio unitario">' : money(it.unit_price)) +
          '</td><td class="n"><b>' + money(it.amount) + '</b></td><td>' + (draft ? '<button class="btn btn-text btn-sm" data-rm="' + it.id + '">Quitar</button>' : '') + '</td></tr>');
      });
      h.push('<tr class="sub"><td></td><td colspan="4">Subtotal ' + esc(g.key.nombre) + '</td><td class="n">' + money(sub) + '</td><td></td></tr>');
    });
    $('#tB tbody').innerHTML = h.join('') || '<tr><td colspan="7" class="empty">Sin conceptos todavía. Pulsa «Agregar conceptos».</td></tr>';
    var iva = r2(b.total - b.subtotal);
    $('#bTot').innerHTML = '<div><span>Partidas</span><span>' + n + '</span></div><div><span>Subtotal</span><b>' + money(b.subtotal) + '</b></div><div><span>IVA ' + num(b.tax_rate, 2) + '%</span><span>' + money(iva) + '</span></div><div class="big"><span>Total</span><span>' + money(b.total) + '</span></div><div class="letra">' + esc(letras(b.total)) + '</div>';
    $$('#tB [data-q]').forEach(function (inp) {
      inp.addEventListener('change', function () { var v = +inp.value; if (!(v >= 0)) return; API.updItem(+inp.dataset.q, { quantity: v }).then(function () { return openPresupuesto(b.id); }).catch(fail); });
    });
    $$('#tB [data-pu]').forEach(function (inp) {
      inp.addEventListener('change', function () { var v = r2(inp.value); if (!(v >= 0)) return; API.updItem(+inp.dataset.pu, { unit_price: v }).then(function () { return openPresupuesto(b.id); }).catch(fail); });
    });
    $$('#tB [data-rm]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = '¿Quitar?'; return; }
        API.delItem(+btn.dataset.rm).then(function () { return openPresupuesto(b.id); }).catch(fail);
      });
    });
  }

  function pickConceptos() {
    var ya = {}; S.items.forEach(function (it) { if (it.concepto_id) ya[it.concepto_id] = 1; });
    var f = factor(S.bud);
    function lista(q) {
      q = (q || '').toLowerCase();
      var h = [];
      agrupar(S.conceptos.filter(function (c) { return c.activo && (!q || (c.clave + ' ' + c.descripcion).toLowerCase().indexOf(q) >= 0); }), function (c) { var p = partidaDe(c); return { id: p.id, orden: p.orden, nombre: p.clave + ' · ' + p.nombre }; })
        .forEach(function (g) {
          h.push('<div class="g">' + esc(g.key.nombre) + '</div>');
          g.rows.forEach(function (c) {
            h.push('<label><input type="checkbox" value="' + c.id + '"' + (ya[c.id] ? ' disabled checked' : '') + '><span><span class="k">' + esc(c.clave) + '</span> ' + esc(c.descripcion) + ' <span class="muted">(' + esc(c.unidad) + ')</span>' + (ya[c.id] ? ' <span class="chip">ya incluido</span>' : '') + '</span><span class="pu">' + money(r2(c.costo_directo * f)) + '</span></label>');
          });
        });
      return h.join('') || '<div class="empty">Sin resultados.</div>';
    }
    openDrawer('Agregar al presupuesto', 'Conceptos del catálogo',
      '<div class="tools"><input class="input" id="pkQ" type="search" placeholder="Buscar concepto"><input class="input" id="pkCant" type="number" step="any" min="0" value="1" style="flex:0 1 140px" aria-label="Cantidad inicial"></div>' +
      '<p class="muted" style="font-size:12.5px;margin:-4px 0 10px">La cantidad inicial se aplica a todos los conceptos marcados; después ajusta cada una en la tabla. P.U. con los factores de este presupuesto.</p>' +
      '<div class="pick-list" id="pkList">' + lista('') + '</div>' +
      '<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:600">Concepto extraordinario (fuera de catálogo)</summary><div class="grid2" style="margin-top:10px">' +
      '<div class="field"><label for="exPar">Partida</label><select class="input" id="exPar">' + S.partidas.map(function (x) { return '<option>' + esc(x.nombre) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="exUni">Unidad</label><input class="input" id="exUni" placeholder="lote, pza, m2"></div></div>' +
      '<div class="field" style="margin-top:10px"><label for="exDesc">Descripción</label><input class="input" id="exDesc"></div>' +
      '<div class="grid2" style="margin-top:10px"><div class="field"><label for="exCant">Cantidad</label><input class="input" id="exCant" type="number" step="any" min="0" value="1"></div><div class="field"><label for="exPu">Precio unitario (MXN)</label><input class="input" id="exPu" type="number" step="0.01" min="0"></div></div>' +
      '<button class="btn btn-ink btn-sm" id="exAdd" style="margin-top:10px">Agregar extraordinario</button></details>',
      '<span class="muted" id="pkN" style="margin-right:auto;align-self:center">0 seleccionados</span><button class="btn btn-gold" id="pkAdd">Agregar al presupuesto</button>');
    function count() { $('#pkN').textContent = $$('#pkList input:checked:not(:disabled)').length + ' seleccionados'; }
    $('#pkList').addEventListener('change', count);
    $('#pkQ').addEventListener('input', function () { var sel = $$('#pkList input:checked:not(:disabled)').map(function (i) { return i.value; }); $('#pkList').innerHTML = lista($('#pkQ').value); sel.forEach(function (v) { var i = $('#pkList input[value="' + v + '"]'); if (i) i.checked = true; }); count(); });
    $('#pkAdd').addEventListener('click', function () {
      var ids = $$('#pkList input:checked:not(:disabled)').map(function (i) { return +i.value; });
      if (!ids.length) { toast('Marca al menos un concepto'); return; }
      API.agregar(S.bud.id, ids, Math.max(0, +$('#pkCant').value || 0)).then(function (n) { closeDrawer(); toast(n + ' conceptos agregados'); return openPresupuesto(S.bud.id); }).catch(fail);
    });
    $('#exAdd').addEventListener('click', function () {
      var row = { budget_id: S.bud.id, category: $('#exPar').value, description: $('#exDesc').value.trim(), unit: $('#exUni').value.trim(), quantity: +$('#exCant').value || 0, unit_price: r2($('#exPu').value), clave: 'EXT', sort_order: 9000 + S.items.length };
      if (!row.description || !row.unit || !($('#exPu').value !== '')) { toast('Completa descripción, unidad y precio'); return; }
      API.newItem(row).then(function () { closeDrawer(); toast('Extraordinario agregado'); return openPresupuesto(S.bud.id); }).catch(fail);
    });
  }

  /* ------------------------------------------------------------------ explosión de insumos (materiales, mano de obra y equipo de toda la obra) */
  function explosion() {
    var acc = {};
    S.items.forEach(function (it) {
      if (!it.concepto_id) return;
      compDe(it.concepto_id).forEach(function (x) {
        var k = x.ins.id, a = acc[k] || (acc[k] = { ins: x.ins, cantidad: 0 });
        a.cantidad += x.cantidad * it.quantity;
      });
    });
    return Object.keys(acc).map(function (k) { var a = acc[k]; a.importe = r2(a.cantidad * a.ins.costo); return a; })
      .sort(function (a, b) { return (['material', 'mano_obra', 'equipo'].indexOf(a.ins.tipo) - ['material', 'mano_obra', 'equipo'].indexOf(b.ins.tipo)) || a.ins.clave.localeCompare(b.ins.clave); });
  }

  /* ------------------------------------------------------------------ número a letras (para el total) */
  function letras(n) {
    n = r2(n); var ent = Math.floor(n), cent = Math.round((n - ent) * 100);
    var U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
    var D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    var C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
    function cien(x) { if (x === 0) return ''; if (x === 100) return 'CIEN'; var c = Math.floor(x / 100), r = x % 100, s = C[c]; if (r) s += (s ? ' ' : '') + (r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + U[r % 10] : '')); return s; }
    function mil(x) { var m = Math.floor(x / 1000), r = x % 1000; return ((m === 1 ? 'MIL' : m ? cien(m) + ' MIL' : '') + (r ? ' ' + cien(r) : '')).trim(); }
    var mill = Math.floor(ent / 1e6), rest = ent % 1e6, s = '';
    if (mill) s = (mill === 1 ? 'UN MILLÓN' : mil(mill) + ' MILLONES') + (rest === 0 ? ' DE' : '');
    if (rest) s += (s ? ' ' : '') + mil(rest);
    if (!ent) s = 'CERO';
    return '(' + s.trim() + ' PESOS ' + String(cent).padStart(2, '0') + '/100 M.N.)';
  }

  /* ------------------------------------------------------------------ exportar a Excel */
  function factorCells(row) { return '(1+$B$' + row + '/100)*(1+$B$' + (row + 1) + '/100)*(1+$B$' + (row + 2) + '/100)'; }
  function xlsCatalogo() {
    var R = [], merges = ['A1:H1', 'A2:H2'];
    R.push([{ v: 'RINOVAIA · Catálogo de conceptos de obra', s: 'title' }]);
    R.push([{ v: (S.params.vigencia || '') + ' · Precios en MXN sin IVA · Generado el ' + today(), s: 'sub' }]);
    R.push([]);
    R.push([{ v: 'Indirectos %', s: 'bold' }, +S.params.indirectos_pct || 0]);
    R.push([{ v: 'Financiamiento %', s: 'bold' }, +S.params.financiamiento_pct || 0]);
    R.push([{ v: 'Utilidad %', s: 'bold' }, +S.params.utilidad_pct || 0, { v: 'Cambia estos porcentajes y la columna P.U. se recalcula.', s: 'note' }]);
    merges.push('C6:H6');
    R.push([]);
    R.push(['Clave', 'Descripción', 'Unidad', 'Material', 'Mano de obra', 'Equipo', 'Costo directo', 'P.U.'].map(function (v) { return { v: v, s: 'head' }; }));
    var head = R.length;
    agrupar(S.conceptos.filter(function (c) { return c.activo; }), function (c) { var p = partidaDe(c); return { id: p.id, orden: p.orden, nombre: p.clave + ' · ' + p.nombre }; }).forEach(function (g) {
      R.push([{ v: g.key.nombre, s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }]);
      g.rows.forEach(function (c) {
        var r = R.length + 1;
        R.push([c.clave, { v: c.descripcion, s: 'wrap' }, c.unidad, { v: +c.costo_material, s: 'money' }, { v: +c.costo_mano_obra, s: 'money' }, { v: +c.costo_equipo, s: 'money' },
          { f: 'D' + r + '+E' + r + '+F' + r, v: +c.costo_directo, s: 'money' }, { f: 'ROUND(G' + r + '*' + factorCells(4) + ',2)', v: puCat(c), s: 'money' }]);
      });
    });
    var sheets = [{ name: 'Catálogo', cols: [11, 70, 8, 13, 13, 12, 14, 14], freeze: head, merges: merges, rows: R, landscape: true }];
    // Insumos
    var I = [[{ v: 'RINOVAIA · Insumos y precios base', s: 'title' }], [{ v: 'Precios en MXN sin IVA', s: 'sub' }], [], ['Clave', 'Tipo', 'Descripción', 'Unidad', 'Costo'].map(function (v) { return { v: v, s: 'head' }; })];
    S.insumos.forEach(function (i) { I.push([i.clave, TIPO[i.tipo], { v: i.descripcion, s: 'wrap' }, i.unidad, { v: +i.costo, s: 'money' }]); });
    sheets.push({ name: 'Insumos', cols: [11, 14, 70, 9, 14], freeze: 4, rows: I });
    // Análisis de precios unitarios
    var A = [[{ v: 'RINOVAIA · Análisis de precios unitarios', s: 'title' }], [], ['Concepto', 'Insumo', 'Descripción', 'Unidad', 'Cantidad', 'Costo', 'Importe'].map(function (v) { return { v: v, s: 'head' }; })];
    S.conceptos.filter(function (c) { return c.activo; }).forEach(function (c) {
      A.push([{ v: c.clave, s: 'group' }, { v: '', s: 'group' }, { v: c.descripcion + ' (' + c.unidad + ')', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }]);
      var first = A.length + 1;
      compDe(c.id).forEach(function (x) { var r = A.length + 1; A.push([c.clave, x.ins.clave, { v: x.ins.descripcion, s: 'wrap' }, x.ins.unidad, { v: x.cantidad, s: 'num' }, { v: +x.ins.costo, s: 'money' }, { f: 'ROUND(E' + r + '*F' + r + ',2)', v: x.importe, s: 'money' }]); });
      A.push(['', '', { v: 'Costo directo', s: 'numB' }, '', '', '', { f: 'SUM(G' + first + ':G' + A.length + ')', v: +c.costo_directo, s: 'moneyB' }]);
    });
    sheets.push({ name: 'APU', cols: [11, 11, 60, 8, 12, 12, 14], freeze: 3, rows: A });
    XLSXLite.download('rinovaia-catalogo-conceptos.xlsx', sheets, { title: 'Catálogo de conceptos RINOVAIA' });
    toast('Excel descargado');
  }

  function xlsPresupuesto() {
    var b = S.bud, p = S.proyecto, R = [], merges = ['A1:F1', 'A2:F2'];
    R.push([{ v: 'RINOVAIA · ' + (b.nombre || 'Presupuesto de obra'), s: 'title' }]);
    R.push([{ v: 'Folio P-' + b.id + ' · ' + ESTADOS[b.status] + ' · ' + today(), s: 'sub' }]);
    R.push([{ v: 'Proyecto', s: 'bold' }, (p.code || '') + ' · ' + (p.name || '')]);
    R.push([{ v: 'Cliente', s: 'bold' }, p.client_name || '—']);
    R.push([{ v: 'Ubicación', s: 'bold' }, p.city || '—']);
    R.push([]);
    R.push(['Clave', 'Descripción', 'Unidad', 'Cantidad', 'P.U.', 'Importe'].map(function (v) { return { v: v, s: 'head' }; }));
    var head = R.length, subs = [], resumen = [];
    gruposPresupuesto().forEach(function (g) {
      R.push([{ v: g.key.nombre, s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }, { v: '', s: 'group' }]);
      var first = R.length + 1, sum = 0;
      g.rows.forEach(function (it) { var r = R.length + 1; sum += +it.amount; R.push([it.clave || '', { v: it.description, s: 'wrap' }, it.unit, { v: +it.quantity, s: 'num' }, { v: +it.unit_price, s: 'money' }, { f: 'ROUND(D' + r + '*E' + r + ',2)', v: +it.amount, s: 'money' }]); });
      var sr = R.length + 1; subs.push('F' + sr); resumen.push({ nombre: g.key.nombre, ref: 'Presupuesto!F' + sr, v: r2(sum) });
      R.push(['', { v: 'Subtotal ' + g.key.nombre, s: 'numB' }, { v: '', s: 'numB' }, { v: '', s: 'numB' }, { v: '', s: 'numB' }, { f: 'SUM(F' + first + ':F' + (sr - 1) + ')', v: r2(sum), s: 'moneyB' }]);
    });
    R.push([]);
    var st = R.length + 1;
    R.push(['', '', '', '', { v: 'Subtotal', s: 'bold' }, { f: subs.length ? subs.join('+') : '0', v: +b.subtotal, s: 'money' }]);
    R.push(['', '', '', { v: +b.tax_rate, s: 'pct' }, { v: 'IVA', s: 'bold' }, { f: 'ROUND(F' + st + '*D' + (st + 1) + '/100,2)', v: r2(b.total - b.subtotal), s: 'money' }]);
    R.push(['', '', '', '', { v: 'Total', s: 'bold' }, { f: 'F' + st + '+F' + (st + 1), v: +b.total, s: 'total' }]);
    R.push(['', { v: letras(b.total), s: 'note' }]);
    R.push([]);
    R.push(['', { v: 'Factores: indirectos ' + num(b.indirectos_pct, 2) + '%, financiamiento ' + num(b.financiamiento_pct, 2) + '%, utilidad ' + num(b.utilidad_pct, 2) + '%. Precios en MXN.' + (b.notes ? ' ' + b.notes : ''), s: 'note' }]);
    var sheets = [{ name: 'Presupuesto', cols: [10, 64, 8, 12, 14, 16], freeze: head, merges: merges, rows: R }];
    var RS = [[{ v: 'Resumen por partida', s: 'title' }], [], ['Partida', 'Importe', '% del subtotal'].map(function (v) { return { v: v, s: 'head' }; })];
    var rs0 = RS.length + 1;
    resumen.forEach(function (x) { var r = RS.length + 1; RS.push([x.nombre, { f: x.ref, v: x.v, s: 'money' }, { f: 'IF(B$' + (rs0 + resumen.length) + '=0,0,B' + r + '/B$' + (rs0 + resumen.length) + '*100)', v: b.subtotal ? r2(x.v / b.subtotal * 100) : 0, s: 'pct' }]); });
    RS.push([{ v: 'Subtotal', s: 'numB' }, { f: 'SUM(B' + rs0 + ':B' + (RS.length) + ')', v: +b.subtotal, s: 'moneyB' }, '']);
    sheets.push({ name: 'Resumen', cols: [40, 16, 14], rows: RS });
    var E = [[{ v: 'Explosión de insumos', s: 'title' }], [{ v: 'Cantidades totales de material, mano de obra y equipo según el análisis del catálogo vigente (costo directo, sin indirectos ni IVA).', s: 'note' }], [],
      ['Clave', 'Tipo', 'Descripción', 'Unidad', 'Cantidad', 'Costo', 'Importe'].map(function (v) { return { v: v, s: 'head' }; })];
    merges.length; var ex = explosion(), e0 = E.length + 1;
    ex.forEach(function (a) { var r = E.length + 1; E.push([a.ins.clave, TIPO[a.ins.tipo], { v: a.ins.descripcion, s: 'wrap' }, a.ins.unidad, { v: r2(a.cantidad * 1000) / 1000, s: 'num' }, { v: +a.ins.costo, s: 'money' }, { f: 'ROUND(E' + r + '*F' + r + ',2)', v: a.importe, s: 'money' }]); });
    if (ex.length) E.push(['', '', { v: 'Costo directo total', s: 'numB' }, '', '', '', { f: 'SUM(G' + e0 + ':G' + (E.length) + ')', s: 'moneyB' }]);
    sheets.push({ name: 'Explosión de insumos', cols: [10, 13, 60, 8, 13, 12, 15], freeze: 4, merges: ['A2:G2'], rows: E });
    XLSXLite.download('rinovaia-presupuesto-' + slug((p.code || '') + '-' + (b.nombre || b.id)) + '.xlsx', sheets, { title: b.nombre || 'Presupuesto' });
    toast('Excel descargado');
  }

  /* ------------------------------------------------------------------ exportar a PDF (documento de impresión) */
  function pdfOpciones(kind) {
    var cat = kind === 'catalogo';
    openDrawer('Exportar PDF', cat ? 'Catálogo de conceptos' : 'Presupuesto de obra',
      '<p class="muted" style="margin-top:0">Se abre la ventana de impresión: elige «Guardar como PDF». Tamaño carta.</p>' +
      '<label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="opApu"> Incluir análisis de precios unitarios</label>' +
      (cat ? '' : '<label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="opExp" checked> Incluir explosión de insumos</label>' +
        '<label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="opRes" checked> Incluir resumen por partida</label>'),
      '<button class="btn btn-gold" id="opGo">Generar PDF</button>');
    $('#opGo').addEventListener('click', function () {
      var o = { apu: $('#opApu').checked, exp: !cat && $('#opExp').checked, res: !cat && $('#opRes').checked };
      closeDrawer();
      $('#doc').innerHTML = cat ? docCatalogo(o) : docPresupuesto(o);
      var t = document.title; document.title = cat ? 'RINOVAIA - Catalogo de conceptos' : 'RINOVAIA - ' + (S.proyecto.code || '') + ' - ' + (S.bud.nombre || 'Presupuesto');
      setTimeout(function () { window.print(); document.title = t; }, 350);
    });
  }
  function docHead(titulo, sub) {
    return '<div class="pd-head"><img src="assets/img/isotipo.svg" alt=""><div class="bn">RINOVAIA<small>ARQUITECTURA · INGENIERÍA · CONSTRUCCIÓN</small></div><div class="tt"><b>' + esc(titulo) + '</b><span>' + esc(sub) + '</span></div></div>';
  }
  function docApu(c, b) {
    var comp = compDe(c.id), f = b || S.params, cd = +c.costo_directo;
    var ind = cd * f.indirectos_pct / 100, fin = (cd + ind) * f.financiamiento_pct / 100, uti = (cd + ind + fin) * f.utilidad_pct / 100;
    return '<div class="pd-apu"><h4>' + esc(c.clave) + ' · ' + esc(c.descripcion) + ' <span style="font-weight:400">(' + esc(c.unidad) + ')</span></h4><table class="pd"><thead><tr><th>Clave</th><th>Insumo</th><th>Unidad</th><th class="n">Cantidad</th><th class="n">Costo</th><th class="n">Importe</th></tr></thead><tbody>' +
      comp.map(function (x) { return '<tr><td class="k">' + esc(x.ins.clave) + '</td><td>' + esc(x.ins.descripcion) + '</td><td>' + esc(x.ins.unidad) + '</td><td class="n">' + num(x.cantidad, 5) + '</td><td class="n">' + money(x.ins.costo) + '</td><td class="n">' + money(x.importe) + '</td></tr>'; }).join('') +
      '<tr class="s"><td colspan="5">Costo directo (materiales ' + money(c.costo_material) + ' · mano de obra ' + money(c.costo_mano_obra) + ' · equipo ' + money(c.costo_equipo) + ')</td><td class="n">' + money(cd) + '</td></tr>' +
      '<tr><td colspan="5">Indirectos ' + num(f.indirectos_pct, 2) + '% · Financiamiento ' + num(f.financiamiento_pct, 2) + '% · Utilidad ' + num(f.utilidad_pct, 2) + '%</td><td class="n">' + money(ind + fin + uti) + '</td></tr>' +
      '<tr class="g"><td colspan="5">Precio unitario</td><td class="n">' + money(cd * factor(f)) + '</td></tr></tbody></table></div>';
  }
  function docCatalogo(o) {
    var h = [docHead('CATÁLOGO DE CONCEPTOS', today())];
    h.push('<p style="font-size:9.5px;color:#5A6475;margin:0 0 8px">' + esc(S.params.vigencia || '') + '. Precios en MXN, sin IVA. P.U. con indirectos ' + num(S.params.indirectos_pct, 2) + '%, financiamiento ' + num(S.params.financiamiento_pct, 2) + '% y utilidad ' + num(S.params.utilidad_pct, 2) + '%.</p>');
    h.push('<table class="pd"><thead><tr><th>Clave</th><th>Descripción</th><th>Unidad</th><th class="n">Material</th><th class="n">M.O.</th><th class="n">Equipo</th><th class="n">C.D.</th><th class="n">P.U.</th></tr></thead><tbody>');
    var lista = S.conceptos.filter(function (c) { return c.activo; });
    agrupar(lista, function (c) { var p = partidaDe(c); return { id: p.id, orden: p.orden, nombre: p.clave + ' · ' + p.nombre }; }).forEach(function (g) {
      h.push('<tr class="g"><td colspan="8">' + esc(g.key.nombre) + '</td></tr>');
      g.rows.forEach(function (c) { h.push('<tr><td class="k">' + esc(c.clave) + '</td><td>' + esc(c.descripcion) + '</td><td>' + esc(c.unidad) + '</td><td class="n">' + money(c.costo_material) + '</td><td class="n">' + money(c.costo_mano_obra) + '</td><td class="n">' + money(c.costo_equipo) + '</td><td class="n">' + money(c.costo_directo) + '</td><td class="n"><b>' + money(puCat(c)) + '</b></td></tr>'); });
    });
    h.push('</tbody></table>');
    if (o.apu) { h.push('<div class="pd-break"></div>' + docHead('ANÁLISIS DE PRECIOS UNITARIOS', today())); lista.forEach(function (c) { h.push(docApu(c)); }); }
    return h.join('');
  }
  function docPresupuesto(o) {
    var b = S.bud, p = S.proyecto, h = [docHead('PRESUPUESTO DE OBRA', 'Folio P-' + b.id + ' · ' + today())];
    h.push('<dl class="pd-data"><div><dt>Obra</dt><dd>' + esc((p.code || '') + ' · ' + (p.name || '')) + '</dd></div><div><dt>Presupuesto</dt><dd>' + esc(b.nombre || '') + '</dd></div>' +
      '<div><dt>Cliente</dt><dd>' + esc(p.client_name || '—') + '</dd></div><div><dt>Estado</dt><dd>' + esc(ESTADOS[b.status]) + '</dd></div>' +
      '<div><dt>Ubicación</dt><dd>' + esc(p.city || '—') + '</dd></div><div><dt>Moneda</dt><dd>Pesos mexicanos (MXN)</dd></div></dl>');
    h.push('<table class="pd"><thead><tr><th>Clave</th><th>Descripción</th><th>Unidad</th><th class="n">Cantidad</th><th class="n">P.U.</th><th class="n">Importe</th></tr></thead><tbody>');
    var res = [];
    gruposPresupuesto().forEach(function (g) {
      var sub = 0;
      h.push('<tr class="g"><td colspan="6">' + esc(g.key.nombre) + '</td></tr>');
      g.rows.forEach(function (it) { sub += +it.amount; h.push('<tr><td class="k">' + esc(it.clave || '') + '</td><td>' + esc(it.description) + '</td><td>' + esc(it.unit) + '</td><td class="n">' + num(it.quantity) + '</td><td class="n">' + money(it.unit_price) + '</td><td class="n">' + money(it.amount) + '</td></tr>'); });
      h.push('<tr class="s"><td></td><td colspan="4">Subtotal ' + esc(g.key.nombre) + '</td><td class="n">' + money(sub) + '</td></tr>');
      res.push([g.key.nombre, sub]);
    });
    h.push('</tbody></table>');
    var iva = r2(b.total - b.subtotal);
    h.push('<div class="pd-sum"><div>' + (o.res ? '<table><tbody><tr><td><b>Resumen por partida</b></td><td class="n"><b>Importe</b></td><td class="n"><b>%</b></td></tr>' +
      res.map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td class="n">' + money(x[1]) + '</td><td class="n">' + num(b.subtotal ? x[1] / b.subtotal * 100 : 0, 1) + '%</td></tr>'; }).join('') + '</tbody></table>' : '') + '</div>' +
      '<div><table><tbody><tr><td>Subtotal</td><td class="n">' + money(b.subtotal) + '</td></tr><tr><td>IVA ' + num(b.tax_rate, 2) + '%</td><td class="n">' + money(iva) + '</td></tr><tr class="tot"><td>Total</td><td class="n">' + money(b.total) + '</td></tr></tbody></table>' +
      '<div class="pd-letra">' + esc(letras(b.total)) + '</div></div></div>');
    h.push('<div class="pd-notes"><b>Notas.</b> Precios unitarios con indirectos ' + num(b.indirectos_pct, 2) + '%, financiamiento ' + num(b.financiamiento_pct, 2) + '% y utilidad ' + num(b.utilidad_pct, 2) + '%. Cantidades sujetas a verificación en obra; los trabajos no incluidos en este catálogo se cotizan como extraordinarios.' + (b.notes ? ' ' + esc(b.notes) : '') + '</div>');
    h.push('<div class="pd-sign"><div>Elaboró</div><div>Revisó</div><div>Autorizó · Cliente</div></div>');
    if (o.exp) {
      var ex = explosion();
      if (ex.length) {
        h.push('<div class="pd-break"></div>' + docHead('EXPLOSIÓN DE INSUMOS', (p.code || '') + ' · ' + (b.nombre || '')));
        h.push('<p style="font-size:9px;color:#5A6475;margin:0 0 8px">Cantidades totales según el análisis del catálogo vigente. Costo directo, sin indirectos ni IVA.</p><table class="pd"><thead><tr><th>Clave</th><th>Descripción</th><th>Unidad</th><th class="n">Cantidad</th><th class="n">Costo</th><th class="n">Importe</th></tr></thead><tbody>');
        var tot = 0;
        ['material', 'mano_obra', 'equipo'].forEach(function (t) {
          var rows = ex.filter(function (a) { return a.ins.tipo === t; }); if (!rows.length) return;
          var s = 0; h.push('<tr class="g"><td colspan="6">' + esc(t === 'material' ? 'Materiales' : t === 'mano_obra' ? 'Mano de obra' : 'Equipo y herramienta') + '</td></tr>');
          rows.forEach(function (a) { s += a.importe; h.push('<tr><td class="k">' + esc(a.ins.clave) + '</td><td>' + esc(a.ins.descripcion) + '</td><td>' + esc(a.ins.unidad) + '</td><td class="n">' + num(a.cantidad) + '</td><td class="n">' + money(a.ins.costo) + '</td><td class="n">' + money(a.importe) + '</td></tr>'); });
          h.push('<tr class="s"><td colspan="5">Subtotal</td><td class="n">' + money(s) + '</td></tr>'); tot += s;
        });
        h.push('<tr class="g"><td colspan="5">Costo directo total</td><td class="n">' + money(tot) + '</td></tr></tbody></table>');
      }
    }
    if (o.apu) {
      var cs = S.items.filter(function (it) { return it.concepto_id; }).map(function (it) { return byId(S.conceptos, it.concepto_id); }).filter(Boolean);
      if (cs.length) { h.push('<div class="pd-break"></div>' + docHead('ANÁLISIS DE PRECIOS UNITARIOS', (p.code || '') + ' · ' + (b.nombre || ''))); cs.forEach(function (c) { h.push(docApu(c, b)); }); }
    }
    return h.join('');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.RinovaCatalogo = { letras: letras };
})();
