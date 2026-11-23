-- Partida 14 del catálogo de obra: energía solar, baterías y movilidad eléctrica.
-- Precios de referencia (MXN, nov 2026, centro de México), mismos que usa el Estudio de diseño.
insert into public.cat_partidas(clave,nombre,orden) values
  ('14','Energía solar y movilidad eléctrica',14)
on conflict (clave) do nothing;

insert into public.cat_insumos(clave,tipo,descripcion,unidad,costo,updated_by) values
  ('MAT-096','material','Módulo fotovoltaico monocristalino 550 W, 144 celdas, garantía 25 años','pza',2450,null),
  ('MAT-097','material','Inversor de cadena interconectado a red (o microinversores equivalentes), por kW','kW',3200,null),
  ('MAT-098','material','Estructura de aluminio para azotea plana o teja, por módulo, con tornillería inoxidable','pza',650,null),
  ('MAT-099','material','Cable solar 6 mm², conectores MC4, protecciones CD/CA y canalización, por kWp','kWp',1400,null),
  ('MAT-100','material','Batería de litio ferrofosfato (LFP) para almacenamiento, por kWh útil','kWh',7800,null),
  ('MAT-101','material','Inversor híbrido / aislado con cargador de baterías, por kW','kW',4800,null),
  ('MAT-102','material','Cargador para auto eléctrico nivel 2, 7.2 kW, 32 A, conector J1772 / Tipo 2','pza',15500,null),
  ('MAT-103','material','Interruptor 2P-40A, cable THW 8 AWG y canalización para cargador (hasta 15 m)','lote',4200,null),
  ('MAT-104','material','Gestoría de interconexión ante CFE: solicitud, diagrama unifilar y medidor bidireccional','lote',6500,null),
  ('MO-016','mano_obra','Cuadrilla instalador fotovoltaico (técnico certificado + ayudante)','jor',2800,null)
on conflict (clave) do nothing;

insert into public.cat_conceptos(clave,partida_id,descripcion,unidad,updated_by)
select v.clave, p.id, v.d, v.u, null from (values
  ('FVS-001','14','Sistema fotovoltaico interconectado a red, por kWp instalado: módulos de 550 W, inversor, estructura, cableado, protecciones y puesta en marcha','kWp'),
  ('FVS-002','14','Trámite de interconexión con CFE y cambio a medidor bidireccional','lote'),
  ('FVS-003','14','Banco de baterías de litio LFP instalado en muro o gabinete, por kWh útil, incluye cableado y protecciones','kWh'),
  ('FVS-004','14','Inversor híbrido / aislado instalado, por kW, con programación de respaldo o sistema aislado','kW'),
  ('FVS-005','14','Cargador para auto eléctrico nivel 2 de 7.2 kW instalado en estacionamiento, con circuito dedicado 2P-40A','pza')
) v(clave,partida,d,u) join public.cat_partidas p on p.clave = v.partida
on conflict (clave) do nothing;

-- Composición por unidad de concepto. EQ-001 (herramienta menor) = jornadas de cuadrilla.
insert into public.cat_concepto_insumos(concepto_id,insumo_id,cantidad)
select c.id, i.id, split_part(x,':',2)::numeric from (values
  ('FVS-001','MAT-096:1.82 MAT-097:1 MAT-098:1.82 MAT-099:1 MO-016:0.45 EQ-001:0.45'),
  ('FVS-002','MAT-104:1 MO-005:0.5'),
  ('FVS-003','MAT-100:1 MO-016:0.06 EQ-001:0.06'),
  ('FVS-004','MAT-101:1 MO-016:0.15 EQ-001:0.15'),
  ('FVS-005','MAT-102:1 MAT-103:1 MO-005:0.6 EQ-001:0.6')
) v(c,comp) cross join lateral string_to_table(v.comp,' ') x
join public.cat_conceptos c on c.clave=v.c join public.cat_insumos i on i.clave=split_part(x,':',1)
on conflict do nothing;
