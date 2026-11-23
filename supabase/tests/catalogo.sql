-- Pruebas del catálogo de conceptos y presupuesto por obra (correr tras stub_supabase.sql y las migraciones)
\set ON_ERROR_STOP 0
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000e1','ing@x'),
 ('00000000-0000-0000-0000-0000000000e2','ventas@x'),
 ('00000000-0000-0000-0000-0000000000e3','cliente@x');
insert into user_roles values ('00000000-0000-0000-0000-0000000000e1','ingeniero'),('00000000-0000-0000-0000-0000000000e2','ventas');
select count(*) partidas from cat_partidas; select count(*) insumos from cat_insumos; select count(*) conceptos from cat_conceptos;
select count(*) conceptos_sin_costo from cat_conceptos where costo_directo = 0;
select clave, costo_material, costo_mano_obra, costo_equipo, costo_directo from cat_conceptos where clave in ('ALB-002','EST-006');

-- cliente no ve el catálogo
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000e3';
select count(*) cliente_ve_conceptos from cat_conceptos;
-- ventas lee, no edita
set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000e2';
select count(*) ventas_ve_conceptos from cat_conceptos;
update cat_insumos set costo = 1 where clave='MAT-021'; select costo ventas_no_cambio from cat_insumos where clave='MAT-021';
-- ingeniero sube el block 15: el concepto ALB-002 se recalcula solo
set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000e1';
update cat_insumos set costo = 20 where clave='MAT-021';
select clave, costo_material from cat_conceptos where clave='ALB-002';
-- no puede forzar a mano el costo de un concepto con composición
update cat_conceptos set costo_material = 1 where clave='ALB-002';
select costo_material forzado_ignorado from cat_conceptos where clave='ALB-002';
-- proyecto y presupuesto
insert into projects(name,city) values ('Casa Prueba','Querétaro') returning id \gset
insert into budgets(project_id, nombre) values (:'id', 'Presupuesto base') returning id bid, indirectos_pct, utilidad_pct \gset
select presupuesto_agregar_conceptos(:bid, array(select id from cat_conceptos where clave in ('ALB-002','EST-006','ACA-001')), 10);
select presupuesto_agregar_conceptos(:bid, array(select id from cat_conceptos where clave in ('ALB-002')), 10) repetido_no_duplica;
update budget_items set quantity = 120 where clave='ALB-002';
select clave, quantity, unit_price, amount from budget_items where budget_id=:bid order by sort_order;
select subtotal, total from budgets where id=:bid;
-- cambiar la utilidad reprecia
update budgets set utilidad_pct = 15 where id=:bid;
select clave, unit_price from budget_items where budget_id=:bid order by sort_order;
select subtotal, total from budgets where id=:bid;
-- cliente no puede leer ni agregar al presupuesto ajeno
set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000e3';
select count(*) cliente_ve_partidas from budget_items;
select presupuesto_agregar_conceptos(:bid, array[1::bigint], 1) cliente_agrega;
reset role;
