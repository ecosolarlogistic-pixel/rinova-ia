-- Rinova IA · esquema inicial (BORRADOR — no aplicado).
-- Se aplica solo con el OK del dueño del proyecto, en un proyecto Supabase nuevo.
-- Principios: RLS en todas las tablas, políticas separadas por operación, nada para anon,
-- roles externos (distribuidor, cliente) solo leen por funciones security definer.

-- =========================================================
-- 1. Perfiles y roles
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','arquitecto','ingeniero','ventas','distributor','cliente')),
  primary key (user_id, role)
);

create or replace function public.has_role(p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = any(p_roles));
$$;
revoke execute on function public.has_role(text[]) from public, anon;
grant execute on function public.has_role(text[]) to authenticated;

-- =========================================================
-- 2. Proyectos y versiones (cada "Generar" crea una versión)
-- =========================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  referred_by uuid references auth.users(id),          -- distribuidor que lo trajo
  code text unique not null default ('RV-' || lpad((floor(random()*10000))::int::text, 4, '0')),
  name text not null check (length(name) between 1 and 80),
  client_name text,
  city text not null,
  status text not null default 'borrador' check (status in ('borrador','en_revision','aprobado','presentado','contratado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_versions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  params jsonb not null,        -- frente, fondo, niveles, crujías, estilo, uso, acabados, ubicación…
  results jsonb,                -- resumen de render, estructura, eléctrico, costos
  render_path text,             -- ruta en Storage (bucket privado "renders")
  dxf_path text,                -- ruta en Storage (bucket privado "planos")
  engine_version text not null default 'core-prompt-v1.0',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

-- =========================================================
-- 3. Prospectos (formulario de la landing) — solo por RPC
-- =========================================================
create table public.leads (
  id bigint generated always as identity primary key,
  request_id uuid unique not null,
  name text not null check (length(name) between 2 and 120),
  phone text not null check (length(phone) between 7 and 20),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  kind text,
  city text,
  message text check (length(message) <= 2000),
  ref_code text,
  created_at timestamptz not null default now()
);

create or replace function public.registrar_prospecto(
  p_request_id uuid, p_name text, p_phone text, p_email text,
  p_kind text default null, p_city text default null, p_message text default null, p_ref text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare v_recent int;
begin
  select count(*) into v_recent from public.leads
   where email = lower(trim(p_email)) and created_at > now() - interval '10 minutes';
  if v_recent >= 3 then raise exception 'Demasiados envíos, intenta más tarde'; end if;
  insert into public.leads(request_id,name,phone,email,kind,city,message,ref_code)
  values (p_request_id, trim(p_name), trim(p_phone), lower(trim(p_email)), p_kind, p_city, p_message, p_ref)
  on conflict (request_id) do nothing;
  return json_build_object('ok', true);
end $$;
revoke execute on function public.registrar_prospecto(uuid,text,text,text,text,text,text,text) from public;
grant execute on function public.registrar_prospecto(uuid,text,text,text,text,text,text,text) to anon, authenticated;

-- =========================================================
-- 4. Red de distribuidores y comisiones
-- =========================================================
create table public.distributors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sponsor_id uuid references public.distributors(user_id),
  ref_code text unique not null check (ref_code ~ '^[a-z0-9-]{3,40}$'),
  rank text not null default 'bronce' check (rank in ('bronce','plata','oro','platino','diamante')),
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.commissions (
  id bigint generated always as identity primary key,
  distributor_id uuid not null references public.distributors(user_id),
  project_id uuid not null references public.projects(id),
  level smallint not null check (level between 0 and 2),   -- 0 directa, 1 y 2 red
  amount numeric(14,2) not null check (amount >= 0),
  period date not null,
  status text not null default 'pendiente' check (status in ('pendiente','aprobada','pagada')),
  created_at timestamptz not null default now()
);

-- Lectura del distribuidor: solo lo suyo, por función
create or replace function public.distributor_summary()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'rank', d.rank, 'ref_code', d.ref_code,
    'month_total', coalesce((select sum(amount) from public.commissions c where c.distributor_id = d.user_id and c.period >= date_trunc('month', now())), 0),
    'direct_count', (select count(*) from public.distributors x where x.sponsor_id = d.user_id),
    'projects', (select count(*) from public.projects p where p.referred_by = d.user_id))
  from public.distributors d where d.user_id = auth.uid();
$$;
revoke execute on function public.distributor_summary() from public, anon;
grant execute on function public.distributor_summary() to authenticated;

-- =========================================================
-- 5. Bitácora (solo insert y select)
-- =========================================================
create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid(),
  action text not null,
  entity text, entity_id text, detail jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 6. RLS y permisos
-- =========================================================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.leads enable row level security;
alter table public.distributors enable row level security;
alter table public.commissions enable row level security;
alter table public.activity_log enable row level security;

grant select, insert, update, delete on public.profiles, public.user_roles, public.projects,
  public.project_versions, public.distributors, public.commissions to authenticated;
grant select on public.leads to authenticated;
grant select, insert on public.activity_log to authenticated;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(array['admin','ventas']));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- user_roles: solo admin escribe; cada quien lee lo suyo
create policy roles_select on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(array['admin']));
create policy roles_insert on public.user_roles for insert to authenticated with check (public.has_role(array['admin']));
create policy roles_delete on public.user_roles for delete to authenticated using (public.has_role(array['admin']) and user_id <> auth.uid());

-- projects
create policy projects_select on public.projects for select to authenticated
  using (owner_id = auth.uid() or referred_by = auth.uid() or public.has_role(array['admin','arquitecto','ingeniero','ventas']));
create policy projects_insert on public.projects for insert to authenticated with check (owner_id = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (owner_id = auth.uid() or public.has_role(array['admin','arquitecto','ingeniero'])) with check (true);
create policy projects_delete on public.projects for delete to authenticated using (public.has_role(array['admin']));

-- project_versions: se leen con el proyecto; nadie las edita
create policy versions_select on public.project_versions for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id
                 and (p.owner_id = auth.uid() or p.referred_by = auth.uid() or public.has_role(array['admin','arquitecto','ingeniero','ventas']))));
create policy versions_insert on public.project_versions for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = auth.uid() or public.has_role(array['admin','arquitecto','ingeniero']))));

-- leads: solo personal comercial lee; nadie escribe directo (RPC)
create policy leads_select on public.leads for select to authenticated using (public.has_role(array['admin','ventas']));

-- distributors / commissions: solo admin escribe; el distribuidor lee por distributor_summary()
create policy dist_select on public.distributors for select to authenticated using (user_id = auth.uid() or public.has_role(array['admin','ventas']));
create policy dist_write on public.distributors for insert to authenticated with check (public.has_role(array['admin']));
create policy dist_update on public.distributors for update to authenticated using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));
create policy com_select on public.commissions for select to authenticated using (distributor_id = auth.uid() or public.has_role(array['admin']));
create policy com_insert on public.commissions for insert to authenticated with check (public.has_role(array['admin']));
create policy com_update on public.commissions for update to authenticated using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

-- activity_log
create policy log_select on public.activity_log for select to authenticated using (public.has_role(array['admin']));
create policy log_insert on public.activity_log for insert to authenticated with check (user_id = auth.uid());
