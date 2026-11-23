/* RINOVAIA — Asistente interno (skill «skill-chatinterno»): botón flotante + ventana de chat.
   Habla con la función asistente-interno con el token de la sesión: lee datos con los permisos de quien
   pregunta (RLS). Solo aparece al personal interno. La llave de Claude vive en la función. */
(function () {
  'use strict';
  var CFG = {
    fn: 'https://evjoqaphylggvojthezj.supabase.co/functions/v1/asistente-interno',
    key: 'sb_publishable_ll_SpxeCPe8VEFVVX1KpMg_s6DfoWkX',
    db: function () { return window.rinovaDB; },
    mostrar: function () { var a = window.RinovaPortal && window.RinovaPortal.access(); return !!(a && a.interno); },
    vista: function () { var h = document.getElementById('secTitle'); return h ? h.textContent.trim() : document.title; },
    bienvenida: 'Hola, soy el asistente interno de RINOVAIA. Pregúntame cómo usar el portal o consulta datos de proyectos, obras y etapas.',
    sugerencias: ['¿Qué etapas están atrasadas?', '¿Qué obras terminan este mes?', '¿Cuántos prospectos nuevos hay?', '¿Cómo registro el avance de una etapa?'],
    guardarEn: 'rinova.chatInterno'
  };
  var css = '.ci-lz{position:fixed;right:20px;bottom:24px;z-index:951;transition:opacity .2s}.ci-lz[hidden]{display:none!important}.ci-lz.abierto{opacity:0;pointer-events:none}' +
    '.ci-lz,.ci-panel{--vz-ink:#0B0F17;--vz-accent:#D4AF37;--vz-bar:#F7F4EA;--vz-seg:#ECE5CF;--vz-line:#DDE2EA;--vz-muted:#5A6475}' +
    '.ci-lz.vz-lz .vz-lv{animation:none;background:linear-gradient(180deg,#E3C252,#D4AF37);color:#0B0F17;border:1px solid #C9A42F;box-shadow:0 16px 36px -12px rgba(11,15,23,.55)}' +
    '.ci-lz.vz-lz .vz-lv .vz-i{background:#0B0F17;color:#E3C252}.ci-lz.vz-lz .vz-lv small{opacity:.75}' +
    '.ci-lz.vz-lz .vz-lt{border:1px solid #D4AF37;background:#0B0F17;color:#fff}.ci-lz.vz-lz .vz-lt .vz-i{background:#D4AF37;color:#0B0F17}' +
    '.ci-panel .vz-seg button[data-m="voz"][aria-checked="true"],.ci-panel .vz-mic,.ci-panel .vz-act{background:linear-gradient(180deg,#E3C252,#D4AF37);color:#0B0F17;box-shadow:0 4px 12px -4px rgba(201,164,47,.7)}' +
    '.ci-panel .vz-mic{border-radius:10px;width:44px;height:44px}.ci-panel .vz-mic.on{animation:ciMic 1.3s infinite}@keyframes ciMic{0%{box-shadow:0 0 0 0 rgba(212,175,55,.6)}70%{box-shadow:0 0 0 12px rgba(212,175,55,0)}100%{box-shadow:0 0 0 0 rgba(212,175,55,0)}}' +
    '.ci-fab{position:fixed;right:20px;bottom:24px;z-index:951;display:flex;align-items:center;gap:8px;padding:12px 18px;border:1px solid #C9A42F;border-radius:999px;background:linear-gradient(180deg,#E3C252,#D4AF37);color:#0B0F17;font:700 14px Inter,system-ui,sans-serif;box-shadow:0 12px 30px -10px rgba(11,15,23,.55);cursor:pointer}' +
    '.ci-fab svg{width:18px;height:18px}.ci-fab[aria-expanded="true"]{background:#0B0F17;color:#fff;border-color:#D4AF37}.ci-fab[hidden]{display:none}' +
    '.ci-panel{position:fixed;right:20px;bottom:84px;z-index:952;width:min(420px,calc(100vw - 40px));height:min(620px,calc(100vh - 120px));display:flex;flex-direction:column;background:#fff;border:1px solid #DDE2EA;border-radius:18px;box-shadow:0 30px 70px -20px rgba(11,15,23,.5);overflow:hidden;font:14px Inter,system-ui,sans-serif}' +
    '.ci-panel[hidden]{display:none}.ci-head{padding:13px 14px 13px 16px;background:#0B0F17;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:2px solid #D4AF37}' +
    '.ci-head b{display:block;font:600 14px Montserrat,Inter,sans-serif;letter-spacing:.04em}.ci-head small{display:block;font-size:11px;color:#A9B1C1}.ci-head div:last-child{display:flex;gap:6px}' +
    '.ci-head button{border:0;border-radius:8px;padding:7px 10px;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:12px;font-weight:600;cursor:pointer}.ci-head button:hover{background:rgba(255,255,255,.2)}' +
    '.ci-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px;background:#F3F5F7}' +
    '.ci-b{max-width:90%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.ci-b.bot{align-self:flex-start;background:#fff;border:1px solid #DDE2EA;color:#18202B}' +
    '.ci-b.user{align-self:flex-end;background:#182031;color:#fff}.ci-b.err{align-self:center;background:#FBEEEC;color:#B4382F;font-size:12.5px}.ci-b.wait{color:#5A6475;font-style:italic}' +
    '.ci-sug{display:flex;flex-wrap:wrap;gap:6px}.ci-sug button{border:1px solid #DDE2EA;background:#fff;color:#18202B;border-radius:99px;padding:6px 11px;font:inherit;font-size:12.5px;cursor:pointer;text-align:left}.ci-sug button:hover{border-color:#D4AF37}' +
    '.ci-form{display:flex;gap:8px;padding:10px;border-top:1px solid #DDE2EA;background:#fff}.ci-form textarea{flex:1;min-width:0;resize:none;height:44px;max-height:120px;padding:11px 12px;border:1px solid #DDE2EA;border-radius:10px;font:inherit;font-size:16px;line-height:1.3;color:#18202B}' +
    '.ci-form textarea:focus{outline:none;border-color:#D4AF37;box-shadow:0 0 0 3px rgba(212,175,55,.22)}.ci-form button{border:0;border-radius:10px;padding:0 16px;background:#0B0F17;color:#fff;font:inherit;font-weight:600;cursor:pointer}.ci-form button:disabled{opacity:.5}' +
    '.ci-foot{padding:0 12px 9px;background:#fff;font-size:10.5px;color:#5A6475}' +
    'body:has(.pwa-install.show) .ci-fab,body:has(.pwa-install.show) .ci-lz{bottom:76px}body:has(.pwa-install.show) .ci-panel{bottom:138px}' +
    '@media(max-width:640px){.ci-lz{right:14px;bottom:16px}.ci-fab{right:14px;bottom:18px;padding:11px 15px}.ci-panel{left:0;right:0;top:0;bottom:0;width:auto;height:auto;border-radius:0;border:0}}@media print{.ci-lz,.ci-fab,.ci-panel{display:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var wrap = document.createElement('div');
  wrap.innerHTML = '<div class="ci-lz" id="ciLz" role="group" aria-label="Abrir el asistente interno" hidden></div><button type="button" class="ci-fab" id="ciFab" hidden aria-expanded="false" aria-controls="ciPanel" title="Asistente interno"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>Asistente</button>' +
    '<div class="ci-panel" id="ciPanel" role="dialog" aria-label="Asistente interno" hidden><div class="ci-head"><div><b>RINOVAIA · Asistente interno</b><small>Responde con tus permisos · solo consulta</small></div><div><button type="button" id="ciReset">Nueva</button><button type="button" id="ciClose" aria-label="Cerrar asistente">✕</button></div></div>' +
    '<div class="ci-log" id="ciLog" aria-live="polite"></div><form class="ci-form" id="ciForm"><textarea id="ciInput" maxlength="2000" rows="1" placeholder="Escribe tu pregunta…" aria-label="Pregunta para el asistente"></textarea><button type="submit" id="ciSend">Enviar</button></form>' +
    '<div class="ci-foot">Puede equivocarse: confirma cifras importantes en su sección.</div></div>';
  document.body.appendChild(wrap);

  var $ = function (id) { return document.getElementById(id); };
  var hist = [], greet = '', busy = false, ready = false, voz = null;
  try { hist = JSON.parse(sessionStorage.getItem(CFG.guardarEn) || '[]') || []; } catch (e) { hist = []; }
  function save() { try { sessionStorage.setItem(CFG.guardarEn, JSON.stringify(hist.slice(-30))); } catch (e) { } }
  function token() { var db = CFG.db(); if (!db) return Promise.resolve(null); return db.auth.getSession().then(function (r) { return r.data.session ? r.data.session.access_token : null; }); }
  function call(body) {
    return token().then(function (t) {
      if (!t) throw new Error('Inicia sesión en el portal para usar el asistente.');
      return fetch(CFG.fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.key, Authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 404) throw new Error('El asistente aún no está publicado en Supabase.');
        if (!r.ok) throw new Error(j.error || j.message || ('Error ' + r.status));
        return j;
      });
    });
  }
  function bubble(cls, t) { var d = document.createElement('div'); d.className = 'ci-b ' + cls; d.textContent = t; $('ciLog').appendChild(d); $('ciLog').scrollTop = 1e9; return d; }
  function botBubble(t) { var d = bubble('bot', t); if (voz) voz.decorate(d, t); return d; }
  function draw() {
    $('ciLog').innerHTML = ''; botBubble(greet || CFG.bienvenida);
    if (!hist.length) { var s = document.createElement('div'); s.className = 'ci-sug'; CFG.sugerencias.forEach(function (q) { var b = document.createElement('button'); b.type = 'button'; b.textContent = q; s.appendChild(b); }); $('ciLog').appendChild(s); }
    hist.forEach(function (m) { if (m.role === 'user') bubble('user', m.content); else botBubble(m.content); });
  }
  $('ciLog').addEventListener('click', function (e) { var b = e.target.closest('.ci-sug button'); if (b) ask(b.textContent); });
  function ask(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    busy = true; $('ciSend').disabled = true;
    var sg = $('ciLog').querySelector('.ci-sug'); if (sg) sg.remove();
    hist.push({ role: 'user', content: text }); save(); bubble('user', text);
    var w = bubble('bot wait', 'Revisando…');
    var slow = setTimeout(function () { w.textContent = 'Consultando los datos, un momento…'; }, 6000);
    var vista = ''; try { vista = String(CFG.vista() || '').slice(0, 120); } catch (e) { }
    call({ accion: 'chat', mensajes: hist.slice(-20), vista: vista }).then(function (j) {
      var txt = j.respuesta || 'Sin respuesta.';
      w.className = 'ci-b bot'; w.textContent = txt; if (voz) { voz.decorate(w, txt); voz.say(txt); }
      hist.push({ role: 'assistant', content: j.respuesta || '' }); save();
    }).catch(function (err) { w.remove(); hist.pop(); save(); bubble('err', err.message || 'No se pudo conectar con el asistente.'); $('ciInput').value = $('ciInput').value || text; })
      .then(function () { clearTimeout(slow); busy = false; $('ciSend').disabled = false; $('ciLog').scrollTop = 1e9; });
  }
  function launcher() { return voz ? $('ciLz') : $('ciFab'); }
  function open(on, modo) {
    var first;
    $('ciPanel').hidden = !on; $('ciFab').setAttribute('aria-expanded', on ? 'true' : 'false'); $('ciLz').classList.toggle('abierto', !!on);
    if (!on) { if (voz) voz.stop(); return; }
    first = !$('ciLog').children.length;
    if (first) draw();
    if (voz && modo) voz.activar(modo, modo === 'voz' && (!first || !voz.soporte.leer));
    if (voz && modo === 'voz' && first) voz.say(greet || CFG.bienvenida);
    if (!voz || voz.mode() !== 'voz') setTimeout(function () { $('ciInput').focus(); }, 50);
    if (!greet) call({ accion: 'saludo' }).then(function (j) { if (j.saludo && !greet) { greet = j.saludo; var f = $('ciLog').querySelector('.ci-b.bot'); if (f) { f.textContent = greet; if (voz) voz.decorate(f, greet); } } }).catch(function () { });
  }
  if (window.VozChat) {
    voz = VozChat.create({ key: 'rinova-voz-interno', root: $('ciPanel'), after: $('ciPanel').querySelector('.ci-head'), form: $('ciForm'), input: $('ciInput'), sendBtn: $('ciSend'),
      onSend: function (t) { ask(t); }, isOpen: function () { return !$('ciPanel').hidden; }, lang: 'es-MX' });
    VozChat.lanzadores($('ciLz'), { voz: function () { open(true, 'voz'); }, texto: function () { open(true, 'texto'); },
      titulos: { voz: ['Chat de voz', 'Habla y te contesto', 'Voz'], texto: ['Chat de texto', 'Escribe tu pregunta', 'Texto'] } });
  }
  $('ciFab').addEventListener('click', function () { open($('ciPanel').hidden); });
  $('ciClose').addEventListener('click', function () { open(false); });
  $('ciReset').addEventListener('click', function () { if (busy) return; if (voz) voz.stop(); hist = []; save(); draw(); if (!voz || voz.mode() !== 'voz') $('ciInput').focus(); });
  $('ciForm').addEventListener('submit', function (e) { e.preventDefault(); var v = $('ciInput').value; $('ciInput').value = ''; ask(v); });
  $('ciInput').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('ciForm').requestSubmit(); } });
  $('ciInput').addEventListener('input', function () { this.style.height = '44px'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('ciPanel').hidden) open(false); });
  // m: 'voz' | 'texto'; sin modo usa el último que eligió la persona (en voz pide el micrófono dentro del clic).
  window.chatInterno = { open: function (m) { open(true, m || (voz ? voz.mode() : null)); }, ask: function (q) { open(true, 'texto'); ask(q); }, call: call };
  function check() {
    var p = CFG.mostrar() ? token() : Promise.resolve(null);
    p.then(function (t) { var on = !!t; if (on !== ready) { ready = on; launcher().hidden = !on; if (!on) { open(false); hist = []; save(); greet = ''; $('ciLog').innerHTML = ''; } } }).catch(function () { });
  }
  check(); setInterval(check, 2000);
})();
