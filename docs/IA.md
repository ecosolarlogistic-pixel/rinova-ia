# RINOVAIA AI: análisis experto y lectura de croquis

## Qué funciona hoy sin configurar nada

| Función | Cómo trabaja |
|---|---|
| Estado → ciudad | 32 estados y sus principales ciudades (`assets/js/proyecto.js`). Cada ciudad trae latitud, zona sísmica aproximada, capacidad de suelo, factor de viento y factor de costo regional. Son valores preliminares; el estudio de mecánica de suelos y el reglamento municipal mandan. |
| Programa arquitectónico | Tipo de inmueble (casa, departamentos, centro comercial, bodega), recámaras, baños, medios baños, cajones, número de pisos, distribución y acabado de pisos generan el programa de espacios por nivel. |
| Juego de planos | `assets/js/planos.js` reparte el programa en la planta y dibuja: conjunto (A-01), plantas por nivel, fachada, corte, estructural y cimentación (E-01), eléctrica e hidrosanitaria por nivel y unifilar. Cada lámina lleva cuadro de datos de la marca. Se exporta una lámina en SVG o el juego completo a PDF (una lámina por página, con "Guardar como PDF" del navegador). |
| Mejorar fachada | `assets/js/fachada.js`. En Planos → Mejorar fachada, el botón propone estilo (contemporáneo, minimalista, industrial, tropical moderno, mediterráneo o colonial mexicano), materiales, cancelería y elementos (volado, celosía, balcones, pérgola, jardineras, basamento, iluminación) según tipo de inmueble, niveles y clima de la ciudad. Todo se ajusta a mano, se compara contra la fachada original, se descarga en PNG, se estima su costo y se agrega al juego como lámina R-01. |
| Subir fachada | En Planos → Mejorar fachada, «Subir fachada (PDF o JPG)» carga la fachada actual (también se puede soltar sobre el visor). El navegador detecta el color del muro y lo asocia al material más parecido, identifica cubierta de teja y la proporción de vidrio, y arma la propuesta a partir de eso. La foto queda como lámina R-00 y como «antes» en la comparación. Con la función `rinova-ia` desplegada (acción `fachada`), Claude describe la fachada, sugiere estilo, material y elementos, y explica cada mejora. |
| Render 3D 360° | `assets/js/render3d.js` arma un modelo volumétrico con los mismos datos (frente, fondo, alturas por nivel, crujías, cochera y la fachada elegida) usando three.js autoalojado, cargado solo al abrir la vista. Gira solo, se arrastra para girar, pellizco o rueda para acercar, vistas fijas, día/atardecer/noche, imagen PNG y video de una vuelta completa (MP4 o WebM según el navegador). |
| Recorrido virtual | `assets/js/recorrido.js` levanta cada planta con la distribución del juego de planos (espacios por nivel): muros con puertas, vanos, ventanas, cancel al jardín, portón de cochera y escalera en U. Amuebla cada espacio según su uso (sala, comedor, cocina con isla, recámaras con closet, vestidor, baños con regadera y tina, estudio, lavado, cochera, jardín y terraza) con cuadros, lámparas, cortinas, tapetes, plantas y accesorios. Materiales PBR y texturas procedurales (madera, mármol, tela, azulejo) generadas en el navegador, sin archivos de terceros. Luz de entorno, sol con sombras por las ventanas, luces interiores por espacio y oclusión simulada. Exterior caminable en planta baja: empieza en la fachada (banqueta y calle, andador y cochera), entra por la puerta principal, sale al jardín posterior por el cancel (lo agrega si la planta no tiene salida directa) y rodea por los laterales; las demás plantas se ven por fuera con sus ventanas y pretil, y el terreno, las bardas y las piezas del jardín (alberca, palapa, asador…) coinciden con el render 3D. Primera persona en escritorio (arrastrar, W A S D, clic en el piso) y celular (joystick, tocar el piso), plano de ubicación, recorrido guiado, día/atardecer/noche y foto. |
| Análisis experto | Motor de reglas: áreas mínimas por espacio, relación baños/recámaras, COS, CUS, área libre, cajones requeridos, asoleamiento por latitud, clima, sismo, suelo, costo. Da una calificación de 0 a 100 y prioridades. |
| Croquis, planos y fachada | Se suben uno o varios archivos (fotos o PDF, hasta 4 páginas por PDF). Sin IA, `assets/js/lectura-plano.js` detecta en el navegador el contorno y los espacios que encierran muros, puertas y ventanas, y pide las cotas (frente y fondo construidos); los nombres de los espacios son estimados. La distribución se guarda en el proyecto (`p.sk`) y todo el juego de planos se dibuja con ella a escala. El primer plano queda como lámina A-00 y una foto de fachada pasa a «Mejorar fachada». |

## Qué se activa con la función `rinova-ia`

Con la función desplegada, Claude (modelo `claude-opus-5-5`) además:

* **Lee cada plano** (acción `plano`, una imagen por solicitud): si es planta o fachada, el nivel, las cotas (13000 mm = 13 m), cada espacio como rectángulo en metros con su nombre y tipo, las puertas y el lado de la calle. Con eso los planos reproducen la distribución del archivo, con los nombres correctos. Si es fachada, propone estilo, material y mejoras.
* **Redacta el dictamen** en la pestaña *Análisis experto* ("Pedir dictamen con IA"): veredicto, fortalezas, riesgos, normativa y siguientes pasos, a partir de los datos del proyecto, los cálculos y la revisión por reglas.

Mientras la función no exista, la app lo indica y sigue funcionando con el motor de reglas.

## Despliegue (una vez)

```bash
supabase link --project-ref evjoqaphylggvojthezj
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy rinova-ia --no-verify-jwt
```

* `--no-verify-jwt` es necesario porque la app llama con la clave publicable (`sb_publishable_...`), que no es un JWT. La función se protege con lista de orígenes permitidos (`RINOVA_ORIGENES`, por defecto rinovaia.com) y un límite de 24 solicitudes por IP cada 10 minutos.
* Opcional: `RINOVA_MODELO` para cambiar de modelo.
* Costo aproximado por uso: una lectura de croquis o un dictamen consume del orden de 5 a 15 mil tokens.

La dirección de la función está en `app.html` (`window.RINOVA_IA`).
