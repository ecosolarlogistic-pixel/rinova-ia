-- Rinova IA · Catálogo de conceptos de obra y presupuesto por obra
-- Cambios solo aditivos: tablas nuevas cat_* y columnas nuevas en budgets / budget_items.
--
-- Modelo (análisis de precio unitario, APU):
--   insumo   = material, mano de obra (cuadrilla por jornada) o equipo/herramienta, con su costo
--   concepto = clave + descripción + unidad, dentro de una partida; su costo directo se arma con
--              insumos × cantidad por unidad de concepto (cat_concepto_insumos)
--   PU       = costo directo × (1 + indirectos) × (1 + financiamiento) × (1 + utilidad)
-- Los costos del concepto se recalculan solos en la base al cambiar insumos o su composición.
-- Cada partida de un presupuesto guarda una copia del costo al momento de agregarla, para que
-- un cambio de precios en el catálogo no altere presupuestos ya enviados.

-- =========================================================
-- 1. Catálogo
-- =========================================================
create table public.cat_partidas (
  id smallint generated always as identity primary key,
  clave text unique not null check (clave ~ '^[0-9]{2}$'),
  nombre text not null check (length(nombre) between 2 and 80),
  orden smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.cat_insumos (
  id bigint generated always as identity primary key,
  clave text unique not null check (clave ~ '^[A-Z]{2,4}-[0-9]{3}$'),
  tipo text not null check (tipo in ('material','mano_obra','equipo')),
  descripcion text not null check (length(descripcion) between 2 and 200),
  unidad text not null check (length(unidad) between 1 and 12),
  costo numeric(14,2) not null check (costo >= 0),
  activo boolean not null default true,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cat_insumos_tipo_idx on public.cat_insumos (tipo);
create index cat_insumos_updated_by_idx on public.cat_insumos (updated_by);
create trigger cat_insumos_updated before update on public.cat_insumos
  for each row execute function public.set_updated_at();

create table public.cat_conceptos (
  id bigint generated always as identity primary key,
  clave text unique not null check (clave ~ '^[A-Z]{2,4}-[0-9]{3}$'),
  partida_id smallint not null references public.cat_partidas(id),
  descripcion text not null check (length(descripcion) between 5 and 600),
  unidad text not null check (length(unidad) between 1 and 12),
  costo_material numeric(14,2) not null default 0,
  costo_mano_obra numeric(14,2) not null default 0,
  costo_equipo numeric(14,2) not null default 0,
  costo_directo numeric(14,2) generated always as (costo_material + costo_mano_obra + costo_equipo) stored,
  activo boolean not null default true,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cat_conceptos_partida_idx on public.cat_conceptos (partida_id);
create index cat_conceptos_updated_by_idx on public.cat_conceptos (updated_by);
create trigger cat_conceptos_updated before update on public.cat_conceptos
  for each row execute function public.set_updated_at();

create table public.cat_concepto_insumos (
  concepto_id bigint not null references public.cat_conceptos(id) on delete cascade,
  insumo_id bigint not null references public.cat_insumos(id),
  cantidad numeric(14,5) not null check (cantidad > 0),   -- por unidad de concepto (incluye desperdicio)
  primary key (concepto_id, insumo_id)
);
create index cat_concepto_insumos_insumo_idx on public.cat_concepto_insumos (insumo_id);

-- Factores de sobrecosto por omisión para presupuestos nuevos (una sola fila)
create table public.cat_parametros (
  id boolean primary key default true check (id),
  indirectos_pct numeric(5,2) not null default 12 check (indirectos_pct between 0 and 100),
  financiamiento_pct numeric(5,2) not null default 1.5 check (financiamiento_pct between 0 and 100),
  utilidad_pct numeric(5,2) not null default 10 check (utilidad_pct between 0 and 100),
  vigencia text not null default 'Precios de referencia nov 2026, centro de México',
  updated_at timestamptz not null default now()
);
insert into public.cat_parametros default values;
create trigger cat_parametros_updated before update on public.cat_parametros
  for each row execute function public.set_updated_at();

-- Recalcula los costos de uno o varios conceptos a partir de su composición
create or replace function public.cat_recalc_conceptos(p_ids bigint[])
returns void language sql security definer set search_path = '' as $$
  update public.cat_conceptos c set
    costo_material  = coalesce(s.mat, 0),
    costo_mano_obra = coalesce(s.mo, 0),
    costo_equipo    = coalesce(s.eq, 0)
  from (
    select x.id,
      round(sum(ci.cantidad * i.costo) filter (where i.tipo = 'material'), 2)  mat,
      round(sum(ci.cantidad * i.costo) filter (where i.tipo = 'mano_obra'), 2) mo,
      round(sum(ci.cantidad * i.costo) filter (where i.tipo = 'equipo'), 2)    eq
    from unnest(p_ids) x(id)
    left join public.cat_concepto_insumos ci on ci.concepto_id = x.id
    left join public.cat_insumos i on i.id = ci.insumo_id
    group by x.id) s
  where c.id = s.id;
$$;
revoke execute on function public.cat_recalc_conceptos(bigint[]) from public, anon, authenticated;

create or replace function public.cat_composicion_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.cat_recalc_conceptos(array(
    select distinct v from unnest(array[
      case when tg_op <> 'INSERT' then old.concepto_id end,
      case when tg_op <> 'DELETE' then new.concepto_id end]) v where v is not null));
  return null;
end $$;
revoke execute on function public.cat_composicion_changed() from public, anon, authenticated;
create trigger cat_concepto_insumos_recalc after insert or update or delete on public.cat_concepto_insumos
  for each row execute function public.cat_composicion_changed();

create or replace function public.cat_insumo_costo_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.cat_recalc_conceptos(array(
    select concepto_id from public.cat_concepto_insumos where insumo_id = new.id));
  return null;
end $$;
revoke execute on function public.cat_insumo_costo_changed() from public, anon, authenticated;
create trigger cat_insumos_recalc after update of costo, tipo on public.cat_insumos
  for each row when (old.costo is distinct from new.costo or old.tipo is distinct from new.tipo)
  execute function public.cat_insumo_costo_changed();

-- Los costos del concepto solo los escribe la base (salvo conceptos sin composición, que se capturan a mano)
create or replace function public.cat_conceptos_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated','anon')
     and pg_trigger_depth() = 1
     and exists (select 1 from public.cat_concepto_insumos where concepto_id = new.id) then
    new.costo_material := old.costo_material;
    new.costo_mano_obra := old.costo_mano_obra;
    new.costo_equipo := old.costo_equipo;
  end if;
  return new;
end $$;
create trigger cat_conceptos_guard before update on public.cat_conceptos
  for each row execute function public.cat_conceptos_guard();

-- =========================================================
-- 2. Presupuesto por obra (extiende budgets / budget_items)
-- =========================================================
alter table public.budgets
  add column nombre text check (nombre is null or length(nombre) between 1 and 120),
  add column indirectos_pct numeric(5,2) not null default 12 check (indirectos_pct between 0 and 100),
  add column financiamiento_pct numeric(5,2) not null default 1.5 check (financiamiento_pct between 0 and 100),
  add column utilidad_pct numeric(5,2) not null default 10 check (utilidad_pct between 0 and 100),
  add column obra_id uuid;   -- obra del portal interno (public.obras); la llave foránea se agrega abajo si la tabla existe
create index budgets_obra_idx on public.budgets (obra_id);
do $$ begin
  if to_regclass('public.obras') is not null then
    alter table public.budgets add constraint budgets_obra_fk foreign key (obra_id) references public.obras(id) on delete set null;
  end if;
end $$;

alter table public.budget_items
  add column concepto_id bigint references public.cat_conceptos(id) on delete set null,
  add column clave text,
  add column costo_material numeric(14,2),
  add column costo_mano_obra numeric(14,2),
  add column costo_equipo numeric(14,2);
create index budget_items_concepto_idx on public.budget_items (concepto_id);

-- Factor de sobrecosto de un presupuesto
create or replace function public.budget_factor(p_ind numeric, p_fin numeric, p_uti numeric)
returns numeric language sql immutable set search_path = '' as $$
  select (1 + p_ind / 100) * (1 + p_fin / 100) * (1 + p_uti / 100);
$$;

-- Si la partida trae desglose de costo directo, el PU se calcula con los factores del presupuesto
create or replace function public.budget_items_pu()
returns trigger language plpgsql security definer set search_path = '' as $$
declare b record;
begin
  if new.costo_material is null and new.costo_mano_obra is null and new.costo_equipo is null then
    return new;
  end if;
  select indirectos_pct, financiamiento_pct, utilidad_pct into b from public.budgets where id = new.budget_id;
  new.unit_price := round((coalesce(new.costo_material,0) + coalesce(new.costo_mano_obra,0) + coalesce(new.costo_equipo,0))
                          * public.budget_factor(b.indirectos_pct, b.financiamiento_pct, b.utilidad_pct), 2);
  return new;
end $$;
revoke execute on function public.budget_items_pu() from public, anon, authenticated;
create trigger budget_items_pu before insert or update on public.budget_items
  for each row execute function public.budget_items_pu();

-- Cambiar los factores del presupuesto reprecia todas sus partidas
create or replace function public.budget_factores_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.budget_items set unit_price = unit_price where budget_id = new.id
     and (costo_material is not null or costo_mano_obra is not null or costo_equipo is not null);
  return null;
end $$;
revoke execute on function public.budget_factores_changed() from public, anon, authenticated;
create trigger budgets_factores after update of indirectos_pct, financiamiento_pct, utilidad_pct on public.budgets
  for each row when (old.indirectos_pct is distinct from new.indirectos_pct
                  or old.financiamiento_pct is distinct from new.financiamiento_pct
                  or old.utilidad_pct is distinct from new.utilidad_pct)
  execute function public.budget_factores_changed();

-- Agrega conceptos del catálogo a un presupuesto (copia costos al momento). Respeta RLS de budget_items.
create or replace function public.presupuesto_agregar_conceptos(p_budget_id bigint, p_conceptos bigint[], p_cantidad numeric default 1)
returns int language plpgsql security invoker set search_path = '' as $$
declare v_n int; v_orden int;
begin
  if p_cantidad is null or p_cantidad < 0 then raise exception 'Cantidad inválida'; end if;
  select coalesce(max(sort_order), 0) into v_orden from public.budget_items where budget_id = p_budget_id;
  insert into public.budget_items(budget_id, sort_order, category, description, unit, quantity, unit_price,
                                  concepto_id, clave, costo_material, costo_mano_obra, costo_equipo)
  select p_budget_id, v_orden + row_number() over (order by p.orden, c.clave)::int, p.nombre, c.descripcion, c.unidad,
         p_cantidad, 0, c.id, c.clave, c.costo_material, c.costo_mano_obra, c.costo_equipo
    from public.cat_conceptos c join public.cat_partidas p on p.id = c.partida_id
   where c.id = any(p_conceptos) and c.activo
     and not exists (select 1 from public.budget_items bi where bi.budget_id = p_budget_id and bi.concepto_id = c.id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.presupuesto_agregar_conceptos(bigint, bigint[], numeric) from public, anon;
grant execute on function public.presupuesto_agregar_conceptos(bigint, bigint[], numeric) to authenticated;

-- Actualiza las partidas de un presupuesto en borrador con los costos vigentes del catálogo
create or replace function public.presupuesto_actualizar_precios(p_budget_id bigint)
returns int language plpgsql security invoker set search_path = '' as $$
declare v_n int;
begin
  update public.budget_items bi set
    costo_material = c.costo_material, costo_mano_obra = c.costo_mano_obra, costo_equipo = c.costo_equipo
  from public.cat_conceptos c
  where bi.budget_id = p_budget_id and bi.concepto_id = c.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.presupuesto_actualizar_precios(bigint) from public, anon;
grant execute on function public.presupuesto_actualizar_precios(bigint) to authenticated;

-- =========================================================
-- 3. RLS: personal interno lee (mismos roles que is_staff() del portal); admin, arquitectura e ingeniería editan
-- =========================================================
alter table public.cat_partidas enable row level security;
alter table public.cat_insumos enable row level security;
alter table public.cat_conceptos enable row level security;
alter table public.cat_concepto_insumos enable row level security;
alter table public.cat_parametros enable row level security;

grant select, insert, update, delete on public.cat_partidas, public.cat_insumos, public.cat_conceptos,
  public.cat_concepto_insumos to authenticated;
grant select, update on public.cat_parametros to authenticated;

create policy cat_partidas_select on public.cat_partidas for select to authenticated
  using ((select public.has_role(array['admin','administracion','arquitecto','ingeniero','supervisor','ventas'])));
create policy cat_partidas_insert on public.cat_partidas for insert to authenticated
  with check ((select public.has_role(array['admin'])));
create policy cat_partidas_update on public.cat_partidas for update to authenticated
  using ((select public.has_role(array['admin']))) with check ((select public.has_role(array['admin'])));

create policy cat_insumos_select on public.cat_insumos for select to authenticated
  using ((select public.has_role(array['admin','administracion','arquitecto','ingeniero','supervisor','ventas'])));
create policy cat_insumos_insert on public.cat_insumos for insert to authenticated
  with check ((select public.has_role(array['admin','arquitecto','ingeniero'])));
create policy cat_insumos_update on public.cat_insumos for update to authenticated
  using ((select public.has_role(array['admin','arquitecto','ingeniero'])))
  with check ((select public.has_role(array['admin','arquitecto','ingeniero'])));

create policy cat_conceptos_select on public.cat_conceptos for select to authenticated
  using ((select public.has_role(array['admin','administracion','arquitecto','ingeniero','supervisor','ventas'])));
create policy cat_conceptos_insert on public.cat_conceptos for insert to authenticated
  with check ((select public.has_role(array['admin','arquitecto','ingeniero'])));
create policy cat_conceptos_update on public.cat_conceptos for update to authenticated
  using ((select public.has_role(array['admin','arquitecto','ingeniero'])))
  with check ((select public.has_role(array['admin','arquitecto','ingeniero'])));
create policy cat_conceptos_delete on public.cat_conceptos for delete to authenticated
  using ((select public.has_role(array['admin']))
         and not exists (select 1 from public.budget_items bi where bi.concepto_id = cat_conceptos.id));

create policy cat_ci_select on public.cat_concepto_insumos for select to authenticated
  using ((select public.has_role(array['admin','administracion','arquitecto','ingeniero','supervisor','ventas'])));
create policy cat_ci_insert on public.cat_concepto_insumos for insert to authenticated
  with check ((select public.has_role(array['admin','arquitecto','ingeniero'])));
create policy cat_ci_update on public.cat_concepto_insumos for update to authenticated
  using ((select public.has_role(array['admin','arquitecto','ingeniero'])))
  with check ((select public.has_role(array['admin','arquitecto','ingeniero'])));
create policy cat_ci_delete on public.cat_concepto_insumos for delete to authenticated
  using ((select public.has_role(array['admin','arquitecto','ingeniero'])));

create policy cat_param_select on public.cat_parametros for select to authenticated
  using ((select public.has_role(array['admin','administracion','arquitecto','ingeniero','supervisor','ventas'])));
create policy cat_param_update on public.cat_parametros for update to authenticated
  using ((select public.has_role(array['admin']))) with check ((select public.has_role(array['admin'])));

-- Presupuestos nuevos toman los factores vigentes del catálogo
create or replace function public.budgets_factores_default()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select * into p from public.cat_parametros where id;
  if found then
    new.indirectos_pct := coalesce(nullif(new.indirectos_pct, 12), p.indirectos_pct);
    new.financiamiento_pct := coalesce(nullif(new.financiamiento_pct, 1.5), p.financiamiento_pct);
    new.utilidad_pct := coalesce(nullif(new.utilidad_pct, 10), p.utilidad_pct);
  end if;
  return new;
end $$;
revoke execute on function public.budgets_factores_default() from public, anon, authenticated;
create trigger budgets_factores_default before insert on public.budgets
  for each row execute function public.budgets_factores_default();
