# Aplicación del Manual de Marca RINOVAIA v1.0

Fuente: *Manual de Marca RINOVAIA* y *Prompt Maestro RINOVAIA* (noviembre 2026).

## Concepto

- Nombre: **RINOVAIA** (una palabra, en mayúsculas en el logotipo).
- Promesa: **Diseña. Construye. Administra.** Mensaje: *Del concepto a la obra, con control en cada etapa.*
- Personalidad: precisa, contemporánea, confiable, sobria. Firma tecnológica de arquitectura e ingeniería,
  no contratista genérico ni catálogo publicitario.
- Pilares: Arquitectura · Ingeniería · Control de obra · Administración.

## Color (tokens en `sitio/assets/css/rinova.css`)

| Token | HEX | Uso en el sitio |
|---|---|---|
| `--navy` Azul profundo | `#0B0F17` | Navegación, hero, barra lateral de la app, pie, modo presentación |
| `--gold` Oro premium | `#D4AF37` | Botón primario, acentos, indicadores clave. Nunca en acciones destructivas |
| `--silver` Plata titanio | `#C0C6D4` | Isotipo, líneas técnicas, bordes |
| `--mist` Gris elegante | `#F3F5F7` | Superficies de trabajo (tablas, planos, formularios) |
| `--graphite` Grafito | `#18202B` | Texto y componentes secundarios |

Sobre fondos claros, el texto dorado usa `--gold-ink` (`#8A6A12`) para mantener contraste accesible.

## Tipografía

Montserrat (títulos, Semibold) e Inter (interfaz y lectura), autoalojadas en `assets/fonts/`.
Jerarquía de la app: H1 28–32 px, H2 20–24 px, H3 16–18 px, texto 14–16 px, etiquetas 12–13 px.

## Logotipo (`sitio/assets/img/`)

| Archivo | Versión del manual | Uso |
|---|---|---|
| `isotipo.svg` | Isotipo plata/oro | Fondos oscuros (navegación, pie, app) |
| `isotipo-claro.svg` | Isotipo grafito/oro | Fondos claros y reportes |
| `isotipo-blanco.svg`, `isotipo-negro.svg`, `isotipo-plata.svg` | Monocromáticas | Planos, sellos, bordado |
| `logo-circular.svg` | Circular | Avatar y perfiles sociales |
| `logo-mark.svg`, `icon-*.png`, `favicon-32.png` | Reducida / app icon | Favicon e icono de la app |

El logotipo horizontal se compone en HTML (`.logo`): isotipo a la izquierda, nombre y descriptor a la derecha.
Por debajo de 140 px de ancho se usa solo el isotipo.

> Nota del manual: los artes son una dirección visual conceptual. Antes de registrar o imprimir, conviene
> redibujar el logotipo maestro en vector profesional (SVG/PDF/AI) y validar la disponibilidad de la marca.

## Botones

Primario: oro sólido con texto grafito (`.btn-gold`). Secundario: azul profundo con borde oro y texto blanco
(`.btn-ink`). Terciario: texto oro (`.btn-text`). Destructivo: rojo sobrio (`.btn-danger`). Mínimo 44 px de alto.
Textos con verbo claro: «Crear proyecto», «Subir planos», «Registrar avance», «Agregar incidencia»,
«Generar reporte», «Solicitar cotización».

## Iconografía e imágenes

Iconos lineales de trazo uniforme (escuadra, cercha, casco, clipboard, edificio). La imagen principal es una
ilustración arquitectónica contemporánea al anochecer con cotas (`hero-residencia.svg`), en tonos fríos con
acentos cálidos. Cuando haya fotografía real de obra, sustitúyela manteniendo esa dirección.

## Accesibilidad

Los estados siempre llevan texto (no solo color), contraste alto, objetivos táctiles de 44 px y el mismo
patrón en escritorio y móvil.
