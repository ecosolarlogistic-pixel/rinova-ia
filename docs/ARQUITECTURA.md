# Arquitectura de RINOVAIA

> Nov 2026: la marca pasó a **RINOVAIA** (Manual de Marca v1.0). La plataforma se organiza en los módulos
> del manual: Proyectos, Planos, Estructuras, Obra, Administración y RINOVAIA AI. Las secciones de abajo
> describen el backend previsto; los nombres históricos ("Rinova IA", "comité") se conservan como referencia.

Basada en *Rinova IA — Documentación Maestra y Prompt Arquitectónico-IT v1.0.0*.

## 1. Vista general

```
 Navegador (Hostinger, estático)          Backend de IA (servidor con GPU)            Datos
 ───────────────────────────────          ─────────────────────────────────          ─────────────
 index.html   landing + prospectos  ──►  Supabase RPC registrar_prospecto  ───────►  leads
 app.html     Estudio de diseño     ──►  API /api/v1  (FastAPI, Python)              Supabase Postgres
                                          ├─ Orquestador "Core Prompt v1.0" (LLM)     + Storage privado
                                          ├─ Motor generativo  (difusión, PyTorch/CUDA)  renders/
                                          ├─ Cálculo estructural (FEA, Python)            planos/
                                          ├─ Planos y unifilares (DXF/SVG, WebAssembly)
                                          └─ Metrajes y costos
 distribuidores.html  portal         ──►  Supabase RPC distributor_summary()
```

Hostinger compartido sirve el frontend. Los módulos de IA necesitan GPU, así que viven fuera
(por ejemplo un VPS con GPU, Modal, RunPod o un clúster propio) y se exponen como API HTTPS.

## 2. El comité (prompt maestro)

El orquestador recibe los parámetros del Estudio y ejecuta el prompt de sistema
`[SISTEMA: RINOVA IA - CORE PROMPT v1.0]` con tres roles que se revisan entre sí:

| Rol | Responsabilidad | Herramienta que llama |
|---|---|---|
| I. Arquitecto Principal | Composición con proporción áurea, normativa urbana | Motor generativo, generador de planta |
| II. Ingeniero Civil Estructural | Cargas, sismo, dimensionamiento | Módulo FEA |
| III. Lead Software Architect & AI Engineer | Visión artificial, difusión, coherencia entre entregables | Vectores DXF/SVG, metrajes |

Regla de gobernanza: si el Ingeniero marca un elemento con uso > 100 % o el desplazamiento supera el
límite, el Arquitecto recibe el hallazgo y propone otra composición antes de entregar.

## 3. Módulos (de la documentación)

| Módulo | Stack | Criterio | En la maqueta |
|---|---|---|---|
| Motor generativo (renders) | Diffusion models + PyTorch / CUDA | Iluminación por latitud y proporción renacentista | `facade.js` dibuja la fachada paramétrica y calcula el sol |
| Cálculo estructural | FEA + backend Python | Validación de vigas, columnas y cimentación | `compute()` en `estudio.js` con fórmulas simplificadas |
| Planos y unifilares | Generador DXF/SVG + WebAssembly | Trazo limpio, cotas normalizadas, capas | `renderPlan()` y `renderUnifilar()`; exporta SVG |
| Costos | Metrajes inteligentes | Tiempo real | `compute()` → partidas |

## 4. Contrato de API propuesto

Todas las rutas con `Authorization: Bearer <JWT de Supabase>`.

```
POST /api/v1/proyectos                      → crea proyecto            { id, code }
POST /api/v1/proyectos/{id}/generar         → corre el comité          { version_id, job_id }
GET  /api/v1/jobs/{job_id}                  → progreso por rol         { step, role, pct, done }
GET  /api/v1/proyectos/{id}/versiones/{v}   → resultados               { render_url, structure[], electrical{}, costs{} }
GET  /api/v1/proyectos/{id}/versiones/{v}/dxf  → URL firmada del DXF por capas
```

Cuerpo de `generar` (lo mismo que hoy guarda el Estudio en `localStorage`):

```json
{ "front": 18, "depth": 22, "floors": 3, "bays": 7, "style": "renacentista",
  "use": "res", "finish": "pre", "city": "cdmx", "palette": "travertino", "month": 6, "hour": 17 }
```

Para conectar, solo cambia `compute()` en `estudio.js` por una llamada a esta API; las funciones de
dibujo ya reciben el objeto de resultados.

## 5. Datos

Migración en `supabase/migrations/20261118150000_esquema_inicial.sql`.

| Área | Tablas | Notas |
|---|---|---|
| Usuarios | `profiles`, `user_roles` | Perfil y rol `cliente` se crean solos al registrarse. Roles: admin, arquitecto, ingeniero, ventas, distribuidor, cliente |
| Estudio | `projects`, `project_versions` | Código `RV-1001…`; cada "Generar" es una versión numerada con `params`, `structure`, `electrical`, render y DXF |
| Presupuestos | `budgets`, `budget_items` | Importe por partida y totales con IVA calculados en la base; solo se editan en borrador |
| Prospectos | `leads` | La landing escribe por la RPC `registrar_prospecto` (anti-spam, resuelve el código del distribuidor) |
| Red | `distributors`, `compensation_plans`, `plan_ranks` | Plan configurable con un solo plan activo; precargado con los valores de ejemplo del portal |
| Comisiones | `commissions` | Se generan solas al marcar un proyecto `contratado` con valor: directa + 2 niveles de red, según el rango de cada quien |
| Auditoría | `activity_log` | Solo insert y lectura de admin |

Seguridad: RLS en todas las tablas, nada directo para `anon`. Clientes ven sus proyectos, distribuidores
los que trajeron y sus prospectos, personal interno todo. Solo admin/ventas asignan distribuidor, fijan
valor del contrato o marcan "contratado". El portal lee por `distributor_summary()` y
`distributor_network()`. Renders y planos van en buckets privados `renders/` y `planos/` con ruta
`<project_id>/…`.

Proyecto Supabase: `rinova-ia` (organización Qualifika360, plan gratuito, us-east-1),
URL `https://evjoqaphylggvojthezj.supabase.co`. Para el navegador se usa la clave publicable
(`sb_publishable_…`, en el panel de Supabase → Settings → API Keys); la `service_role` solo en el backend.

Pruebas: `supabase/tests/` (se corren contra un Postgres local con `stub_supabase.sql`).

## 6. Próximos pasos sugeridos

1. ~~Conectar el formulario de la landing~~ (hecho: `index.html` llama a `registrar_prospecto`; acepta `?ref=codigo`).
2. Acceso (enlace mágico) para Estudio y portal; guardar proyectos en `projects`.
3. Primer servicio real: orquestador del prompt maestro + render por difusión.
4. FEA real y exportación DXF por capas.
5. Plan de compensación definitivo configurado desde un panel interno.
