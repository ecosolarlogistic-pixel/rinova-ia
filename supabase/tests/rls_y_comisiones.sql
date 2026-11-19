\set ON_ERROR_STOP 0
-- usuarios: admin, distribuidores A (sponsor) -> B -> C, cliente X
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','admin@x','{"full_name":"Admin"}'),
 ('00000000-0000-0000-0000-0000000000a1','a@x','{"full_name":"Ana"}'),
 ('00000000-0000-0000-0000-0000000000b1','b@x','{"full_name":"Beto"}'),
 ('00000000-0000-0000-0000-0000000000c1','c@x','{"full_name":"Caro"}'),
 ('00000000-0000-0000-0000-0000000000d1','x@x','{"full_name":"Cliente"}');
select count(*) perfiles_creados from profiles;
insert into user_roles values ('00000000-0000-0000-0000-00000000000a','admin');
insert into distributors(user_id,sponsor_id,ref_code,rank) values
 ('00000000-0000-0000-0000-0000000000a1',null,'ana','oro'),
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','beto','plata'),
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','caro','bronce');
-- prospecto anónimo con código de Caro
set role anon;
select registrar_prospecto(gen_random_uuid(),'Juan Pérez','5512345678','JUAN@mail.com','casa','CDMX','hola','caro');
select count(*) from leads; -- debe fallar (anon sin permiso)
reset role;
-- cliente crea proyecto referido por Caro? (no puede poner referred_by en update; en insert sí: ok, lo valida staff luego)
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000d1';
insert into projects(name,city,referred_by) values ('Malo','cdmx','00000000-0000-0000-0000-0000000000c1');
insert into projects(name,city) values ('Casa Lomas','cdmx') returning code;
reset role; update projects set referred_by='00000000-0000-0000-0000-0000000000c1'; set role authenticated;
insert into project_versions(project_id,params) select id,'{"front":18}' from projects;
insert into project_versions(project_id,params) select id,'{"front":20}' from projects;
select version_no from project_versions order by 1;
insert into budgets(project_id) select id from projects returning id;
insert into budget_items(budget_id,category,description,unit,quantity,unit_price) select id,'estructura','Concreto f''c 250','m3',10,2500 from budgets;
select subtotal,total from budgets;
update projects set status='contratado', contract_value=1000000; -- debe fallar
select count(*) leads_que_ve_cliente from leads;
reset role;
-- Caro ve su prospecto
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000c1';
select name, distributor_id is not null as asignado from leads;
select count(*) proyectos_que_ve_caro from projects;
update projects set name='hack'; select name from projects;
reset role;
-- admin marca contratado -> comisiones en cadena
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
update projects set status='contratado', contract_value=1000000;
reset role;
select d.ref_code, c.level, c.rank_at_calc, c.pct, c.amount from commissions c join distributors d on d.user_id=c.distributor_id order by level;
-- Beto ve solo su comisión y su red
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select level, amount from commissions;
select * from distributor_summary();
select full_name, rank, level from distributor_network();
select count(*) dist_visibles from distributors;
insert into commissions(distributor_id,project_id,level,rank_at_calc,pct,base_amount,amount,period) select user_id,(select id from projects),0,'x',1,1,1,current_date from distributors; -- debe fallar
reset role;
-- Ana
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
select full_name, rank, level from distributor_network();
reset role;
