# Rinova AI · plataforma web

Arquitectura renacentista, IA generativa e ingeniería en una sola plataforma.
Este repositorio contiene la **maqueta funcional premium** de la plataforma: sitio público, Estudio de
diseño, portal de distribuidores y app instalable, lista para versionarse en GitHub y publicarse en Hostinger.

## Qué hay

| Pantalla | Archivo | Qué hace hoy |
|---|---|---|
| Landing pública | `sitio/index.html` | Propuesta de valor, el comité de expertos, los 4 entregables, tecnología, gobernanza, distribuidores, planes, preguntas y formulario de contacto. |
| Estudio de diseño | `sitio/app.html` | Parámetros del proyecto y resultados que se recalculan al instante: render con sol según latitud, mes y hora; cálculo estructural con % de uso; planta con capas (arquitectónico, cotas, eléctrico, hidráulico) y unifilar; presupuesto por partidas en MXN/USD; modo presentación con envío por WhatsApp; biblioteca de proyectos; exportación del plano en SVG. |
| Portal de distribuidores | `sitio/distribuidores.html` | Rango y avance, comisiones, enlace de referido, ranking, prospectos, árbol de red, agenda, kit de presentación y plan de compensación. |
| App instalable | `sitio/manifest*.webmanifest`, `sitio/sw.js`, `sitio/pwa.js` | Funciona sin conexión para lo ya visitado y muestra el botón "Instalar app". |

> Los cálculos del Estudio son **fórmulas simplificadas de demostración** (están marcadas en pantalla).
> En producción los sustituyen los módulos de la arquitectura descrita en `docs/ARQUITECTURA.md`.

## Estructura

```
sitio/                      ← lo único que se publica en public_html
  index.html  app.html  distribuidores.html  offline.html
  manifest.webmanifest  manifest-app.webmanifest  sw.js  pwa.js  .htaccess
  assets/css/rinova.css           sistema visual (tokens, tipografía, botones)
  assets/js/facade.js             generador paramétrico de fachadas (SVG)
  assets/js/estudio.js            lógica del Estudio
  assets/fonts/*.woff2            Cormorant Garamond y Manrope autoalojadas (+ licencias OFL)
  assets/img/                     logo, iconos de la app, imagen para compartir (1200×630)
supabase/migrations/        esquema de datos (borrador, no aplicado)
docs/ARQUITECTURA.md        módulos, API y cómo encaja el prompt maestro
docs/DESPLIEGUE.md          GitHub → Hostinger paso a paso
.github/workflows/          publicación automática por FTP al hacer merge a main
```

Sin frameworks ni build: HTML, CSS y JavaScript puro. Se abre con doble clic o con cualquier servidor estático.

## Verlo en tu computadora

```bash
cd sitio
python3 -m http.server 8080
# abre http://localhost:8080
```

## Publicar

Ver [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md). Resumen: sube el contenido de `sitio/` a `public_html`
del dominio, o configura los tres secretos FTP en GitHub y cada merge a `main` se publica solo.

## Reglas del proyecto

1. Cero secretos en el código. En el navegador solo van la URL de Supabase y su llave pública (anon).
2. Nada sale a producción sin respaldo, confirmación y verificación en vivo.
3. `main` es la fuente de verdad: lo publicado se puede reconstruir desde aquí.
4. La seguridad vive en la base de datos (RLS), no en ocultar botones.
5. Todo texto dinámico pasa por `esc()` antes de entrar a `innerHTML`.
