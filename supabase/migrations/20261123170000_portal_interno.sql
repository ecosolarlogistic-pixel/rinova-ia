-- Rinova IA · portal interno
-- Aditivo: amplía roles y perfiles, guarda los datos del Estudio en cada proyecto, agrega obras con sus
-- etapas (calendario), los prospectos del chatbot y la configuración de los dos asistentes.
-- Misma regla que el esquema inicial: RLS en todo, nada directo para anon, auth.uid() en (select …).

-- =========================================================
-- 1. Roles: se agregan Administración y Supervisor de obra
-- =========================================================
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.user_roles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop execute format('alter table public.user_roles drop constraint %I', c); end loop;
end $$;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin','administracion','arquitecto','ingeniero','supervisor','ventas','distribuidor','cliente'));

-- Personal interno = todos menos cliente y distribuidor
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid())
                 and role in ('admin','administracion','arquitecto','ingeniero','supervisor','ventas'));
$$;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- =========================================================
-- 2. Perfiles: correo, puesto y estado
-- =========================================================
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists job_title text check (job_title is null or length(job_title) <= 80);
alter table public.profiles add column if not exists active boolean not null default true;
update public.profiles p set email = lower(u.email) from auth.users u where u.id = p.id and p.email is null;
create index if not exists profiles_email_idx on public.profiles (email);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, phone, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.raw_user_meta_data->>'phone', lower(new.email))
  on conflict (id) do update set email = excluded.email;
  insert into public.user_roles(user_id, role) values (new.id, 'cliente') on conflict do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Nadie cambia su propio correo ni su estado desde el navegador (lo hace la función gestion-usuarios)
create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if new.email is distinct from old.email or new.active is distinct from old.active then
    raise exception 'El correo y el estado de la cuenta los cambia un administrador';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- Quién soy: lo usa el portal para mostrar secciones (la seguridad real sigue en RLS)
create or replace function public.my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then jsonb_build_object('interno', false) else
    jsonb_build_object(
      'id', (select auth.uid()),
      'full_name', coalesce((select full_name from public.profiles where id = (select auth.uid())), ''),
      'email', (select email from public.profiles where id = (select auth.uid())),
      'job_title', (select job_title from public.profiles where id = (select auth.uid())),
      'roles', coalesce((select jsonb_agg(role order by role) from public.user_roles where user_id = (select auth.uid())), '[]'::jsonb),
      'is_admin', public.has_role(array['admin']),
      'interno', public.is_staff()
    ) end
$$;
revoke execute on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- =========================================================
-- 3. Proyectos: lo que el usuario diseñó en el Estudio
-- =========================================================
alter table public.projects add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.projects add column if not exists stage text not null default 'diseno'
  check (stage in ('diseno','ingenieria','licencias','obra','entregado'));
alter table public.projects add column if not exists budget_total numeric(14,2) check (budget_total is null or budget_total >= 0);
alter table public.projects add column if not exists area_m2 numeric(10,2) check (area_m2 is null or area_m2 >= 0);
alter table public.projects add constraint projects_data_size check (pg_column_size(data) < 200000) not valid;
create index if not exists projects_updated_idx on public.projects (updated_at desc);

-- =========================================================
-- 4. Obras y etapas (calendario día / semana / mes / año)
-- =========================================================
create sequence if not exists public.obra_code_seq start 101;
create table if not exists public.obras (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('OB-' || nextval('public.obra_code_seq')::text),
  project_id uuid references public.projects(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null,          -- cliente dueño (ve su obra)
  responsible_id uuid references auth.users(id) on delete set null,    -- residente / supervisor
  name text not null check (length(name) between 1 and 120),
  client_name text check (client_name is null or length(client_name) <= 120),
  city text check (city is null or length(city) <= 80),
  address text check (address is null or length(address) <= 200),
  status text not null default 'planeada' check (status in ('planeada','en_curso','pausada','terminada','cancelada')),
  start_date date not null,
  end_date date not null,
  budget numeric(14,2) check (budget is null or budget >= 0),
  color text not null default '#D4AF37' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists obras_project_idx on public.obras (project_id);
create index if not exists obras_owner_idx on public.obras (owner_id);
create index if not exists obras_resp_idx on public.obras (responsible_id);
create index if not exists obras_created_by_idx on public.obras (created_by);
create index if not exists obras_dates_idx on public.obras (start_date, end_date);
drop trigger if exists obras_updated on public.obras;
create trigger obras_updated before update on public.obras for each row execute function public.set_updated_at();

create table if not exists public.obra_etapas (
  id bigint generated always as identity primary key,
  obra_id uuid not null references public.obras(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  start_date date not null,
  end_date date not null,
  progress smallint not null default 0 check (progress between 0 and 100),
  status text not null default 'pendiente' check (status in ('pendiente','en_proceso','terminada')),
  responsible_id uuid references auth.users(id) on delete set null,
  sort_order smallint not null default 0,
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists etapas_obra_idx on public.obra_etapas (obra_id, sort_order);
create index if not exists etapas_resp_idx on public.obra_etapas (responsible_id);
create index if not exists etapas_dates_idx on public.obra_etapas (start_date, end_date);
drop trigger if exists etapas_updated on public.obra_etapas;
create trigger etapas_updated before update on public.obra_etapas for each row execute function public.set_updated_at();

-- Coherencia: 100 % = terminada; terminada = 100 %
create or replace function public.etapas_sync()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.progress = 100 then new.status := 'terminada';
  elsif new.status = 'terminada' then new.progress := 100;
  elsif new.progress > 0 and new.status = 'pendiente' then new.status := 'en_proceso';
  end if;
  return new;
end $$;
drop trigger if exists etapas_sync on public.obra_etapas;
create trigger etapas_sync before insert or update on public.obra_etapas for each row execute function public.etapas_sync();

create or replace function public.can_see_obra(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.obras o where o.id = p_id
    and (public.is_staff() or o.owner_id = (select auth.uid()) or o.responsible_id = (select auth.uid())));
$$;
create or replace function public.can_edit_obra(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.obras o where o.id = p_id
    and (public.has_role(array['admin','arquitecto','ingeniero','supervisor']) or o.responsible_id = (select auth.uid())));
$$;
revoke execute on function public.can_see_obra(uuid), public.can_edit_obra(uuid) from public, anon;
grant execute on function public.can_see_obra(uuid), public.can_edit_obra(uuid) to authenticated;

alter table public.obras enable row level security;
alter table public.obra_etapas enable row level security;
revoke all on public.obras, public.obra_etapas from anon;
grant select, insert, update, delete on public.obras, public.obra_etapas to authenticated;
grant usage on sequence public.obra_code_seq to authenticated;

create policy obras_select on public.obras for select to authenticated
  using ((select public.is_staff()) or owner_id = (select auth.uid()) or responsible_id = (select auth.uid()));
create policy obras_insert on public.obras for insert to authenticated
  with check ((select public.has_role(array['admin','arquitecto','ingeniero','supervisor'])));
create policy obras_update on public.obras for update to authenticated
  using ((select public.has_role(array['admin','arquitecto','ingeniero','supervisor'])) or responsible_id = (select auth.uid()))
  with check ((select public.has_role(array['admin','arquitecto','ingeniero','supervisor'])) or responsible_id = (select auth.uid()));
create policy obras_delete on public.obras for delete to authenticated using ((select public.has_role(array['admin'])));

create policy etapas_select on public.obra_etapas for select to authenticated using (public.can_see_obra(obra_id));
create policy etapas_insert on public.obra_etapas for insert to authenticated with check (public.can_edit_obra(obra_id));
create policy etapas_update on public.obra_etapas for update to authenticated
  using (public.can_edit_obra(obra_id) or responsible_id = (select auth.uid()))
  with check (public.can_edit_obra(obra_id) or responsible_id = (select auth.uid()));
create policy etapas_delete on public.obra_etapas for delete to authenticated using (public.can_edit_obra(obra_id));

-- =========================================================
-- 5. Prospectos del chatbot del sitio (solo escribe la función con la llave de servicio)
-- =========================================================
create table if not exists public.chatbot_leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'cotizacion' check (kind in ('cotizacion','asesor')),
  full_name text not null check (length(full_name) between 2 and 160),
  email text check (email is null or length(email) <= 200),
  phone text check (phone is null or length(phone) <= 40),
  project_type text check (project_type is null or length(project_type) <= 80),
  city text check (city is null or length(city) <= 80),
  notes text check (notes is null or length(notes) <= 1000),
  page_url text check (page_url is null or length(page_url) <= 300),
  status text not null default 'nuevo' check (status in ('nuevo','contactado','descartado')),
  created_at timestamptz not null default now(),
  constraint chatbot_leads_contact check (email is not null or phone is not null)
);
create index if not exists chatbot_leads_created_idx on public.chatbot_leads (created_at desc);
alter table public.chatbot_leads enable row level security;
revoke all on public.chatbot_leads from anon;
revoke insert, delete on public.chatbot_leads from authenticated;
grant select, update on public.chatbot_leads to authenticated;
create policy chatbot_leads_select on public.chatbot_leads for select to authenticated
  using ((select public.has_role(array['admin','ventas'])));
create policy chatbot_leads_update on public.chatbot_leads for update to authenticated
  using ((select public.has_role(array['admin','ventas']))) with check ((select public.has_role(array['admin','ventas'])));

-- =========================================================
-- 6. Configuración de los asistentes (una fila cada uno; solo admin edita)
-- =========================================================
create table if not exists public.asistente_settings (
  id text primary key check (id in ('ventas','interno')),
  knowledge text not null default '' check (length(knowledge) <= 12000),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.asistente_settings (id) values ('ventas'), ('interno') on conflict do nothing;
create index if not exists asistente_settings_by_idx on public.asistente_settings (updated_by);
alter table public.asistente_settings enable row level security;
revoke all on public.asistente_settings from anon;
grant select, update on public.asistente_settings to authenticated;
create policy asistente_select on public.asistente_settings for select to authenticated using ((select public.is_staff()));
create policy asistente_update on public.asistente_settings for update to authenticated
  using ((select public.has_role(array['admin']))) with check ((select public.has_role(array['admin'])));

-- Chat interno (plantilla skill-chatinterno, variante C): quién pregunta y qué columnas existen
create or replace function public.chatinterno_acceso()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_access(), '{}'::jsonb) || jsonb_build_object('modules',
    case when public.has_role(array['admin']) then null
         when public.has_role(array['ventas']) then '["ventas"]'::jsonb else '[]'::jsonb end)
$$;
revoke execute on function public.chatinterno_acceso() from public, anon;
grant execute on function public.chatinterno_acceso() to authenticated, service_role;

create or replace function public.chatinterno_columnas(p_tablas text[])
returns table (tabla text, columnas text)
language sql stable security definer set search_path = '' as $$
  select c.table_name::text,
         string_agg(c.column_name || ' ' ||
           case when c.data_type = 'USER-DEFINED' then c.udt_name
                when c.data_type like 'timestamp%' then 'fecha_hora'
                when c.data_type = 'character varying' then 'text'
                else c.data_type end, ', ' order by c.ordinal_position)
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = any (p_tablas) and c.column_name <> 'data'
    and (auth.role() = 'service_role' or public.is_staff())
  group by c.table_name
$$;
revoke execute on function public.chatinterno_columnas(text[]) from public, anon;
grant execute on function public.chatinterno_columnas(text[]) to authenticated, service_role;

-- =========================================================
-- 7. Resumen del tablero (con los permisos de quien lo pide)
-- =========================================================
create or replace function public.portal_resumen()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'proyectos',          (select count(*) from public.projects),
    'proyectos_activos',  (select count(*) from public.projects where status not in ('cancelado') and stage <> 'entregado'),
    'proyectos_mes',      (select count(*) from public.projects where created_at >= date_trunc('month', now())),
    'cartera',            (select coalesce(sum(budget_total), 0) from public.projects where status <> 'cancelado'),
    'obras',              (select count(*) from public.obras where status not in ('terminada','cancelada')),
    'obras_en_curso',     (select count(*) from public.obras where status = 'en_curso'),
    'etapas_hoy',         (select count(*) from public.obra_etapas where current_date between start_date and end_date and status <> 'terminada'),
    'etapas_atrasadas',   (select count(*) from public.obra_etapas where end_date < current_date and status <> 'terminada'),
    'etapas_semana',      (select count(*) from public.obra_etapas where start_date between current_date and current_date + 7),
    'prospectos_nuevos',  (select count(*) from public.leads where status = 'nuevo')
                          + (select count(*) from public.chatbot_leads where status = 'nuevo'),
    'usuarios',           (select count(*) from public.profiles where active),
    'usuarios_internos',  (select count(distinct user_id) from public.user_roles where role not in ('cliente','distribuidor'))
  )
$$;
revoke execute on function public.portal_resumen() from public, anon;
grant execute on function public.portal_resumen() to authenticated;

-- =========================================================
-- 8. Los roles nuevos ven lo mismo que el resto del personal
-- =========================================================
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (owner_id = (select auth.uid()) or referred_by = (select auth.uid()) or (select public.is_staff()));

create or replace function public.can_see_project(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects p where p.id = p_id
    and (p.owner_id = (select auth.uid()) or p.referred_by = (select auth.uid()) or public.is_staff()));
$$;

-- =========================================================
-- 9. Cuentas de Dirección: estos correos reciben el rol admin al darse de alta (o ya existentes)
-- =========================================================
create or replace function public.grant_bootstrap_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) in ('admin@rinovaia.com','vicente@rinovaia.com') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.grant_bootstrap_admin() from public, anon, authenticated;
drop trigger if exists on_auth_user_admin on auth.users;
create trigger on_auth_user_admin after insert on auth.users
  for each row execute function public.grant_bootstrap_admin();
insert into public.user_roles(user_id, role)
  select id, 'admin' from auth.users where lower(email) in ('admin@rinovaia.com','vicente@rinovaia.com')
  on conflict do nothing;

-- Presupuestos por obra (columna que agrega la migración del catálogo de conceptos)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='budgets' and column_name='obra_id')
     and not exists (select 1 from pg_constraint where conname = 'budgets_obra_fk') then
    alter table public.budgets add constraint budgets_obra_fk foreign key (obra_id) references public.obras(id) on delete set null;
  end if;
end $$;

-- Permisos explícitos para las funciones (llave de servicio)
grant all on public.obras, public.obra_etapas, public.chatbot_leads, public.asistente_settings to service_role;
grant usage on sequence public.obra_code_seq to service_role;
