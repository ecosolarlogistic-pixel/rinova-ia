# RINOVAIA AI: análisis experto y lectura de croquis

## Qué funciona hoy sin configurar nada

| Función | Cómo trabaja |
|---|---|
| Estado → ciudad | 32 estados y sus principales ciudades (`assets/js/proyecto.js`). Cada ciudad trae latitud, zona sísmica aproximada, capacidad de suelo, factor de viento y factor de costo regional. Son valores preliminares; el estudio de mecánica de suelos y el reglamento municipal mandan. |
| Programa arquitectónico | Tipo de inmueble (casa, departamentos, centro comercial, bodega), recámaras, baños, medios baños, cajones, número de pisos, distribución y acabado de pisos generan el programa de espacios por nivel. |
| Juego de planos | `assets/js/planos.js` reparte el programa en la planta y dibuja: conjunto (A-01), plantas por nivel, fachada, corte, estructural y cimentación (E-01), eléctrica e hidrosanitaria por nivel y unifilar. Cada lámina lleva cuadro de datos de la marca. Se exporta una lámina en SVG o el juego completo a PDF (una lámina por página, con "Guardar como PDF" del navegador). |
| Mejorar fachada | `assets/js/fachada.js`. En Planos → Mejorar fachada, el botón propone estilo (contemporáneo, minimalista, industrial, tropical moderno, mediterráneo o colonial mexicano), materiales, cancelería y elementos (volado, celosía, balcones, pérgola, jardineras, basamento, iluminación) según tipo de inmueble, niveles y clima de la ciudad. Todo se ajusta a mano, se compara contra la fachada original, se descarga en PNG, se estima su costo y se agrega al juego como lámina R-01. |
| Render 3D 360° | `assets/js/render3d.js` arma un modelo volumétrico con los mismos datos (frente, fondo, alturas por nivel, crujías, cochera y la fachada elegida) usando three.js autoalojado, cargado solo al abrir la vista. Gira solo, se arrastra para girar, pellizco o rueda para acercar, vistas fijas, día/atardecer/noche, imagen PNG y video de una vuelta completa (MP4 o WebM según el navegador). |
| Recorrido virtual | `assets/js/recorrido.js` levanta cada planta con la distribución del juego de planos (espacios por nivel): muros con puertas, vanos, ventanas, cancel al jardín, portón de cochera y escalera en U. Amuebla cada espacio según su uso (sala, comedor, cocina con isla, recámaras con closet, vestidor, baños con regadera y tina, estudio, lavado, cochera, jardín y terraza) con cuadros, lámparas, cortinas, tapetes, plantas y accesorios. Materiales PBR y texturas procedurales (madera, mármol, tela, azulejo) generadas en el navegador, sin archivos de terceros. Luz de entorno, sol con sombras por las ventanas, luces interiores por espacio y oclusión simulada. Primera persona en escritorio (arrastrar, W A S D, clic en el piso) y celular (joystick, tocar el piso), plano de ubicación, recorrido guiado, día/atardecer/noche y foto. |
| Análisis experto | Motor de reglas: áreas mínimas por espacio, relación baños/recámaras, COS, CUS, área libre, cajones requeridos, asoleamiento por latitud, clima, sismo, suelo, costo. Da una calificación de 0 a 100 y prioridades. |
| Croquis | Se sube foto o PDF. Sin IA, la app estima la proporción frente/fondo a partir del trazo y pide confirmar los datos; con ellos genera todo el juego y agrega el croquis como lámina A-00. |

## Qué se activa con la función `rinova-ia`

Con la función desplegada, Claude (modelo `claude-opus-5-5`) además:

* **Lee el croquis**: tipo de inmueble, medidas (por cotas o por proporción), niveles, recámaras, baños, cajones, distribución y la lista de espacios con su área. Los datos llenan el formulario y el usuario los confirma antes de generar los planos.
* **Redacta el dictamen** en la pestaña *Análisis experto* ("Pedir dictamen con IA"): veredicto, fortalezas, riesgos, normativa y siguientes pasos, a partir de los datos del proyecto, los cálculos y la revisión por reglas.

Mientras la función no exista, la app lo indica y sigue funcionando con el motor de reglas.

## Despliegue (una vez)

```bash
supabase link --project-ref evjoqaphylggvojthezj
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy rinova-ia --no-verify-jwt
```

* `--no-verify-jwt` es necesario porque la app llama con la clave publicable (`sb_publishable_...`), que no es un JWT. La función se protege con lista de orígenes permitidos (`RINOVA_ORIGENES`, por defecto rinovaia.com) y un límite de 12 solicitudes por IP cada 10 minutos.
* Opcional: `RINOVA_MODELO` para cambiar de modelo.
* Costo aproximado por uso: una lectura de croquis o un dictamen consume del orden de 5 a 15 mil tokens.

La dirección de la función está en `app.html` (`window.RINOVA_IA`).
