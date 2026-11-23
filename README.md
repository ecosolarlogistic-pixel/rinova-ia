# RINOVAIA · plataforma web

**Diseña. Construye. Administra.** Arquitectura, ingeniería, control de obra y administración de proyectos
en una sola plataforma. Identidad aplicada según el *Manual de Marca RINOVAIA v1.0* (ver [`docs/MARCA.md`](docs/MARCA.md)).

Este repositorio contiene la **versión premium de la maqueta funcional**: sitio público, plataforma de
proyectos, portal de distribuidores y app instalable, lista para publicarse en Hostinger.

## Qué hay

| Pantalla | Archivo | Qué hace hoy |
|---|---|---|
| Sitio público | `sitio/index.html` | Hero con la promesa de marca, pilares de servicio, módulos de la plataforma, proceso de la idea a la entrega, RINOVAIA AI, roles, distribuidores, planes Básico / Profesional / Empresarial, preguntas y formulario de cotización (guarda prospectos en Supabase). |
| Plataforma | `sitio/app.html` | **Proyectos** (cartera con etapa, avance y presupuesto), **Estudio de diseño** (parámetros que recalculan visualización, estructura, planos y presupuesto), **Planos** (capas, unifilar, archivos y versiones con «Subir planos»), **Estructuras**, **Obra** (programa de obra, bitácora, «Registrar avance», «Agregar incidencia», «Generar reporte»), **Administración** (presupuesto por partidas MXN/USD), **RINOVAIA AI** (asistente con respuestas a partir de los datos del proyecto) y modo presentación con envío por WhatsApp. |
| Portal de distribuidores | `sitio/distribuidores.html` | Rango y avance, comisiones, enlace de referido, ranking, prospectos, árbol de red, agenda, kit de presentación y plan de compensación. |
| App instalable | `sitio/manifest*.webmanifest`, `sitio/sw.js`, `sitio/pwa.js` | Funciona sin conexión para lo ya visitado y muestra el botón "Instalar app". |

> Los cálculos son **fórmulas simplificadas de demostración** (marcadas en pantalla) y RINOVAIA AI es una
> demostración con reglas. La bitácora, incidencias y archivos se guardan solo en el navegador. En producción
> los sustituyen los módulos de `docs/ARQUITECTURA.md` y las tablas de Supabase.

## Estructura

```
sitio/                      ← lo único que se publica en public_html
  index.html  app.html  distribuidores.html  offline.html
  manifest.webmanifest  instalar.html  sw.js  pwa.js  favicon.ico  .htaccess
  assets/css/rinova.css           sistema visual: tokens de color, tipografía, botones y estados del manual
  assets/js/facade.js             generador paramétrico de fachadas (SVG), con anochecer y concreto aparente
  assets/js/estudio.js            lógica del Estudio, proyectos y presentación
  assets/js/fachada.js            mejora de fachada: estilos, materiales, elementos, alzado a color y costo
  assets/js/render3d.js           render 3D con giro 360°, captura y video (three.js en assets/js/vendor, MIT)
  assets/js/fachada-ui.js         vistas Mejorar fachada y Render 3D dentro de Planos
  assets/js/recorrido.js          recorrido virtual del interior por planta: muros, puertas, ventanas, escalera y mobiliario PBR
  assets/js/recorrido-ui.js       vista Recorrido virtual dentro de Planos (planta, espacios, hora, recorrido guiado, foto)
  assets/js/plataforma.js         Obra, archivos de planos y RINOVAIA AI
  assets/fonts/*.woff2            Montserrat e Inter autoalojadas (+ licencias OFL)
  assets/img/                     isotipo (color, claro, blanco, negro, plata), logo circular, iconos, hero y OG
supabase/migrations/        esquema de datos
docs/MARCA.md               cómo se aplicó el manual de marca
docs/APP-INSTALABLE.md      app instalable en PC, Mac, Android, iPhone y iPad (PWA) y siguientes pasos a tiendas
docs/ARQUITECTURA.md        módulos, API y cómo encaja el prompt maestro
docs/DESPLIEGUE.md          GitHub → Hostinger paso a paso
docs/capturas/              capturas de escritorio y móvil
.github/workflows/          copia sitio/ a la rama produccion (Hostinger la publica sola)
```

Sin frameworks ni build: HTML, CSS y JavaScript puro. Se abre con doble clic o con cualquier servidor estático.

## Verlo en tu computadora

```bash
cd sitio
python3 -m http.server 8080
# abre http://localhost:8080
```

## Publicar

Publicado en https://www.rinovaia.com. Cada cambio en `sitio/` que llega a `main` se copia a la rama
`produccion`, y Hostinger la publica sola. Detalles en [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

## Reglas del proyecto

1. Cero secretos en el código. En el navegador solo van la URL de Supabase y su llave pública (anon).
2. Nada sale a producción sin respaldo, confirmación y verificación en vivo.
3. `main` es la fuente de verdad: lo publicado se puede reconstruir desde aquí.
4. La seguridad vive en la base de datos (RLS), no en ocultar botones.
5. Todo texto dinámico pasa por `esc()` antes de entrar a `innerHTML`.
