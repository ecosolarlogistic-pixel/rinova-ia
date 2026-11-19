-- Rinova IA · esquema inicial
-- Principios: RLS en todas las tablas, políticas separadas por operación, nada directo para anon
-- (el formulario de la landing escribe por RPC), auth.uid() envuelto en (select …) por rendimiento,
-- y los cálculos de dinero (presupuestos, comisiones) se hacen en la base de datos.

-- =========================================================
-- 0. Utilidades
-- =========================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- =========================================================
-- 1. Perfiles y roles
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','arquitecto','ingeniero','ventas','distribuidor','cliente')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.has_role(p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = any(p_roles));
$$;
revoke execute on function public.has_role(text[]) from public, anon;
grant execute on function public.has_role(text[]) to authenticated;

-- Alta automática: cada usuario nuevo recibe perfil y rol "cliente"
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  insert into public.user_roles(user_id, role) values (new.id, 'cliente') on conflict do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- 2. Plan de compensación (configurable, sin tocar código)
-- =========================================================
create table public.compensation_plans (
  id smallint generated always as identity primary key,
  name text not null,
  active boolean not null default false,
  valid_from date not null default current_date,
  created_at timestamptz not null default now()
);
-- Solo un plan activo a la vez
create unique index compensation_plans_one_active on public.compensation_plans (active) where active;

create table public.plan_ranks (
  plan_id smallint not null references public.compensation_plans(id) on delete cascade,
  rank text not null check (rank in ('bronce','plata','oro','platino','diamante')),
  sort_order smallint not null,
  min_monthly_volume numeric(14,2) not null default 0 check (min_monthly_volume >= 0),
  pct_direct numeric(5,2) not null check (pct_direct between 0 and 100),
  pct_level1 numeric(5,2) not null default 0 check (pct_level1 between 0 and 100),
  pct_level2 numeric(5,2) not null default 0 check (pct_level2 between 0 and 100),
  primary key (plan_id, rank)
);

-- =========================================================
-- 3. Distribuidores
-- =========================================================
create table public.distributors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sponsor_id uuid references public.distributors(user_id),
  ref_code text unique not null check (ref_code ~ '^[a-z0-9-]{3,40}$'),
  rank text not null default 'bronce' check (rank in ('bronce','plata','oro','platino','diamante')),
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sponsor_id is distinct from user_id)
);
create index distributors_sponsor_idx on public.distributors (sponsor_id);
create trigger distributors_updated before update on public.distributors
  for each row execute function public.set_updated_at();

-- =========================================================
-- 4. Proyectos y versiones (cada "Generar" del Estudio crea una versión)
-- =========================================================
create sequence public.project_code_seq start 1001;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  referred_by uuid references public.distributors(user_id),   -- distribuidor que lo trajo
  code text unique not null default ('RV-' || nextval('public.project_code_seq')::text),
  name text not null check (length(name) between 1 and 80),
  client_name text,
  city text not null,
  status text not null default 'borrador'
    check (status in ('borrador','en_revision','aprobado','presentado','contratado','cancelado')),
  contract_value numeric(14,2) check (contract_value is null or contract_value >= 0),
  contracted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects (owner_id);
create index projects_referred_idx on public.projects (referred_by);
create trigger projects_updated before update on public.projects
  for each row execute function public.set_updated_at();

-- Quien no es personal interno no puede cambiar dueño, referido, valor ni marcar "contratado"
create or replace function public.projects_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- service_role (backend) y staff pasan; el resto, limitado
  if current_user not in ('authenticated','anon') or public.has_role(array['admin','ventas']) then return new; end if;
  if new.owner_id is distinct from old.owner_id
     or new.referred_by is distinct from old.referred_by
     or new.contract_value is distinct from old.contract_value
     or new.contracted_at is distinct from old.contracted_at
     or (new.status = 'contratado' and old.status <> 'contratado') then
    raise exception 'Solo administración o ventas puede cambiar estos datos del proyecto';
  end if;
  return new;
end $$;
create trigger projects_guard before update on public.projects
  for each row execute function public.projects_guard();

-- Al crear: solo staff asigna distribuidor o valor; un distribuidor puede registrarse a sí mismo
create or replace function public.projects_insert_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- service_role (backend) y staff pasan; el resto, limitado
  if current_user not in ('authenticated','anon') or public.has_role(array['admin','ventas']) then return new; end if;
  if new.referred_by is not null and new.referred_by <> (select auth.uid()) then
    raise exception 'El distribuidor del proyecto lo asigna ventas';
  end if;
  if new.status <> 'borrador' or new.contract_value is not null or new.contracted_at is not null then
    raise exception 'Un proyecto nuevo empieza como borrador';
  end if;
  return new;
end $$;
create trigger projects_insert_guard before insert on public.projects
  for each row execute function public.projects_insert_guard();

create table public.project_versions (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_no int not null,
  params jsonb not null,        -- frente, fondo, niveles, crujías, estilo, uso, acabados, ciudad, paleta, mes, hora
  structure jsonb,              -- resultados del cálculo estructural (elementos, % de uso, desplazamientos)
  electrical jsonb,             -- unifilar y cargas
  render_path text,             -- ruta en Storage (bucket privado "renders")
  dxf_path text,                -- ruta en Storage (bucket privado "planos")
  engine_version text not null default 'core-prompt-v1.0',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, version_no)
);

-- Numeración consecutiva por proyecto
create or replace function public.next_version_no()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.projects where id = new.project_id for update;
  select coalesce(max(version_no), 0) + 1 into new.version_no
    from public.project_versions where project_id = new.project_id;
  return new;
end $$;
create trigger project_versions_no before insert on public.project_versions
  for each row execute function public.next_version_no();

-- =========================================================
-- 5. Presupuestos (partidas de metrajes y costos por versión)
-- =========================================================
create table public.budgets (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_id bigint references public.project_versions(id) on delete set null,
  currency char(3) not null default 'MXN',
  status text not null default 'borrador' check (status in ('borrador','enviado','aceptado','rechazado')),
  subtotal numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 16 check (tax_rate between 0 and 100),
  total numeric(14,2) not null default 0,
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index budgets_project_idx on public.budgets (project_id);
create trigger budgets_updated before update on public.budgets
  for each row execute function public.set_updated_at();

create table public.budget_items (
  id bigint generated always as identity primary key,
  budget_id bigint not null references public.budgets(id) on delete cascade,
  sort_order int not null default 0,
  category text not null,       -- preliminares, cimentación, estructura, albañilería, instalaciones, acabados…
  description text not null,
  unit text not null,           -- m2, m3, kg, pza, lote
  quantity numeric(14,3) not null check (quantity >= 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  amount numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored
);
create index budget_items_budget_idx on public.budget_items (budget_id);

-- Totales siempre calculados en la base
create or replace function public.recalc_budget()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id bigint := coalesce(new.budget_id, old.budget_id);
begin
  update public.budgets b
     set subtotal = s.sub, total = round(s.sub * (1 + b.tax_rate / 100), 2)
    from (select coalesce(sum(amount), 0) sub from public.budget_items where budget_id = v_id) s
   where b.id = v_id;
  return null;
end $$;
revoke execute on function public.recalc_budget() from public, anon, authenticated;
create trigger budget_items_recalc after insert or update or delete on public.budget_items
  for each row execute function public.recalc_budget();

create or replace function public.budget_tax_recalc()
returns trigger language plpgsql set search_path = '' as $$
begin new.total := round(new.subtotal * (1 + new.tax_rate / 100), 2); return new; end $$;
create trigger budgets_tax before update of tax_rate, subtotal on public.budgets
  for each row execute function public.budget_tax_recalc();

-- =========================================================
-- 6. Prospectos (formulario de la landing) — solo por RPC
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
  distributor_id uuid references public.distributors(user_id),   -- resuelto a partir de ref_code
  status text not null default 'nuevo' check (status in ('nuevo','contactado','calificado','convertido','descartado')),
  project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now()
);
create index leads_distributor_idx on public.leads (distributor_id);
create index leads_email_recent_idx on public.leads (email, created_at desc);

create or replace function public.registrar_prospecto(
  p_request_id uuid, p_name text, p_phone text, p_email text,
  p_kind text default null, p_city text default null, p_message text default null, p_ref text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare v_recent int; v_dist uuid;
begin
  select count(*) into v_recent from public.leads
   where email = lower(trim(p_email)) and created_at > now() - interval '10 minutes';
  if v_recent >= 3 then raise exception 'Demasiados envíos, intenta más tarde'; end if;
  if p_ref is not null then
    select user_id into v_dist from public.distributors where ref_code = lower(trim(p_ref)) and active;
  end if;
  insert into public.leads(request_id,name,phone,email,kind,city,message,ref_code,distributor_id)
  values (p_request_id, trim(p_name), trim(p_phone), lower(trim(p_email)),
          left(p_kind, 40), left(p_city, 80), p_message, lower(trim(p_ref)), v_dist)
  on conflict (request_id) do nothing;
  return json_build_object('ok', true);
end $$;
revoke execute on function public.registrar_prospecto(uuid,text,text,text,text,text,text,text) from public;
grant execute on function public.registrar_prospecto(uuid,text,text,text,text,text,text,text) to anon, authenticated;

-- =========================================================
-- 7. Comisiones (se generan solas al marcar un proyecto "contratado")
-- =========================================================
create table public.commissions (
  id bigint generated always as identity primary key,
  distributor_id uuid not null references public.distributors(user_id),
  project_id uuid not null references public.projects(id),
  level smallint not null check (level between 0 and 2),   -- 0 directa, 1 y 2 red
  rank_at_calc text not null,
  pct numeric(5,2) not null,
  base_amount numeric(14,2) not null check (base_amount >= 0),
  amount numeric(14,2) not null check (amount >= 0),
  period date not null,
  status text not null default 'pendiente' check (status in ('pendiente','aprobada','pagada','cancelada')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, distributor_id, level)
);
create index commissions_distributor_idx on public.commissions (distributor_id, period);

create or replace function public.generate_commissions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_plan smallint; v_dist uuid := new.referred_by; v_level smallint := 0;
  v_rank text; v_pct numeric; v_period date;
begin
  if new.status <> 'contratado' or old.status = 'contratado'
     or v_dist is null or coalesce(new.contract_value, 0) = 0 then
    return new;
  end if;
  select id into v_plan from public.compensation_plans where active;
  if v_plan is null then return new; end if;
  new.contracted_at := coalesce(new.contracted_at, now());
  v_period := date_trunc('month', new.contracted_at)::date;
  while v_dist is not null and v_level <= 2 loop
    select d.rank,
           case v_level when 0 then r.pct_direct when 1 then r.pct_level1 else r.pct_level2 end
      into v_rank, v_pct
      from public.distributors d
      join public.plan_ranks r on r.plan_id = v_plan and r.rank = d.rank
     where d.user_id = v_dist and d.active;
    if coalesce(v_pct, 0) > 0 then
      insert into public.commissions(distributor_id, project_id, level, rank_at_calc, pct, base_amount, amount, period)
      values (v_dist, new.id, v_level, v_rank, v_pct, new.contract_value,
              round(new.contract_value * v_pct / 100, 2), v_period)
      on conflict (project_id, distributor_id, level) do nothing;
    end if;
    select sponsor_id into v_dist from public.distributors where user_id = v_dist;
    v_level := v_level + 1; v_pct := null;
  end loop;
  return new;
end $$;
revoke execute on function public.generate_commissions() from public, anon, authenticated;
create trigger projects_commissions before update of status on public.projects
  for each row execute function public.generate_commissions();

-- Resumen para el portal del distribuidor
create or replace function public.distributor_summary()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'rank', d.rank, 'ref_code', d.ref_code,
    'month_total', coalesce((select sum(amount) from public.commissions c
        where c.distributor_id = d.user_id and c.status <> 'cancelada'
          and c.period = date_trunc('month', now())::date), 0),
    'month_volume', coalesce((select sum(contract_value) from public.projects p
        where p.referred_by = d.user_id and p.status = 'contratado'
          and p.contracted_at >= date_trunc('month', now())), 0),
    'direct_count', (select count(*) from public.distributors x where x.sponsor_id = d.user_id),
    'leads_open', (select count(*) from public.leads l where l.distributor_id = d.user_id
        and l.status in ('nuevo','contactado','calificado')),
    'projects', (select count(*) from public.projects p where p.referred_by = d.user_id))
  from public.distributors d where d.user_id = (select auth.uid());
$$;
revoke execute on function public.distributor_summary() from public, anon;
grant execute on function public.distributor_summary() to authenticated;

-- Red del distribuidor (2 niveles hacia abajo), solo nombre y rango
create or replace function public.distributor_network()
returns table (user_id uuid, full_name text, rank text, level smallint, sponsor_id uuid)
language sql stable security definer set search_path = '' as $$
  with l1 as (select d.* from public.distributors d where d.sponsor_id = (select auth.uid())),
       l2 as (select d.* from public.distributors d join l1 on d.sponsor_id = l1.user_id)
  select x.user_id, p.full_name, x.rank, x.lvl, x.sponsor_id
    from (select l1.*, 1::smallint lvl from l1 union all select l2.*, 2::smallint from l2) x
    left join public.profiles p on p.id = x.user_id;
$$;
revoke execute on function public.distributor_network() from public, anon;
grant execute on function public.distributor_network() to authenticated;

-- =========================================================
-- 8. Bitácora (solo insert y select)
-- =========================================================
create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  action text not null,
  entity text, entity_id text, detail jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 9. RLS y permisos
-- =========================================================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.compensation_plans enable row level security;
alter table public.plan_ranks enable row level security;
alter table public.distributors enable row level security;
alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_items enable row level security;
alter table public.leads enable row level security;
alter table public.commissions enable row level security;
alter table public.activity_log enable row level security;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.profiles, public.user_roles, public.compensation_plans,
  public.plan_ranks, public.distributors, public.projects, public.project_versions, public.budgets,
  public.budget_items, public.commissions to authenticated;
grant select, update on public.leads to authenticated;
grant select, insert on public.activity_log to authenticated;
grant usage on sequence public.project_code_seq to authenticated;

-- Atajos
-- staff = personal interno que ve todos los proyectos
-- (select …) evita reevaluar la función por fila

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_role(array['admin','ventas','arquitecto','ingeniero'])));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles: solo admin escribe; cada quien lee lo suyo
create policy roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role(array['admin'])));
create policy roles_insert on public.user_roles for insert to authenticated with check ((select public.has_role(array['admin'])));
create policy roles_delete on public.user_roles for delete to authenticated
  using ((select public.has_role(array['admin'])) and user_id <> (select auth.uid()));

-- plan de compensación: lo leen todos los autenticados (se muestra en el portal), solo admin escribe
create policy plans_select on public.compensation_plans for select to authenticated using (true);
create policy plans_insert on public.compensation_plans for insert to authenticated with check ((select public.has_role(array['admin'])));
create policy plans_update on public.compensation_plans for update to authenticated
  using ((select public.has_role(array['admin']))) with check ((select public.has_role(array['admin'])));
create policy ranks_select on public.plan_ranks for select to authenticated using (true);
create policy ranks_insert on public.plan_ranks for insert to authenticated with check ((select public.has_role(array['admin'])));
create policy ranks_update on public.plan_ranks for update to authenticated
  using ((select public.has_role(array['admin']))) with check ((select public.has_role(array['admin'])));
create policy ranks_delete on public.plan_ranks for delete to authenticated using ((select public.has_role(array['admin'])));

-- distributors: el distribuidor ve su fila; su red la ve por distributor_network(); solo admin escribe
create policy dist_select on public.distributors for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role(array['admin','ventas'])));
create policy dist_insert on public.distributors for insert to authenticated with check ((select public.has_role(array['admin'])));
create policy dist_update on public.distributors for update to authenticated
  using ((select public.has_role(array['admin']))) with check ((select public.has_role(array['admin'])));

-- projects
create policy projects_select on public.projects for select to authenticated
  using (owner_id = (select auth.uid()) or referred_by = (select auth.uid())
         or (select public.has_role(array['admin','arquitecto','ingeniero','ventas'])));
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()) or (select public.has_role(array['admin','ventas'])));
create policy projects_update on public.projects for update to authenticated
  using (owner_id = (select auth.uid()) or (select public.has_role(array['admin','arquitecto','ingeniero','ventas'])))
  with check (owner_id = (select auth.uid()) or (select public.has_role(array['admin','arquitecto','ingeniero','ventas'])));
create policy projects_delete on public.projects for delete to authenticated using ((select public.has_role(array['admin'])));

-- Función auxiliar: ¿puede el usuario ver / editar este proyecto?
create or replace function public.can_see_project(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects p where p.id = p_id
    and (p.owner_id = (select auth.uid()) or p.referred_by = (select auth.uid())
         or public.has_role(array['admin','arquitecto','ingeniero','ventas'])));
$$;
create or replace function public.can_edit_project(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects p where p.id = p_id
    and (p.owner_id = (select auth.uid()) or public.has_role(array['admin','arquitecto','ingeniero','ventas'])));
$$;
revoke execute on function public.can_see_project(uuid), public.can_edit_project(uuid) from public, anon;
grant execute on function public.can_see_project(uuid), public.can_edit_project(uuid) to authenticated;

-- project_versions: se leen con el proyecto; nadie las edita (son historial)
create policy versions_select on public.project_versions for select to authenticated using (public.can_see_project(project_id));
create policy versions_insert on public.project_versions for insert to authenticated
  with check (public.can_edit_project(project_id) and created_by = (select auth.uid()));

-- budgets y partidas
create policy budgets_select on public.budgets for select to authenticated using (public.can_see_project(project_id));
create policy budgets_insert on public.budgets for insert to authenticated
  with check (public.can_edit_project(project_id) and created_by = (select auth.uid()));
create policy budgets_update on public.budgets for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
create policy budgets_delete on public.budgets for delete to authenticated
  using (public.can_edit_project(project_id) and status = 'borrador');

create policy items_select on public.budget_items for select to authenticated
  using (exists (select 1 from public.budgets b where b.id = budget_id and public.can_see_project(b.project_id)));
create policy items_insert on public.budget_items for insert to authenticated
  with check (exists (select 1 from public.budgets b where b.id = budget_id and b.status = 'borrador' and public.can_edit_project(b.project_id)));
create policy items_update on public.budget_items for update to authenticated
  using (exists (select 1 from public.budgets b where b.id = budget_id and b.status = 'borrador' and public.can_edit_project(b.project_id)))
  with check (exists (select 1 from public.budgets b where b.id = budget_id and b.status = 'borrador' and public.can_edit_project(b.project_id)));
create policy items_delete on public.budget_items for delete to authenticated
  using (exists (select 1 from public.budgets b where b.id = budget_id and b.status = 'borrador' and public.can_edit_project(b.project_id)));

-- leads: ventas/admin ven todos; el distribuidor ve los que trajo con su código; se escriben por RPC
create policy leads_select on public.leads for select to authenticated
  using (distributor_id = (select auth.uid()) or (select public.has_role(array['admin','ventas'])));
create policy leads_update on public.leads for update to authenticated
  using (distributor_id = (select auth.uid()) or (select public.has_role(array['admin','ventas'])))
  with check (distributor_id = (select auth.uid()) or (select public.has_role(array['admin','ventas'])));

-- commissions: el distribuidor lee las suyas; solo admin escribe (el alta es automática)
create policy com_select on public.commissions for select to authenticated
  using (distributor_id = (select auth.uid()) or (select public.has_role(array['admin'])));
create policy com_insert on public.commissions for insert to authenticated with check ((select public.has_role(array['admin'])));
create policy com_update on public.commissions for update to authenticated
  using ((select public.has_role(array['admin']))) with check ((select public.has_role(array['admin'])));

-- activity_log
create policy log_select on public.activity_log for select to authenticated using ((select public.has_role(array['admin'])));
create policy log_insert on public.activity_log for insert to authenticated with check (user_id = (select auth.uid()));

-- Un distribuidor solo puede cambiar el estado de sus prospectos, no reasignarlos
create or replace function public.leads_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- service_role (backend) y staff pasan; el resto, limitado
  if current_user not in ('authenticated','anon') or public.has_role(array['admin','ventas']) then return new; end if;
  if new.distributor_id is distinct from old.distributor_id or new.email <> old.email
     or new.request_id <> old.request_id or new.ref_code is distinct from old.ref_code then
    raise exception 'Solo puedes cambiar el estado del prospecto';
  end if;
  return new;
end $$;
create trigger leads_guard before update on public.leads
  for each row execute function public.leads_guard();

-- =========================================================
-- 10. Storage: buckets privados para renders y planos
--     Ruta de cada archivo: <project_id>/<version>/<archivo>
-- =========================================================
insert into storage.buckets (id, name, public) values ('renders','renders', false), ('planos','planos', false)
  on conflict (id) do nothing;

create policy storage_read on storage.objects for select to authenticated
  using (bucket_id in ('renders','planos')
         and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then public.can_see_project(((storage.foldername(name))[1])::uuid) else false end);
create policy storage_write on storage.objects for insert to authenticated
  with check (bucket_id in ('renders','planos')
         and case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then public.can_edit_project(((storage.foldername(name))[1])::uuid) else false end);

-- =========================================================
-- 11. Datos iniciales: plan de compensación de la maqueta (valores de ejemplo)
-- =========================================================
with p as (insert into public.compensation_plans(name, active) values ('Plan inicial (ejemplo)', true) returning id)
insert into public.plan_ranks(plan_id, rank, sort_order, min_monthly_volume, pct_direct, pct_level1, pct_level2)
select p.id, r.rank, r.ord, r.vol, r.d, r.l1, r.l2 from p, (values
  ('bronce',   1,      0, 8, 0, 0),
  ('plata',    2,  50000, 10, 3, 0),
  ('oro',      3, 100000, 12, 4, 2),
  ('platino',  4, 178000, 14, 5, 3),
  ('diamante', 5, 400000, 16, 6, 4)) as r(rank, ord, vol, d, l1, l2);
