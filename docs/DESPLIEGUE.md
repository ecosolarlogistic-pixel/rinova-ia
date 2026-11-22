# Despliegue: GitHub → Hostinger

El sitio es estático: solo hay que poner el **contenido** de `sitio/` dentro de `public_html` del dominio
`rinovaia.com`. Hay tres formas; elige una.

## A. Automática desde GitHub (configurada y en uso)

Así está publicado hoy https://www.rinovaia.com:

1. Trabajas en `main` (ramas y PR como siempre).
2. Cuando un cambio en `sitio/` llega a `main`, el workflow `.github/workflows/publicar.yml` copia
   el contenido de `sitio/` a la rama **`produccion`** (solo los archivos del sitio, en la raíz).
3. Hostinger tiene activado el **despliegue automático** de `produccion` en `rinovaia.com`
   (hPanel → Sitios web → rinovaia.com → GitHub). Al moverse la rama, publica solo.

No hay contraseñas ni secretos de FTP en GitHub. Nunca hagas commits directos en `produccion`:
se regenera desde `main`.

Para volver a una versión anterior: revierte el commit en `main` (`git revert`) y se publica la
versión anterior por el mismo camino.

## B. Alternativa: Git integrado de hPanel (manual)

hPanel → **Avanzado → Git**: conecta el repositorio y la rama `main`. Hostinger copia el repositorio
completo, así que el directorio de destino debe apuntar a la carpeta del dominio y después hay que mover
el contenido de `sitio/` a la raíz, o mantener un repositorio aparte solo con `sitio/`. Por eso la opción A
es más limpia.

## C. A mano con el Administrador de archivos

1. Comprime el **contenido** de `sitio/` (no la carpeta), incluido `.htaccess`.
2. hPanel → Administrador de archivos → `public_html` → sube el zip → Extraer.
3. Revisa que `index.html` quede directamente en `public_html` y que existan `assets/css`, `assets/js`,
   `assets/fonts` y `assets/img`. Si las carpetas se aplanaron al extraer, vuelve a subir conservando rutas.
4. Borra la página por defecto de Hostinger (`default.php`) si aparece.

## Antes de publicar (cada vez)

1. Confirma que el destino es la carpeta de `rinovaia.com` y no la de otro dominio de la cuenta.
2. Respalda lo que está en vivo: copia cada archivo que vas a pisar como
   `respaldo-AAAA-MM-DD-antes-<cambio>-<archivo>`.
3. Si cambió `sitio/sw.js` o cualquier archivo precacheado, sube `VERSION` en `sw.js` (`rinova-v2`, …).
4. Publica, abre `https://www.rinovaia.com` con Ctrl+F5 y revisa que la consola no tenga errores.
5. Prueba la vista previa en WhatsApp pegando el enlace (usa `assets/img/og-rinova.jpg`).

## SSL y dominio

hPanel → **Seguridad → SSL**: activa el certificado gratuito. El certificado debe cubrir `rinovaia.com` y `www.rinovaia.com`. El `.htaccess` manda todo (http, sin www) a `https://www.rinovaia.com` en un solo salto 301.

En hPanel → **Dominios → DNS**, `www` debe ser un CNAME a `rinovaia.com` (o un registro A a la IP del hosting).

## SEO

`sitemap.xml` y `robots.txt` ya apuntan a `https://www.rinovaia.com`. Tras publicar, da de alta la propiedad `https://www.rinovaia.com` en Google Search Console y envía `https://www.rinovaia.com/sitemap.xml`.

## Qué no va en Hostinger

- La carpeta `supabase/`, `docs/` y `.github/` no se publican.
- Los módulos de IA (difusión, FEA) necesitan GPU y van en otro servidor; Hostinger solo sirve el frontend.
- Ninguna llave privada en `sitio/`: el workflow detiene la publicación si encuentra una.

## Caché de la CDN de Hostinger

La CDN de Hostinger guarda JS, CSS y `sw.js` hasta 30 días por URL, aunque `.htaccess` pida lo contrario.
Por eso los HTML cargan los recursos con `?v=AAAAMMDD` y `pwa.js` registra `sw.js?v=AAAAMMDD`.
**Cada vez que cambie un JS o el CSS, sube ese número en todos los HTML, en `pwa.js` y en `V` de `sw.js`.**
También se puede purgar la caché en hPanel → Sitios web → rinovaia.com → CDN → Purgar caché.
