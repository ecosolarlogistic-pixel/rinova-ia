/* RINOVAIA — chatbot de ventas del sitio (skill «chatbot-ventas»).
   Botón flotante y ventana de chat. Habla con la función chatbot-ventas de Supabase, que usa Claude
   y guarda a los interesados en Prospectos. El navegador no guarda ni lee prospectos. */
(function () {
  'use strict';
  var FN = 'https://evjoqaphylggvojthezj.supabase.co/functions/v1/chatbot-ventas';
  var KEY = 'sb_publishable_ll_SpxeCPe8VEFVVX1KpMg_s6DfoWkX';
  var STORE = 'rinova.chatVentas';
  var WELCOME = 'Hola, soy el asistente de RINOVAIA. Te ayudo con tu proyecto de casa, departamentos, local o bodega: diseño, planos, presupuesto y construcción. ¿Qué tienes en mente?';
  var SUG = ['Quiero construir mi casa', '¿Qué incluye el anteproyecto?', '¿Cómo funciona la plataforma?', 'Quiero que me llame un asesor'];

  var css = '.cb-fab{position:fixed;right:20px;bottom:24px;z-index:940;display:flex;align-items:center;gap:10px;padding:13px 20px 13px 16px;border:1px solid #C9A42F;border-radius:999px;background:linear-gradient(180deg,#E3C252,#D4AF37);color:#0B0F17;font:700 14.5px Inter,system-ui,sans-serif;box-shadow:0 16px 36px -12px rgba(11,15,23,.55);cursor:pointer;transition:transform .25s}' +
    '.cb-fab:hover{transform:translateY(-2px)}.cb-fab svg{width:20px;height:20px}.cb-fab[aria-expanded="true"]{background:#0B0F17;color:#fff;border-color:#D4AF37}' +
    '.cb-panel{position:fixed;right:20px;bottom:86px;z-index:941;width:min(400px,calc(100vw - 40px));height:min(600px,calc(100vh - 120px));display:flex;flex-direction:column;background:#fff;border:1px solid #DDE2EA;border-radius:20px;box-shadow:0 30px 80px -20px rgba(11,15,23,.55);overflow:hidden;font:14px Inter,system-ui,sans-serif}' +
    '.cb-panel[hidden]{display:none}.cb-head{display:flex;gap:12px;align-items:center;padding:14px 16px;background:#0B0F17;color:#fff;border-bottom:2px solid #D4AF37}' +
    '.cb-head img{width:34px;height:30px}.cb-head b{display:block;font:600 14px Montserrat,Inter,sans-serif;letter-spacing:.06em}.cb-head small{display:flex;gap:6px;align-items:center;font-size:11.5px;color:#A9B1C1}' +
    '.cb-head small i{width:7px;height:7px;border-radius:50%;background:#3FB56B}.cb-head button{margin-left:auto;border:0;border-radius:8px;width:34px;height:34px;background:rgba(255,255,255,.1);color:#fff;font-size:16px;cursor:pointer}' +
    '.cb-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#F3F5F7}' +
    '.cb-b{max-width:88%;padding:10px 13px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.cb-b.bot{align-self:flex-start;background:#fff;border:1px solid #DDE2EA;color:#18202B;border-bottom-left-radius:5px}' +
    '.cb-b.user{align-self:flex-end;background:#182031;color:#fff;border-bottom-right-radius:5px}.cb-b.err{align-self:center;background:#FBEEEC;color:#B4382F;font-size:12.5px}.cb-b.wait{color:#5A6475;font-style:italic}' +
    '.cb-b.ok{align-self:center;background:#F7EFD3;color:#8A6A12;font-size:12.5px;border:1px solid #E8D89F}' +
    '.cb-sug{display:flex;flex-wrap:wrap;gap:6px}.cb-sug button{border:1px solid #DDE2EA;background:#fff;color:#18202B;border-radius:99px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer}.cb-sug button:hover{border-color:#D4AF37}' +
    '.cb-form{display:flex;gap:8px;padding:10px;border-top:1px solid #DDE2EA;background:#fff}.cb-form textarea{flex:1;min-width:0;resize:none;height:44px;max-height:120px;padding:11px 12px;border:1px solid #DDE2EA;border-radius:12px;font:inherit;font-size:16px;line-height:1.3;color:#18202B}' +
    '.cb-form textarea:focus{outline:none;border-color:#D4AF37;box-shadow:0 0 0 3px rgba(212,175,55,.22)}.cb-form button{border:0;border-radius:12px;padding:0 16px;background:#0B0F17;color:#fff;font:inherit;font-weight:600;cursor:pointer}.cb-form button:disabled{opacity:.5}' +
    '.cb-foot{padding:0 12px 9px;background:#fff;font-size:10.5px;color:#5A6475}' +
    'body:has(.pwa-install.show) .cb-fab{bottom:76px}body:has(.pwa-install.show) .cb-panel{bottom:138px}' +
    '@media(max-width:640px){.cb-fab{right:14px;bottom:16px;padding:12px 16px 12px 13px}.cb-fab span{display:none}.cb-panel{left:0;right:0;top:0;bottom:0;width:auto;height:auto;border-radius:0;border:0}}@media print{.cb-fab,.cb-panel{display:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var w = document.createElement('div');
  w.innerHTML = '<button type="button" class="cb-fab" id="cbFab" aria-expanded="false" aria-controls="cbPanel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg><span>¿Hablamos de tu proyecto?</span></button>' +
    '<div class="cb-panel" id="cbPanel" role="dialog" aria-label="Asistente de RINOVAIA" hidden><div class="cb-head"><img src="assets/img/isotipo.svg" alt=""><div><b>RINOVAIA</b><small><i></i>Asistente en línea</small></div><button type="button" id="cbClose" aria-label="Cerrar chat">✕</button></div>' +
    '<div class="cb-log" id="cbLog" aria-live="polite"></div><form class="cb-form" id="cbForm"><textarea id="cbIn" rows="1" maxlength="2000" placeholder="Escribe tu mensaje…" aria-label="Tu mensaje"></textarea><button type="submit" id="cbSend">Enviar</button></form>' +
    '<div class="cb-foot">Asistente con IA. Tus datos solo se usan para darte seguimiento.</div></div>';
  document.body.appendChild(w);

  var $ = function (id) { return document.getElementById(id); };
  var hist = [], busy = false;
  try { hist = JSON.parse(sessionStorage.getItem(STORE) || '[]') || []; } catch (e) { hist = []; }
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify(hist.slice(-30))); } catch (e) { } }
  function bubble(c, t) { var d = document.createElement('div'); d.className = 'cb-b ' + c; d.textContent = t; $('cbLog').appendChild(d); $('cbLog').scrollTop = 1e9; return d; }
  function draw() {
    $('cbLog').innerHTML = ''; bubble('bot', WELCOME);
    if (!hist.length) { var s = document.createElement('div'); s.className = 'cb-sug'; SUG.forEach(function (q) { var b = document.createElement('button'); b.type = 'button'; b.textContent = q; s.appendChild(b); }); $('cbLog').appendChild(s); }
    hist.forEach(function (m) { bubble(m.role === 'user' ? 'user' : 'bot', m.content); });
  }
  $('cbLog').addEventListener('click', function (e) { var b = e.target.closest('.cb-sug button'); if (b) ask(b.textContent); });
  function ask(t) {
    t = String(t || '').trim(); if (!t || busy) return;
    busy = true; $('cbSend').disabled = true;
    var sg = $('cbLog').querySelector('.cb-sug'); if (sg) sg.remove();
    hist.push({ role: 'user', content: t }); save(); bubble('user', t);
    var wb = bubble('bot wait', 'Escribiendo…');
    fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify({ mensajes: hist.slice(-20), pagina: location.href.slice(0, 300) }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'No pude responder. Escríbenos con el formulario de contacto.'); return j; }); })
      .then(function (j) {
        wb.className = 'cb-b bot'; wb.textContent = j.respuesta || '¿Me cuentas un poco más?';
        hist.push({ role: 'assistant', content: j.respuesta || '' }); save();
        if (j.guardado) bubble('ok', j.asesor ? 'Un asesor de RINOVAIA te contactará muy pronto.' : 'Listo: guardamos tus datos para darte seguimiento.');
      })
      .catch(function (err) { wb.remove(); hist.pop(); save(); bubble('err', err.message); $('cbIn').value = $('cbIn').value || t; })
      .then(function () { busy = false; $('cbSend').disabled = false; });
  }
  function open(on) { $('cbPanel').hidden = !on; $('cbFab').setAttribute('aria-expanded', on); if (on) { if (!$('cbLog').children.length) draw(); setTimeout(function () { $('cbIn').focus(); }, 50); } }
  $('cbFab').addEventListener('click', function () { open($('cbPanel').hidden); });
  $('cbClose').addEventListener('click', function () { open(false); });
  $('cbForm').addEventListener('submit', function (e) { e.preventDefault(); var v = $('cbIn').value; $('cbIn').value = ''; ask(v); });
  $('cbIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('cbForm').requestSubmit(); } });
  $('cbIn').addEventListener('input', function () { this.style.height = '44px'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('cbPanel').hidden) open(false); });
  window.chatVentas = { open: function () { open(true); }, ask: function (q) { open(true); ask(q); } };
})();
