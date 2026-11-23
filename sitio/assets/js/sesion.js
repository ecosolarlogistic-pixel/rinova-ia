/* RINOVAIA — sesión con Supabase Auth.
   Expone window.rinovaDB (cliente supabase-js) y window.RinovaSesion.
   En el navegador solo va la URL y la llave publicable; la seguridad vive en RLS. */
(function () {
  'use strict';
  var SB_URL = 'https://evjoqaphylggvojthezj.supabase.co';
  var SB_KEY = 'sb_publishable_ll_SpxeCPe8VEFVVX1KpMg_s6DfoWkX';
  if (!window.supabase || !window.supabase.createClient) { console.error('Falta supabase-js'); return; }
  var db = window.rinovaDB = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'rinova.auth' }
  });

  var ROLES = {
    admin: 'Admin (Dirección)', administracion: 'Administración', arquitecto: 'Arquitectura', ingeniero: 'Ingeniería',
    supervisor: 'Supervisor de obra', ventas: 'Ventas', distribuidor: 'Distribuidor', cliente: 'Cliente'
  };
  var ORDER = ['admin', 'administracion', 'arquitecto', 'ingeniero', 'supervisor', 'ventas', 'distribuidor', 'cliente'];
  function mainRole(roles) { roles = roles || []; for (var i = 0; i < ORDER.length; i++) if (roles.indexOf(ORDER[i]) >= 0) return ORDER[i]; return 'cliente'; }

  var cache = null;
  function access(force) {
    if (cache && !force) return cache;
    cache = db.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) return null;
      return db.rpc('my_access').then(function (a) {
        var acc = a.data || {};
        if (a.error) { console.warn('my_access', a.error.message); acc = { roles: ['cliente'], interno: false, is_admin: false }; }
        if (!acc.full_name) acc.full_name = (s.user.user_metadata && s.user.user_metadata.full_name) || '';
        if (!acc.email) acc.email = s.user.email;
        acc.role = mainRole(acc.roles); acc.roleLabel = ROLES[acc.role];
        return { user: s.user, session: s, access: acc };
      });
    });
    return cache;
  }
  db.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT' || ev === 'SIGNED_IN' || ev === 'USER_UPDATED') cache = null; });

  function loginUrl(next) { return 'acceso.html?next=' + encodeURIComponent(next || (location.pathname.split('/').pop() || 'interno.html') + location.search + location.hash); }

  window.RinovaSesion = {
    db: db, roles: ROLES, mainRole: mainRole,
    current: function () { return access(false); },
    refresh: function () { return access(true); },
    // Si no hay sesión, manda a acceso.html y regresa aquí al entrar
    require: function (o) {
      return access(false).then(function (s) {
        if (!s) { location.replace(loginUrl(o && o.next)); return new Promise(function () {}); }
        return s;
      });
    },
    loginUrl: loginUrl,
    signOut: function () {
      try { sessionStorage.removeItem('rinova.chatInterno'); } catch (e) { }
      return db.auth.signOut().then(function () { location.href = 'index.html'; });
    }
  };
})();
