# Portal interno, acceso y chatbots

## Qué hay

| Pantalla | Archivo | Qué hace |
|---|---|---|
| Acceso | `sitio/acceso.html` | Iniciar sesión, crear cuenta (clientes), recuperar contraseña. `?next=` regresa a la página que lo pidió; `?modo=alta` abre "Crear cuenta". |
| Portal interno | `sitio/interno.html`, `assets/js/interno.js`, `assets/css/interno.css` | Mi panel (tarjetas de resumen, "Abrir mi correo", calendario de obras día/semana/mes/año, proyectos recientes, etapas que requieren atención), Proyectos, Obras y etapas, Prospectos, Usuarios, Asistentes y Mi cuenta. |
| Estudio | `sitio/app.html` + `assets/js/nube.js` | Solo con sesión. Botón **Guardar** (o Ctrl+S) guarda el proyecto en `projects`; `app.html?p=<id>` lo abre. La vista Proyectos muestra la cartera real. |
| Sesión | `assets/js/sesion.js`, `assets/js/vendor/supabase-2.58.0.min.js` | `window.rinovaDB` y `window.RinovaSesion` (`require`, `current`, `signOut`, `roles`). |
| Chatbot del sitio | `assets/js/chatbot.js` + función `chatbot-ventas` | Atiende visitantes y guarda prospectos en `chatbot_leads` (skill chatbot-ventas). |
| Asistente interno | `assets/js/chat-interno.js` + función `asistente-interno` | Solo personal interno; consulta datos con los permisos de quien pregunta (skill chat interno). |

En el menú del sitio aparece **Interno**; "Iniciar sesión" y "Crear proyecto" pasan por `acceso.html`.

## Roles

| Rol | En pantalla | Ve |
|---|---|---|
| `admin` | Admin (Dirección) | Todo: usuarios, asistentes, prospectos, borrar proyectos y obras. |
| `administracion` | Administración | Proyectos, obras y presupuestos de todo el equipo. |
| `arquitecto`, `ingeniero`, `supervisor` | Arquitectura, Ingeniería, Supervisor de obra | Todo el equipo; crean y editan obras y etapas. |
| `ventas` | Ventas | Prospectos, proyectos y obras. |
| `distribuidor` | Distribuidor | Portal de distribuidores; sus proyectos referidos. |
| `cliente` | Cliente | Solo sus proyectos y sus obras. Es el rol de quien se registra solo. |

El personal interno usa correo `@rinovaia.com` (la función `gestion-usuarios` lo exige). `admin@rinovaia.com` y
`vicente@rinovaia.com` reciben el rol Admin automáticamente al crear su cuenta. La seguridad real está en RLS
(`supabase/migrations/20261123170000_portal_interno.sql`).

## Puesta en marcha (una vez)

1. Aplicar la migración `20261123170000_portal_interno.sql`.
2. Publicar las funciones con **Verify JWT apagado** (cada una revisa la sesión): `gestion-usuarios`, `asistente-interno`, `chatbot-ventas`.
3. Supabase › Edge Functions › Secrets: `ANTHROPIC_API_KEY` (los dos asistentes).
4. Supabase › Authentication › URL Configuration: Site URL `https://www.rinovaia.com` y en Redirect URLs `https://www.rinovaia.com/**`.
5. Supabase › Authentication › SMTP: un buzón de Hostinger (p. ej. `no-reply@rinovaia.com`, `smtp.hostinger.com`, puerto 465) para que lleguen los correos de confirmación y de recuperar contraseña.
6. Crear en Hostinger los buzones `@rinovaia.com` del equipo con la misma contraseña que da "Crear usuario".

Prueba local: `cd sitio && python3 -m http.server 8765` (localhost:8765 está en la lista de orígenes de las funciones).
