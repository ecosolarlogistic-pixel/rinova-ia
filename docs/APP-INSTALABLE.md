# App instalable RINOVAIA (PC, Mac, Android, iPhone, iPad)

RINOVAIA se instala como app web progresiva (PWA) desde **www.rinovaia.com**. No requiere tiendas:
se abre en su propia ventana, tiene ícono, accesos directos, pantalla de inicio y funciona con poca señal.

Guía pública para clientes y equipo: **https://www.rinovaia.com/instalar.html** (con QR para el celular).

## Cómo se instala

| Dispositivo | Navegador | Cómo |
|---|---|---|
| PC Windows / Linux / Chromebook | Chrome, Edge | Botón **Instalar app** (diálogo nativo) o ícono de instalar en la barra de direcciones |
| Mac | Safari 17+ (Sonoma) | **Archivo → Agregar al Dock** (el botón muestra los pasos) |
| Mac | Chrome, Edge | Botón **Instalar app** (diálogo nativo) |
| Android | Chrome, Edge, Samsung Internet | Botón **Instalar app** (diálogo nativo) |
| Android | Firefox | Menú ⋮ → Instalar (el botón muestra los pasos) |
| iPhone / iPad | Safari; Chrome y Edge en iOS 16.4+ | Compartir → **Agregar a inicio** (el botón muestra los pasos) |
| Cualquiera | Navegador interno de WhatsApp, Instagram, Facebook | El botón pide abrir en Safari/Chrome primero |
| Computadora | Firefox, Safari < 17 | No instalan apps web; la guía sugiere Chrome/Edge |

Es **una sola app** ("RINOVAIA", `id: ./app.html`) para todo el sitio: abre en la plataforma y tiene
accesos directos a Proyectos, Obra, Distribuidores y el sitio. Antes había dos manifiestos con el mismo
alcance, lo que podía dejar dos íconos instalados; se unificaron en `manifest.webmanifest`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `sitio/manifest.webmanifest` | Nombre, colores de marca, íconos (any + maskable + SVG), accesos directos, capturas para el diálogo de instalación enriquecido |
| `sitio/pwa.js` | Registra el service worker, detecta dispositivo y navegador, botón flotante "Instalar app", pasos por plataforma, aviso al terminar la instalación. Expone `window.RinovaPWA` y el evento `rinova:pwa` |
| `sitio/instalar.html` | Guía con pestañas por dispositivo (se elige sola), QR, beneficios y preguntas frecuentes |
| `sitio/sw.js` | Caché `rinovaia-v4`: páginas red primero (con `?source=pwa` también sin conexión), recursos caché primero, `offline.html` de respaldo |
| `sitio/assets/img/app/` | Íconos 48–512, maskable 192/512, Apple 120–180, 19 pantallas de inicio de iPhone/iPad, capturas, QR |
| `sitio/favicon.ico` | 16/32/48 px para Windows y navegadores antiguos |

Cualquier elemento con `data-pwa-install` abre la instalación; los que tienen `data-pwa-link` se ocultan
cuando la página ya corre como app instalada.

### Regenerar íconos y pantallas de inicio

Si cambia el logotipo (`logo-mark.svg`, `maskable.svg`, `isotipo.svg`), vuelve a generar
`assets/img/app/` con Playwright (render del SVG a PNG en cada tamaño) y cuantiza los PNG
(las pantallas de inicio quedan en ~20–50 KB). Sube `VERSION` en `sw.js` en cada cambio de recursos.

## Verificación hecha

- Chrome (DevTools Protocol): `getInstallabilityErrors` vacío y manifiesto sin errores en `index`, `app`,
  `distribuidores` e `instalar`.
- Sin conexión: `app.html?source=pwa` e `instalar.html` abren desde caché; páginas no visitadas muestran `offline.html`.
- Sin errores de consola ni recursos 404.

Para probar en un teléfono real después de publicar: abrir www.rinovaia.com/instalar.html y seguir los pasos.

## Siguientes pasos opcionales: tiendas de apps

La PWA ya cubre los cuatro sistemas. Si se quiere presencia en tiendas:

1. **Microsoft Store (Windows):** empaquetar con PWABuilder (pwabuilder.com) a MSIX. Sin código nuevo.
2. **Google Play (Android):** Trusted Web Activity con PWABuilder o Bubblewrap. Requiere publicar
   `sitio/.well-known/assetlinks.json` con la huella del certificado de firma y una cuenta de Google Play Console.
3. **App Store (iPhone, iPad, Mac):** envoltorio con Capacitor o PWABuilder iOS. Apple suele rechazar apps
   que solo muestran un sitio (guía 4.2), así que conviene sumar algo nativo: notificaciones push, cámara
   para la bitácora de obra o modo sin conexión ampliado. Requiere cuenta de Apple Developer.
