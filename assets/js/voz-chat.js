/* VozChat v2.1 (skill-voz-portal; permiso de micrófono): voz gratis del navegador para cualquier chat.
   Usa la Web Speech API: SpeechRecognition para dictar y speechSynthesis para leer las respuestas.
   Sin servicios de pago ni llaves. Dos formas de usar el chat, con botones grandes con icono:
     "voz"   -> Chat de voz: hablas (o escribes) y el asistente te contesta en voz; manos libres.
     "texto" -> Chat de texto: escribes y lees, sin sonido.
   (Opcional: modos:['voz','texto-voz','texto'] agrega "Texto + voz": escribes y te lee.)
   Uso:
     VozChat.lanzadores(contenedor,{voz:()=>abrir('voz'), texto:()=>abrir('texto')}) // botones para abrir
     const voz = VozChat.create({ key, root, after, form, input, sendBtn, onSend, isOpen, lang });
     voz.activar('voz'|'texto', escucharYa) // al abrir desde un botón (dentro del clic)
     voz.say(texto)        // cuando llega una respuesta del bot (solo habla en modo voz)
     voz.decorate(el, txt) // bocina "Escuchar" en una burbuja del bot (oculta en modo texto)
     voz.stop()            // al cerrar el chat o empezar conversación nueva                    */
(function(){
  if(window.VozChat)return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition||null;
  const TTS=('speechSynthesis' in window)&&('SpeechSynthesisUtterance' in window);
  const ICO={
    mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/></svg>',
    chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"/><path d="M8 10.5h8M8 13.5h5"/></svg>',
    stop:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    spk:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>'
  };
  const MODOS={voz:['Voz',ICO.mic,'Chat de voz: hablas y el asistente te contesta en voz'],'texto-voz':['Texto + voz',ICO.spk,'Escribes y el asistente te lee sus respuestas'],texto:['Texto',ICO.chat,'Chat de texto: escribes y lees, sin sonido']};
  const CSS=`
.vz-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;background:var(--vz-bar,#f3f7f0);border-bottom:1px solid var(--vz-line,var(--line,#e2e8df));font-family:inherit}
.vz-seg{display:inline-flex;gap:3px;padding:3px;border-radius:999px;background:var(--vz-seg,#e3ebdd)}
.vz-seg button{display:inline-flex;align-items:center;gap:6px;border:0;margin:0;background:transparent;color:var(--vz-ink,var(--ink,#0b3b2e));padding:6px 12px 6px 8px;border-radius:999px;font-family:inherit;font-size:12.5px;font-weight:800;line-height:1.1;cursor:pointer;white-space:nowrap;box-shadow:none}
.vz-seg button svg{width:16px;height:16px;flex:none}
.vz-seg button:hover{background:#0000000d}
.vz-seg button[aria-checked="true"]{background:var(--vz-ink,var(--ink,#0b3b2e));color:#fff;box-shadow:0 2px 8px #0b3b2e40}
.vz-seg button[data-m="voz"][aria-checked="true"]{background:linear-gradient(135deg,#d93b30,#f0663c);box-shadow:0 3px 10px #d93b3055}
.vz-seg button[aria-disabled="true"]{opacity:.42;cursor:not-allowed}
.vz-seg button:focus-visible,.vz-mic:focus-visible,.vz-stop:focus-visible,.vz-play:focus-visible,.vz-lz button:focus-visible{outline:3px solid var(--vz-accent,var(--lime,#8cc63f));outline-offset:2px}
.vz-st{flex:1 1 90px;min-width:0;font-size:11.5px;line-height:1.3;color:var(--vz-muted,var(--muted,#5d6f66))}
.vz-st.err{color:#a1261b;font-weight:700}
.vz-stop{display:inline-flex;align-items:center;gap:5px;margin:0;border:1px solid var(--vz-line,var(--line,#dfe6dc));border-radius:999px;padding:5px 10px;background:#fff;color:var(--vz-ink,var(--ink,#0b3b2e));font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer}
.vz-stop svg{width:11px;height:11px}
.vz-act{display:inline-flex;align-items:center;gap:6px;margin:0;border:0;border-radius:999px;padding:7px 13px 7px 9px;background:linear-gradient(135deg,#d93b30,#f0663c);color:#fff;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer;animation:vzPulso 1.6s infinite}
.vz-act svg{width:15px;height:15px}
.vz-act[hidden],.vz-stop[hidden],.vz-mic[hidden],.vz-lz [hidden]{display:none}
.vz-mic{flex:none;width:var(--vz-mic,46px);height:var(--vz-mic,46px);margin:0;padding:0;border:0;border-radius:var(--vz-mic-r,14px);background:linear-gradient(135deg,#d93b30,#f0663c);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 6px 16px -6px #d93b30aa}
.vz-mic svg{width:22px;height:22px}
.vz-mic:hover{filter:brightness(1.06)}
.vz-mic.on{animation:vzPulso 1.3s infinite}
@keyframes vzPulso{0%{box-shadow:0 0 0 0 #d93b3077}70%{box-shadow:0 0 0 12px #d93b3000}100%{box-shadow:0 0 0 0 #d93b3000}}
.vz-play{display:inline-grid;place-items:center;width:24px;height:24px;margin:0 0 0 6px;padding:0;vertical-align:-6px;border:1px solid var(--vz-line,var(--line,#dfe6dc));border-radius:50%;background:#fff;color:var(--vz-ink,var(--ink,#0b3b2e));cursor:pointer;opacity:.7}
.vz-play:hover{opacity:1;border-color:var(--vz-accent,var(--lime,#8cc63f))}
.vz-play svg{width:13px;height:13px}
[data-vz-modo="texto"] .vz-play{display:none}
/* Botones para abrir el chat: Chat de voz y Chat de texto */
.vz-lz{display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:inherit}
.vz-lz.fila{flex-direction:row;align-items:center}
.vz-lz[hidden]{display:none}
.vz-lz button{position:relative;display:inline-flex;align-items:center;gap:10px;margin:0;height:54px;padding:0 18px 0 7px;border-radius:999px;font-family:inherit;text-align:left;cursor:pointer;transition:transform .25s,box-shadow .25s,filter .2s}
.vz-lz button:hover{transform:translateY(-3px)}
.vz-lz .vz-i{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;flex:none}
.vz-lz .vz-i svg{width:22px;height:22px}
.vz-lz b{display:block;font-size:14.5px;font-weight:800;line-height:1.1}
.vz-lz small{display:block;font-size:11px;font-weight:600;line-height:1.2;opacity:.85;margin-top:2px}
.vz-lz .vz-lv{border:0;background:linear-gradient(135deg,#d93b30,#f0663c);color:#fff;box-shadow:0 14px 30px -10px #d93b30b0}
.vz-lz .vz-lv .vz-i{background:#fff;color:#d93b30;animation:vzPulsoB 2.2s infinite}
@keyframes vzPulsoB{0%{box-shadow:0 0 0 0 #ffffffb0}70%{box-shadow:0 0 0 9px #ffffff00}100%{box-shadow:0 0 0 0 #ffffff00}}
.vz-lz .vz-lt{border:2px solid var(--vz-accent,var(--lime,#8cc63f));background:var(--vz-ink,var(--ink,#0b3b2e));color:#fff;box-shadow:0 14px 30px -10px #0b3b2eaa}
.vz-lz .vz-lt .vz-i{background:var(--vz-accent,var(--lime,#8cc63f));color:var(--vz-ink,var(--ink,#0b3b2e))}
.vz-lz.compacto button{height:46px;padding:0 15px 0 5px;gap:8px}
.vz-lz.compacto .vz-i{width:36px;height:36px}.vz-lz.compacto .vz-i svg{width:19px;height:19px}
.vz-lz.compacto small{display:none}
.vz-lz .vz-c{display:none}
@media (max-width:760px){
  .vz-lz button{height:50px;padding:0 16px 0 6px;gap:8px}
  .vz-lz .vz-i{width:38px;height:38px}
  .vz-lz small{display:none}.vz-lz b{font-size:15px}
  .vz-lz.corto .vz-l{display:none}.vz-lz.corto .vz-c{display:inline}
  .vz-lz .vz-lv{animation:vzPulso 2.4s infinite}
}
@media (max-width:380px){.vz-seg button{padding:6px 10px 6px 7px;font-size:12px}}
@media (prefers-reduced-motion:reduce){.vz-mic.on,.vz-lz .vz-i,.vz-lz button{animation:none!important;transition:none}}`;
  let cssPuesto=false;
  function ponerCss(){if(cssPuesto)return;cssPuesto=true;const s=document.createElement('style');s.id='vozchat-css';s.textContent=CSS;document.head.appendChild(s)}

  // Voz en español: primero la del país (es-MX), luego es-US y luego cualquier español.
  // Entre ellas prefiere las de mejor calidad (Google, Microsoft Online/Natural, Siri mejorada).
  function elegirVoz(lang){
    if(!TTS)return null;const vs=speechSynthesis.getVoices()||[];const n=v=>String(v.lang||'').replace('_','-').toLowerCase();
    const base=lang.split('-')[0].toLowerCase(),buena=v=>/google|natural|neural|online|premium|enhanced|mejorad|paulina|sabina|dalia|jorge|m[oó]nica/i.test(v.name);
    const grupos=[vs.filter(v=>n(v)===lang.toLowerCase()),vs.filter(v=>n(v)===base+'-us'),vs.filter(v=>n(v)===base||n(v).startsWith(base+'-'))];
    for(const g of grupos)if(g.length)return g.find(buena)||g.find(v=>v.localService===false)||g[0];
    return null;
  }
  if(TTS){try{speechSynthesis.getVoices();speechSynthesis.addEventListener&&speechSynthesis.addEventListener('voiceschanged',()=>{})}catch(_){}}

  // Texto apto para leer: sin enlaces, marcas de formato ni emojis.
  function limpiar(t){
    return String(t||'').replace(/https?:\/\/\S+/g,' (enlace en el chat) ').replace(/[*_#`>~|]+/g,' ')
      .replace(/^\s*[-•·]\s+/gm,'').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu,'')
      .replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();
  }
  // Trozos cortos: Chrome corta las frases que duran más de ~15 s.
  function trozos(t,max){
    max=max||190;const out=[];let cur='';
    t.replace(/([.!?…;:])\s+/g,'$1\n').split(/\n+/).forEach(p=>{
      p=p.trim();if(!p)return;
      while(p.length>max){let c=p.lastIndexOf(', ',max);if(c<60)c=p.lastIndexOf(' ',max);if(c<60)c=max;if(cur){out.push(cur);cur=''}out.push(p.slice(0,c+1).trim());p=p.slice(c+1).trim()}
      if(cur&&(cur+' '+p).length>max){out.push(cur);cur=p}else cur=cur?cur+' '+p:p;
    });
    if(cur)out.push(cur);return out;
  }

  // Dos botones grandes para abrir el chat. op: {voz, texto, fila, compacto, titulos:{voz:[b,small],texto:[b,small]}}
  function lanzadores(cont,op){
    ponerCss();op=op||{};const t=Object.assign({voz:['Chat de voz','Habla y te contesto'],texto:['Chat de texto','Escribe tu mensaje']},op.titulos||{});
    cont.classList.add('vz-lz');if(op.fila)cont.classList.add('fila');if(op.compacto)cont.classList.add('compacto');if(op.corto)cont.classList.add('corto');
    const hayVoz=!!(SR||TTS);
    cont.innerHTML=(hayVoz?`<button type="button" class="vz-lv" data-lz="voz" aria-label="${t.voz[0]}: ${t.voz[1]}" title="${t.voz[1]}"><span class="vz-i">${ICO.mic}</span><span><b><span class="vz-l">${t.voz[0]}</span><span class="vz-c">${t.voz[2]||'Voz'}</span></b><small>${t.voz[1]}</small></span></button>`:'')+
      `<button type="button" class="vz-lt" data-lz="texto" aria-label="${t.texto[0]}: ${t.texto[1]}" title="${t.texto[1]}"><span class="vz-i">${ICO.chat}</span><span><b><span class="vz-l">${t.texto[0]}</span><span class="vz-c">${t.texto[2]||'Texto'}</span></b><small>${t.texto[1]}</small></span></button>`;
    cont.addEventListener('click',e=>{const b=e.target.closest('button[data-lz]');if(!b)return;const f=op[b.dataset.lz];if(f)f(b)});
    return cont;
  }

  function create(o){
    ponerCss();
    const lang=o.lang||'es-MX',KEY=o.key||'vozchat-modo',raiz=o.root||document.body;
    const lista=(o.modos||['voz','texto']).filter(m=>MODOS[m]);
    const st={escucha:false,habla:false,ciclo:false};
    let rec=null,voz=null,turno=0,vigia=0,avisoT=0,desbloqueado=false;
    const puede=m=>m==='texto'||(m==='texto-voz'&&TTS)||(m==='voz'&&!!(SR||TTS));
    const lee=()=>modo!=='texto'&&TTS;
    let modo='texto';try{modo=localStorage.getItem(KEY)||o.defecto||'texto'}catch(_){}
    if(!lista.includes(modo)||!puede(modo))modo='texto';

    const bar=document.createElement('div');bar.className='vz-bar';
    bar.innerHTML='<div class="vz-seg" role="radiogroup" aria-label="Cómo quieres usar el chat">'+lista.map(m=>`<button type="button" role="radio" data-m="${m}" title="${MODOS[m][2]}">${MODOS[m][1]}${MODOS[m][0]}</button>`).join('')+'</div><span class="vz-st" aria-live="polite"></span><button type="button" class="vz-stop" hidden>'+ICO.stop+'Callar</button>';
    if(o.after)o.after.insertAdjacentElement('afterend',bar);else raiz.prepend(bar);
    const seg=bar.querySelector('.vz-seg'),est=bar.querySelector('.vz-st'),callar=bar.querySelector('.vz-stop');
    const actMic=document.createElement('button');actMic.type='button';actMic.className='vz-act';actMic.hidden=true;actMic.innerHTML=ICO.mic+'Activar micrófono';est.insertAdjacentElement('afterend',actMic);
    const mic=document.createElement('button');mic.type='button';mic.className='vz-mic';mic.innerHTML=ICO.mic;
    if(o.sendBtn)o.sendBtn.insertAdjacentElement('beforebegin',mic);else if(o.form)o.form.appendChild(mic);

    function aviso(t,err){clearTimeout(avisoT);est.textContent=t;est.classList.toggle('err',!!err);avisoT=setTimeout(pintar,err?7000:4500)}
    function pintar(){
      raiz.setAttribute('data-vz-modo',modo);
      seg.querySelectorAll('button').forEach(b=>{const m=b.dataset.m;b.setAttribute('aria-checked',m===modo?'true':'false');b.setAttribute('aria-disabled',puede(m)?'false':'true');b.tabIndex=m===modo?0:-1});
      mic.hidden=!(modo==='voz'&&SR);mic.classList.toggle('on',st.escucha);
      mic.setAttribute('aria-label',st.escucha?'Dejar de escuchar':'Hablar');mic.title=st.escucha?'Toca para dejar de escuchar':'Toca y habla';
      callar.hidden=!st.habla;
      est.classList.remove('err');
      actMic.hidden=true;
      if(modo==='voz'&&SR&&typeof micOk==='string'&&!st.escucha&&!st.habla){
        if(micOk==='denied'&&micIntentos<2){est.textContent='Para hablar con el asistente, activa el micrófono.';actMic.hidden=false;return}
        est.textContent=MIC_MSG[micOk];est.classList.add('err');actMic.hidden=micOk==='blocked';return}
      est.textContent=st.escucha?'Escuchando… habla ahora':st.habla?'Leyendo la respuesta…':modo==='voz'?(SR?'Toca el micrófono y habla, o escribe':'Te leo las respuestas (aquí no se puede dictar)'):modo==='texto-voz'?'Te leo cada respuesta':'Sin sonido';
    }
    // iOS solo deja hablar si la primera lectura sale de un toque: se "desbloquea" con uno silencioso.
    function desbloquear(){if(!TTS||desbloqueado)return;desbloqueado=true;try{if(!speechSynthesis.speaking){const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u)}}catch(_){}}

    // Permiso del micrófono: se pide una sola vez (getUserMedia muestra el aviso del navegador) y se recuerda.
    // micOk: true = permitido; null = sin saber; 'denied' | 'blocked' | 'nomic' = no se puede dictar.
    let micOk=null,micP=null,micIntentos=0;
    const IOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const MIC_MSG={
      denied:IOS?'Micrófono bloqueado. En iPhone: Ajustes › Safari › Micrófono › Permitir, y recarga. Mientras, escribe y te leo las respuestas.':'Micrófono bloqueado. Toca el candado junto a la dirección › Micrófono › Permitir, y recarga. Mientras, escribe y te leo las respuestas.',
      blocked:'Esta página aún no tiene permiso para usar el micrófono. Escribe y te leo las respuestas.',
      nomic:'No encontré micrófono en este equipo. Escribe y te leo las respuestas.'};
    const politicaBloquea=()=>{try{const fp=document.permissionsPolicy||document.featurePolicy;return !!(fp&&fp.allowsFeature&&!fp.allowsFeature('microphone'))}catch(_){return false}};
    try{navigator.permissions&&navigator.permissions.query({name:'microphone'}).then(ps=>{
      const ver=()=>{if(ps.state==='granted'){micOk=true}else if(ps.state==='denied'&&micOk!=='blocked'){micOk=politicaBloquea()?'blocked':'denied'}else if(micOk!==true)micOk=null;pintar()};
      ver();ps.onchange=ver}).catch(()=>{})}catch(_){}
    function micMal(r){micIntentos++;micOk=r;st.ciclo=false;dejarDeEscuchar();pintar()}
    function pedirMic(){
      if(micOk===true)return Promise.resolve(true);
      if(politicaBloquea()){micMal('blocked');return Promise.resolve(false)}
      if(micP)return micP;
      const md=navigator.mediaDevices;
      if(!md||!md.getUserMedia){micOk=true;return Promise.resolve(true)}
      micP=md.getUserMedia({audio:true}).then(str=>{try{str.getTracks().forEach(t=>t.stop())}catch(_){}micOk=true;return true},
        e=>{const n=e&&e.name;if(n==='NotAllowedError'||n==='SecurityError'||n==='PermissionDeniedError'){micMal(politicaBloquea()?'blocked':'denied');return false}
          if(n==='NotFoundError'||n==='DevicesNotFoundError'){micMal('nomic');return false}
          micOk=true;return true}).then(r=>{micP=null;pintar();return r});
      return micP;
    }

    function callarYa(){turno++;clearInterval(vigia);if(st.habla&&TTS){try{speechSynthesis.cancel()}catch(_){}}st.habla=false;pintar()}
    function hablar(texto,alTerminar){
      if(!TTS)return;const partes=trozos(limpiar(texto));if(!partes.length)return;
      dejarDeEscuchar();if(st.habla){try{speechSynthesis.cancel()}catch(_){}}
      const mio=++turno;voz=voz||elegirVoz(lang);st.habla=true;pintar();
      const fin=ok=>{if(mio!==turno)return;turno++;clearInterval(vigia);st.habla=false;pintar();if(ok&&alTerminar)alTerminar()};
      try{speechSynthesis.resume()}catch(_){}
      partes.forEach((p,i)=>{const u=new SpeechSynthesisUtterance(p);u.lang=(voz&&voz.lang)||lang;if(voz)u.voice=voz;u.rate=o.rate||1.03;u.pitch=1;
        if(i===partes.length-1)u.onend=()=>fin(true);u.onerror=e=>{if(e.error!=='interrupted'&&e.error!=='canceled'&&i<partes.length-1)return;fin(false)};
        speechSynthesis.speak(u)});
      // Respaldo por si el navegador no avisa que terminó (o si otra parte de la página la calló).
      let quieto=0,t0=Date.now();clearInterval(vigia);
      vigia=setInterval(()=>{if(Date.now()-t0<1500)return;quieto=(speechSynthesis.speaking||speechSynthesis.pending)?0:quieto+1;if(quieto>=2)fin(false)},500);
    }

    function dejarDeEscuchar(){if(rec){rec._cancelado=true;try{rec.abort()}catch(_){}rec=null}if(st.escucha){st.escucha=false;pintar()}}
    function escuchar(){
      if(!SR||st.escucha)return;
      if(micOk!==true){if(typeof micOk==='string')return;pedirMic().then(ok=>{if(ok&&modo==='voz'&&st.ciclo&&(!o.isOpen||o.isOpen()))escuchar()});return}
      callarYa();
      let r;try{r=new SR()}catch(_){aviso('Tu navegador no permite dictar.',true);return}
      rec=r;r.lang=lang;r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
      let final='',error='';const inp=o.input;
      r.onresult=e=>{let tmp='';for(let i=e.resultIndex;i<e.results.length;i++){const x=e.results[i];if(x.isFinal)final+=x[0].transcript;else tmp+=x[0].transcript}
        if(inp){inp.value=(final+' '+tmp).replace(/\s+/g,' ').trim();inp.dispatchEvent(new Event('input',{bubbles:true}))}};
      r.onerror=e=>{error=e.error||'error'};
      r.onend=()=>{
        if(rec===r)rec=null;st.escucha=false;pintar();if(r._cancelado)return;
        const t=(final||(inp&&inp.value)||'').trim();
        if(error==='not-allowed'||error==='service-not-allowed'){micMal(politicaBloquea()?'blocked':'denied');return}
        if(error==='network'){st.ciclo=false;aviso('El dictado necesita internet. Intenta de nuevo o escribe.',true);return}
        if(error==='audio-capture'){micMal('nomic');return}
        if(!t){st.ciclo=false;aviso('No te escuché. Toca el micrófono para hablar.');return}
        if(inp){inp.value='';inp.dispatchEvent(new Event('input',{bubbles:true}))}
        o.onSend&&o.onSend(t);
      };
      try{r.start();st.escucha=true;pintar()}catch(_){rec=null;st.ciclo=false;aviso('No pude abrir el micrófono. Toca otra vez.',true)}
    }

    // Cambia de modo. porToque=true cuando viene de un clic (permite abrir micrófono y desbloquear iOS).
    function ponerModo(m,porToque,escucharYa){
      if(!puede(m)){aviso('Tu navegador no permite usar la voz. Usa Chrome, Edge o Safari.',true);return false}
      const antes=modo;modo=m;try{localStorage.setItem(KEY,m)}catch(_){}
      if(m==='texto'){st.ciclo=false;dejarDeEscuchar();callarYa()}
      if(m!=='voz'){st.ciclo=false;dejarDeEscuchar()}
      pintar();
      if(porToque&&m!=='texto')desbloquear();
      if(porToque&&m==='voz'&&SR&&micOk!==true&&typeof micOk!=='string')pedirMic();
      if(m==='voz'&&porToque&&(escucharYa===undefined?antes!=='voz':escucharYa)){st.ciclo=true;if(SR)escuchar()}
      else if(m==='voz'&&porToque)st.ciclo=true;
      if(m==='voz'&&!SR&&porToque)aviso('Aquí no se puede dictar (usa Chrome, Edge o Safari). Escribe y te leo las respuestas.');
      o.onMode&&o.onMode(m);return true;
    }
    seg.addEventListener('click',e=>{const b=e.target.closest('button[data-m]');if(b)ponerModo(b.dataset.m,true)});
    seg.addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const ms=lista.filter(puede);let i=ms.indexOf(modo)+(e.key==='ArrowRight'?1:-1);i=(i+ms.length)%ms.length;ponerModo(ms[i],true);seg.querySelector(`[data-m="${ms[i]}"]`).focus()});
    mic.addEventListener('click',()=>{desbloquear();if(st.escucha){st.ciclo=false;dejarDeEscuchar();return}if(typeof micOk==='string')micOk=null;st.ciclo=true;escuchar()});
    actMic.addEventListener('click',()=>{desbloquear();micOk=null;st.ciclo=true;escuchar()});
    callar.addEventListener('click',()=>{st.ciclo=false;callarYa()});
    if(o.input)o.input.addEventListener('keydown',e=>{if(e.isTrusted&&st.habla){callarYa()}});
    if(o.form)o.form.addEventListener('submit',()=>{if(modo!=='texto'){desbloquear();if(modo==='voz')st.ciclo=!!SR&&st.ciclo}},true);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){st.ciclo=false;dejarDeEscuchar();callarYa()}});
    pintar();

    return {
      mode:()=>modo,
      setMode:m=>ponerModo(m,false),
      // Al abrir el chat desde un botón (llámalo dentro del clic). escucharYa: abrir el micrófono de inmediato.
      activar:(m,escucharYa)=>ponerModo(m,true,!!escucharYa),
      soporte:{dictar:!!SR,leer:TTS},
      // Lee una respuesta del bot si el modo lo pide. En modo voz, al terminar vuelve a escuchar.
      // No interrumpe a la persona si en ese momento está hablando.
      say(texto){if(!lee()||st.escucha)return;hablar(texto,()=>{if(modo==='voz'&&st.ciclo&&(!o.isOpen||o.isOpen()))escuchar()})},
      speak:t=>hablar(t),
      decorate(el,texto){if(!TTS||!el)return;const b=document.createElement('button');b.type='button';b.className='vz-play';b.title='Escuchar este mensaje';b.setAttribute('aria-label','Escuchar este mensaje');b.innerHTML=ICO.spk;b.addEventListener('click',e=>{e.stopPropagation();desbloquear();st.ciclo=false;hablar(texto)});el.appendChild(b)},
      listen:()=>{st.ciclo=true;escuchar()},
      stop(){st.ciclo=false;dejarDeEscuchar();callarYa()},
      busy:()=>st.escucha||st.habla
    };
  }
  window.VozChat={create,lanzadores,soporte:{dictar:!!SR,leer:TTS},iconos:ICO};
})();
