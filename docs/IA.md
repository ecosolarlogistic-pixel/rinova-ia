# RINOVAIA AI: análisis experto y lectura de croquis

## Qué funciona hoy sin configurar nada

| Función | Cómo trabaja |
|---|---|
| Estado → ciudad | 32 estados y sus principales ciudades (`assets/js/proyecto.js`). Cada ciudad trae latitud, zona sísmica aproximada, capacidad de suelo, factor de viento y factor de costo regional. Son valores preliminares; el estudio de mecánica de suelos y el reglamento municipal mandan. |
| Programa arquitectónico | Tipo de inmueble (casa, departamentos, centro comercial, bodega), recámaras, baños, medios baños, cajones, número de pisos, distribución y acabado de pisos generan el programa de espacios por nivel. |
| Juego de planos | `assets/js/planos.js` reparte el programa en la planta y dibuja: conjunto (A-01), plantas por nivel, fachada, corte, estructural y cimentación (E-01), eléctrica e hidrosanitaria por nivel y unifilar. Cada lámina lleva cuadro de datos de la marca. Se exporta una lámina en SVG o el juego completo a PDF (una lámina por página, con "Guardar como PDF" del navegador). |
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
