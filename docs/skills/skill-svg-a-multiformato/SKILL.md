---
name: skill-svg-a-multiformato
description: Convierte planos o láminas en SVG a DXF para AutoCAD (y de ahí DWG) y a IFC para Revit, en el navegador y sin servidor. Úsala al exportar planos de RINOVAIA o cualquier SVG técnico a formatos CAD/BIM.
---

# SVG a multiformato (AutoCAD · Revit)

Proceso para llevar un plano dibujado en SVG a los formatos que usan los despachos:
**SVG → DXF (AutoCAD, BricsCAD, LibreCAD; DWG con «Guardar como») → IFC (Revit, ArchiCAD, Navisworks)**.
Implementación de referencia: `sitio/assets/js/svg-multiformato.js` (conversor) y
`sitio/assets/js/exportar-plano.js` (ventana «Exportar plano») del repo `rinova-ia`.

## Flujo para la persona usuaria

1. Botón **Exportar plano** → se abre una ventana emergente.
2. La lámina activa se convierte **en automático a SVG** (vista previa + «Descargar SVG»).
3. En la misma ventana: **Convertir a AutoCAD** (DXF) y **Convertir a Revit** (IFC), cada una con su
   bitácora de pasos, resumen (entidades, capas, niveles, muros) y botón de descarga.
4. Todo ocurre en el navegador: los planos no se suben a ningún servidor.

## 1. Preparar el SVG (lo que hace bueno el resultado)

- **Escala real:** marca la escala gráfica con `data-pxm="<px por metro>"`. Con ella el DXF sale 1:1 en
  metros (`$INSUNITS = 6`). Sin ella se conservan las unidades del SVG y el DXF dice «sin escala».
- **Capas:** pon `data-cad-layer="A-MUROS"` en los grupos (`A-MUROS`, `A-COTAS`, `A-EJES`, `A-TEXTO`,
  `A-MOBILIARIO`, `A-PUERTAS-VENTANAS`, `E-COLUMNAS`, `IE-ELECTRICA`, `IH-HIDROSANITARIA`, `R-CUADRO`…).
  Lo que no la declare toma capa por color (tabla `COLOR_LAYER`) y los textos de una capa van a `<CAPA>-TEXTO`.
- **Capas de edición** con trazo `transparent` u `opacity="0"` se ignoran solas.
- Las imágenes (`<image>`: croquis, fotos, renders) **no** pasan a DXF; avisar a la persona.

## 2. SVG → geometría

- Recorrer el DOM acumulando la matriz: `transform` (matrix, translate, scale, rotate con centro, skew),
  `<svg>` anidados (x/y + `viewBox` + `preserveAspectRatio` meet/slice) y `<use>` (con x/y).
- Heredar estilo (`stroke`, `fill`, `stroke-width`, `stroke-dasharray`, `font-size`, `text-anchor`) de
  atributos y `style=""`. Omitir `defs`, `clipPath`, `mask`, `symbol` (salvo vía `use`), `title`…
- Aplanar trayectorias: M L H V Z exactos; C S Q T con 10 segmentos; arcos A con conversión
  endpoint→centro y un segmento cada 15°.
- Clasificar cada figura: **trazo** → contorno en su capa; **relleno oscuro** → `SOLID` (rectángulos) o
  contorno; **relleno claro** (luminancia > 0.86, fondos de espacios) → capa `Z-RELLENOS` apagada.
- Círculos con escala uniforme → `CIRCLE`; elipses o escalas no uniformes → polilínea de 48 lados.
- Texto: `textContent` normalizado, altura = `font-size × 0.72` (altura de mayúscula), rotación con el
  signo invertido, alineación `start/middle/end` → código 72 = 0/1/2 con punto 11/21.

## 3. Escribir DXF (R12, AC1009)

- Invertir Y: `Y_cad = (alto_viewBox − y) / pxm`; `X_cad = (x − minX) / pxm`.
- Secciones: `HEADER` ($ACADVER AC1009, $DWGCODEPAGE ANSI_1252, $INSUNITS, $EXTMIN/$EXTMAX),
  `TABLES` (LTYPE CONTINUOUS y DASHED escalado al dibujo; LAYER con color ACI y negativo = apagada;
  STYLE `RINOVA`), `ENTITIES` (LINE, POLYLINE/VERTEX/SEQEND, CIRCLE, SOLID con orden 1-2-4-3, TEXT), `EOF`.
- Color: hex → ACI más cercano; negros y grafitos → 7 (negro al imprimir, blanco en pantalla oscura).
- Texto en ANSI_1252: acentos, ñ, ², ·, × se escriben tal cual y el archivo se descarga **como bytes
  cp1252** (no UTF-8); lo que no cabe en 1252 va como `\U+XXXX`.
- Nombres de capa: mayúsculas, sin acentos, `[A-Z0-9_$-]`, máx. 31 caracteres.
- **DWG:** formato binario cerrado; no se genera en el navegador. Indicar: abrir el DXF en AutoCAD →
  *Guardar como › Dibujo (*.dwg)*, o convertir por lotes con ODA File Converter (gratuito).

## 4. Escribir IFC (IFC2X3, Coordination View 2.0) para Revit

- Modelo de entrada en metros: `{ name, site, W, D, levels: [{ name, elev, h, cells:[{n,k,x,y,w,h}], walls:[{x1,y1,x2,y2,t,ext}] }] }`
  (`modelFromPlans` lo arma desde `RinovaPlanos.build().levels`, `heights(p).hs` y `wallSegments`).
- Estructura: IfcProject › IfcSite › IfcBuilding › IfcBuildingStorey (elevación acumulada), con
  IfcOwnerHistory, unidades SI (m, m², m³, rad) y contexto `Model` + subcontexto `Body`.
- Muros exteriores 20 cm con la cara exterior en el contorno; interiores 12 cm centrados en el eje,
  omitiendo los muros quitados y los que separan dos espacios exteriores. `IfcWall` con
  IfcExtrudedAreaSolid de IfcRectangleProfileDef, colocado con dirección del eje.
- `IfcSlab` .FLOOR. por nivel (12 cm bajo el piso) y .ROOF. sobre el último; `IfcSpace` por espacio
  (nombre, área en LongName, .INTERNAL./.EXTERNAL.). Materiales con IfcRelAssociatesMaterial.
- GUID IFC comprimido de 22 caracteres (alfabeto `0-9A-Za-z_$`); textos con `''` y `\X2\…\X0\` para no-ASCII.
- En Revit: *Archivo › Abrir › IFC*. Para usar la lámina como base: *Insertar › Vincular CAD* con el DXF.

## 5. Verificar antes de entregar

- DXF: `ezdxf.recover.readfile` + `doc.audit()` sin errores; render con
  `ezdxf.addons.drawing.matplotlib.qsave` para revisar geometría y acentos; tamaño en metros coherente.
- IFC: `ifcopenshell.validate.validate` sin incidencias; `ifcopenshell.geom` para comprobar que muros,
  losas y espacios caen dentro del contorno y la altura total es la suma de niveles.
- UI: probar en escritorio (1440 px) y celular (390 px) sin desbordes; botones ≥ 44 px; marca:
  encabezado azul profundo #0B0F17 con filete oro, primario oro con texto grafito, secundario azul con
  borde oro, Montserrat en títulos e Inter en interfaz.
