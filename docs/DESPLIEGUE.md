# Despliegue: GitHub → Hostinger

El sitio es estático: solo hay que poner el **contenido** de `sitio/` dentro de `public_html` del dominio
`rinovaia.com`. Hay tres formas; elige una.

## A. Automática con GitHub Actions (recomendada)

1. Crea el repositorio en GitHub (por ejemplo `rinova-ia`, privado) y sube este proyecto a `main`.
2. En hPanel → **Archivos → Cuentas FTP**, anota servidor, usuario y contraseña (o crea una cuenta FTP
   limitada a la carpeta del dominio).
3. En GitHub → **Settings → Secrets and variables → Actions**, crea:
   - `HOSTINGER_FTP_SERVER`
   - `HOSTINGER_FTP_USERNAME`
   - `HOSTINGER_FTP_PASSWORD`
4. En **Settings → Environments** crea `produccion` y activa *Required reviewers* con tu usuario:
   así ninguna publicación sale sin tu aprobación.
5. Revisa `server-dir` en `.github/workflows/deploy-hostinger.yml`:
   - si la cuenta FTP abre directamente en la carpeta del dominio, usa `./`;
   - si abre en tu carpeta principal, suele ser `./public_html/` o `./domains/rinovaia.com/public_html/`.
6. Cada merge a `main` que toque `sitio/` se publica. También puedes lanzarlo a mano desde **Actions →
   Publicar en Hostinger → Run workflow**.

Si tu plan no acepta FTPS, cambia `protocol: ftps` por `protocol: ftp`.

## B. Git integrado de hPanel

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
