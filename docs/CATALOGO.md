# Catálogo de obra

Página: `sitio/catalogo.html` (dentro del portal interno, requiere sesión). Datos: Supabase, migraciones
`20261123180000_catalogo_conceptos.sql` (esquema) y `20261123180100_catalogo_base.sql` (catálogo inicial).

## Cómo se calcula un precio

| Nivel | Tabla | Qué guarda |
|---|---|---|
| Partida | `cat_partidas` | 13 partidas: preliminares, cimentación, estructura, albañilería, hidrosanitaria, eléctrica, gas, acabados, impermeabilización, cancelería, muebles, exteriores, limpieza |
| Insumo | `cat_insumos` | Material, mano de obra (cuadrilla por jornada, salario real) o equipo, con su costo en MXN sin IVA |
| Concepto | `cat_conceptos` | Clave (ALB-002), descripción, unidad y costos de material, mano de obra y equipo |
| Análisis (APU) | `cat_concepto_insumos` | Cantidad de cada insumo por unidad de concepto, con desperdicio |

`P.U. = costo directo × (1 + indirectos) × (1 + financiamiento) × (1 + utilidad)`. Los factores por omisión
están en `cat_parametros` (12 %, 1.5 %, 10 %); cada presupuesto puede tener los suyos.

La base recalcula sola: si cambia el costo de un insumo o la composición de un concepto, se actualizan
todos los conceptos que lo usan. Cada partida de un presupuesto guarda una copia del costo al agregarla,
así un cambio de precios no altera presupuestos ya enviados; «Actualizar precios» los trae al día.

## Presupuesto por obra

Usa `budgets` y `budget_items` (ligados a `projects` y, si existe, a `obras` del portal interno por `obra_id`).
Se agregan conceptos con `presupuesto_agregar_conceptos()`, se capturan cantidades y la base calcula P.U.,
importes, subtotal, IVA y total. Solo se edita en estado «Borrador». Se admiten conceptos extraordinarios.

Exportación:
- **PDF** (ventana de impresión, tamaño carta): datos de la obra, partidas con subtotales, resumen por partida,
  total con importe en letra, notas, firmas, y opcionalmente explosión de insumos y análisis de precios unitarios.
- **Excel** (.xlsx con fórmulas): hojas Presupuesto, Resumen y Explosión de insumos. El catálogo se exporta con
  hojas Catálogo (P.U. recalculable con los factores), Insumos y APU.

## Permisos

Leen: admin, administración, arquitectura, ingeniería, supervisión y ventas. Editan catálogo e insumos:
admin, arquitectura e ingeniería. Partidas y factores por omisión: solo admin. Clientes no ven el catálogo.

## Precios de referencia

Los costos iniciales son de referencia (nov 2026, centro de México) para arrancar; conviene ajustarlos a cada
plaza y proveedor en «Insumos y precios» antes de presupuestar.

Pruebas: `supabase/tests/catalogo.sql` (correr después de `stub_supabase.sql` y las migraciones).
