// RINOVAIA — gestión de usuarios del portal interno (solo Admin / Dirección).
// Patrón de la skill EcoSolarUsuario adaptado a @rinovaia.com.
//
// POST JSON { action, ... } con Authorization: Bearer <token de sesión de un Admin>
//   list                                                     -> { users: [...] }
//   create   { email, full_name, phone, job_title, role, password } -> { ok, id }
//   update   { user_id, full_name, phone, job_title, role }  -> { ok }
//   active   { user_id, active }                             -> { ok }   (bloquea ~100 años o reactiva)
//   password { user_id, password }                           -> { ok }
//
// El personal interno (todos los roles salvo cliente y distribuidor) debe usar correo @rinovaia.com.
// La llave de servicio solo vive aquí (SUPABASE_SERVICE_ROLE_KEY la pone Supabase).
// Despliegue: verify_jwt = false (la función revisa la sesión ella misma).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DOMINIO = "@rinovaia.com";
const ROLES = ["admin", "administracion", "arquitecto", "ingeniero", "supervisor", "ventas", "distribuidor", "cliente"];
const INTERNOS = ["admin", "administracion", "arquitecto", "ingeniero", "supervisor", "ventas"];
const ORDEN = ROLES;
const ORIGINS = (Deno.env.get("RINOVA_ORIGENES") ??
  "https://www.rinovaia.com,https://rinovaia.com,http://localhost:8765,http://127.0.0.1:8765,http://localhost:8080")
  .split(",").map((s) => s.trim()).filter(Boolean);

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
  };
}

const mainRole = (roles: string[]) => ORDEN.find((r) => roles.includes(r)) ?? "cliente";
const strong = (p: string) => p.length >= 8 && p.length <= 50 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
const clean = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const phoneOk = (v: unknown) => {
  const p = typeof v === "string" ? v.replace(/\D/g, "") : "";
  if (p && p.length !== 10) throw new HttpError(400, "El celular debe tener 10 dígitos.");
  return p || null;
};

async function caller(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("eyJ")) throw new HttpError(401, "Inicia sesión en el portal.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Tu sesión venció. Vuelve a entrar.");
  const { data: r } = await admin.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
  if (!r) throw new HttpError(403, "Solo Dirección (Admin) puede gestionar usuarios.");
  return data.user;
}

async function setRole(userId: string, role: string) {
  if (!ROLES.includes(role)) throw new HttpError(400, "Rol no válido.");
  // Un rol principal: se quitan los demás (cliente queda como base para todos)
  const { error: d } = await admin.from("user_roles").delete().eq("user_id", userId).neq("role", "cliente").neq("role", role);
  if (d) throw d;
  const rows = [{ user_id: userId, role }];
  if (role !== "cliente") rows.push({ user_id: userId, role: "cliente" });
  const { error } = await admin.from("user_roles").upsert(rows, { onConflict: "user_id,role", ignoreDuplicates: true });
  if (error) throw error;
}

async function list() {
  const users: Record<string, unknown>[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...(data.users as unknown as Record<string, unknown>[]));
    if (data.users.length < 200) break;
  }
  const ids = users.map((u) => u.id as string);
  const [{ data: profs }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("id,full_name,phone,job_title,active").in("id", ids),
    admin.from("user_roles").select("user_id,role").in("user_id", ids),
  ]);
  const pm = new Map((profs || []).map((p) => [p.id, p]));
  const rm = new Map<string, string[]>();
  (roles || []).forEach((r) => rm.set(r.user_id, [...(rm.get(r.user_id) || []), r.role]));
  const now = Date.now();
  return users.map((u) => {
    const p = pm.get(u.id as string) || {} as Record<string, unknown>;
    const banned = u.banned_until && Date.parse(u.banned_until as string) > now;
    const rs = rm.get(u.id as string) || [];
    return {
      id: u.id, email: u.email, full_name: p.full_name || "", phone: p.phone || null, job_title: p.job_title || null,
      role: mainRole(rs), roles: rs, active: !banned && p.active !== false,
      confirmed: !!u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at || null, created_at: u.created_at,
    };
  }).sort((a, b) => INTERNOS.indexOf(a.role) - INTERNOS.indexOf(b.role) || String(a.full_name).localeCompare(String(b.full_name)));
}

async function create(b: Record<string, unknown>) {
  const email = String(b.email || "").trim().toLowerCase();
  const role = String(b.role || "");
  const full_name = clean(b.full_name, 120);
  const password = String(b.password || "");
  if (!ROLES.includes(role)) throw new HttpError(400, "Elige un rol.");
  if (!full_name || full_name.length < 3) throw new HttpError(400, "Escribe nombre y apellidos.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Correo no válido.");
  if (INTERNOS.includes(role) && !email.endsWith(DOMINIO)) throw new HttpError(400, `El personal interno usa correo ${DOMINIO}.`);
  if (INTERNOS.includes(role) && !/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?@rinovaia\.com$/.test(email)) throw new HttpError(400, "El correo solo lleva letras, números y . _ - (sin acentos ni ñ).");
  if (!strong(password)) throw new HttpError(400, "La contraseña necesita 8 a 50 caracteres con mayúscula, minúscula, número y símbolo.");
  const phone = phoneOk(b.phone);
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name, phone },
  });
  if (error) {
    if (/already|exists|registered/i.test(error.message)) throw new HttpError(409, "Ya existe un usuario con ese correo.");
    throw error;
  }
  const id = data.user!.id;
  // El trigger ya creó el perfil con rol cliente; se completan los datos y el rol
  const { error: pe } = await admin.from("profiles").upsert({ id, full_name, phone, job_title: clean(b.job_title, 80), email, active: true });
  if (pe) throw new HttpError(500, "Se creó el usuario pero no su perfil: " + pe.message);
  try { await setRole(id, role); } catch (e) { throw new HttpError(500, "Se creó el usuario pero no su rol: " + (e as Error).message); }
  return { ok: true, id };
}

async function update(b: Record<string, unknown>, me: string) {
  const id = String(b.user_id || "");
  const role = String(b.role || "");
  if (!id) throw new HttpError(400, "Falta el usuario.");
  if (id === me && role !== "admin") throw new HttpError(400, "No puedes quitarte el rol Admin a ti mismo.");
  const { data: u, error: ue } = await admin.auth.admin.getUserById(id);
  if (ue || !u?.user) throw new HttpError(404, "No encontré ese usuario.");
  if (INTERNOS.includes(role) && !String(u.user.email).toLowerCase().endsWith(DOMINIO)) throw new HttpError(400, `Para un rol interno el usuario debe tener correo ${DOMINIO}.`);
  const full_name = clean(b.full_name, 120);
  if (!full_name) throw new HttpError(400, "Escribe el nombre.");
  const { error } = await admin.from("profiles").update({ full_name, phone: phoneOk(b.phone), job_title: clean(b.job_title, 80) }).eq("id", id);
  if (error) throw error;
  await setRole(id, role);
  await admin.auth.admin.updateUserById(id, { user_metadata: { ...u.user.user_metadata, full_name } });
  return { ok: true };
}

async function setActive(b: Record<string, unknown>, me: string) {
  const id = String(b.user_id || "");
  const active = b.active === true;
  if (id === me && !active) throw new HttpError(400, "No puedes bloquearte a ti mismo.");
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  if (error) throw error;
  await admin.from("profiles").update({ active }).eq("id", id);
  return { ok: true };
}

async function setPassword(b: Record<string, unknown>) {
  const id = String(b.user_id || "");
  const password = String(b.password || "");
  if (!strong(password)) throw new HttpError(400, "La contraseña necesita 8 a 50 caracteres con mayúscula, minúscula, número y símbolo.");
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) throw error;
  return { ok: true };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (origin && !ORIGINS.includes(origin)) return json({ error: "Origen no autorizado." }, 403);
  try {
    const me = await caller(req);
    const b = await req.json().catch(() => ({}));
    switch (b.action) {
      case "list": return json({ users: await list() });
      case "create": return json(await create(b));
      case "update": return json(await update(b, me.id));
      case "active": return json(await setActive(b, me.id));
      case "password": return json(await setPassword(b));
      default: return json({ error: "Acción desconocida." }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("gestion-usuarios", (e as Error).message);
    return json({ error: "No se pudo completar: " + ((e as Error).message || "error") }, 500);
  }
});
