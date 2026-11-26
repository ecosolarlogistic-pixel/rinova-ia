// RINOVAIA AI — función de Supabase (Deno) que usa Claude para:
//   action "croquis":  leer un croquis (foto o PDF) y devolver tipo de inmueble, medidas, niveles y programa.
//   action "plano":    leer una planta (medidas por cotas, espacios con posición, puertas, nivel) o una fachada.
//   action "fachada":  leer la foto o PDF de una fachada existente y proponer estilo, material y elementos.
//   action "analisis": redactar el dictamen de arquitecto a partir de los datos y cálculos del Estudio.
//
// Secretos requeridos:  ANTHROPIC_API_KEY
// Opcionales:           RINOVA_MODELO (por defecto claude-opus-5-5), RINOVA_ORIGENES (lista separada por comas)
// Despliegue:           supabase functions deploy rinova-ia --no-verify-jwt   (ver docs/IA.md)
import Anthropic from "npm:@anthropic-ai/sdk";

const MODEL = Deno.env.get("RINOVA_MODELO") ?? "claude-opus-5-5";
const ORIGINS = (Deno.env.get("RINOVA_ORIGENES") ??
  "https://www.rinovaia.com,https://rinovaia.com,http://localhost:8765,http://127.0.0.1:8765")
  .split(",").map((s) => s.trim()).filter(Boolean);

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "content-type": "application/json" } });
}

// Límite sencillo por IP para que un tercero no consuma la cuenta de la API (memoria de la instancia).
const hits = new Map<string, number[]>();
function limited(ip: string, max = 24, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

const SISTEMA_ARQ = `Eres el arquitecto principal de RINOVAIA, con 25 años de experiencia en proyectos residenciales, habitacionales, comerciales e industriales en México.
Conoces los reglamentos de construcción municipales, las Normas Técnicas Complementarias, el Manual de Diseño de Obras Civiles de CFE (sismo y viento), NOM-001-SEDE e instalaciones hidrosanitarias.
Escribes en español de México, claro y directo, para un cliente que no es especialista pero quiere decisiones concretas.`;

const ESQUEMA_CROQUIS = {
  type: "object",
  additionalProperties: false,
  properties: {
    tipo: { type: "string", enum: ["casa", "deptos", "comercial", "bodega"] },
    frente_m: { type: "number", description: "Frente del terreno o de la construcción en metros; estimado si no hay cotas" },
    fondo_m: { type: "number" },
    niveles: { type: "integer" },
    recamaras: { type: "integer" },
    banos: { type: "integer" },
    medios_banos: { type: "integer" },
    estacionamiento: { type: "integer", description: "Cajones de estacionamiento" },
    unidades_por_piso: { type: "integer", description: "Departamentos o locales por piso; 1 si es casa" },
    distribucion: { type: "string", enum: ["abierto", "tradicional", "rec-pb", "planta-libre"] },
    espacios: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { nombre: { type: "string" }, nivel: { type: "integer" }, area_m2: { type: "number" } },
        required: ["nombre", "nivel", "area_m2"],
      },
    },
    observaciones: { type: "array", items: { type: "string" } },
    confianza: { type: "number", description: "0 a 1: qué tan seguro estás de la lectura" },
  },
  required: ["tipo", "frente_m", "fondo_m", "niveles", "recamaras", "banos", "medios_banos", "estacionamiento",
    "unidades_por_piso", "distribucion", "espacios", "observaciones", "confianza"],
};

const client = new Anthropic(); // lee ANTHROPIC_API_KEY

function texto(msg: { content: Array<{ type: string; text?: string }> }) {
  return msg.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
}

async function leerCroquis(archivo: { tipo: string; media_type: string; datos: string; nombre?: string }) {
  if (!archivo?.datos || archivo.datos.length > 14_000_000) throw new Error("archivo_invalido");
  const bloque = archivo.tipo === "pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: archivo.datos } }
    : { type: "image", source: { type: "base64", media_type: archivo.media_type || "image/jpeg", data: archivo.datos } };
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SISTEMA_ARQ,
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA_CROQUIS } },
    messages: [{
      role: "user",
      content: [
        bloque,
        {
          type: "text",
          text: `Lee este croquis arquitectónico (${archivo.nombre ?? "sin nombre"}). Identifica el tipo de inmueble, las medidas (usa las cotas si existen; si no, estima con proporciones y tamaños típicos de muebles y puertas), el número de niveles, recámaras, baños completos, medios baños, cajones de estacionamiento, unidades por piso y el tipo de distribución.
Enlista cada espacio con su nivel (0 = planta baja) y área aproximada. En observaciones anota lo que no se alcanza a leer, supuestos y problemas de diseño que detectes (máximo 6, frases cortas).`,
        },
      ],
    }],
  } as never) as unknown as { content: Array<{ type: string; text?: string }>; stop_reason: string; model: string };
  if (msg.stop_reason === "refusal") throw new Error("rechazo");
  return { lectura: JSON.parse(texto(msg)), modelo: msg.model };
}

// Lectura geométrica de planos, croquis o fachadas (una imagen o página por solicitud; puede traer varias plantas).
const TIPOS_ESPACIO = ["sala", "comedor", "sala_comedor", "cocina", "recamara", "recamara_principal", "bano", "medio_bano", "estudio", "estancia",
  "pasillo", "vestibulo", "escalera", "closet", "vestidor", "lavado", "cochera", "terraza", "balcon", "jardin", "patio", "bodega", "local", "oficina",
  "cuarto_servicio", "doble_altura", "otro"];
const ESQUEMA_ESPACIO = {
  type: "object",
  additionalProperties: false,
  properties: {
    nombre: { type: "string", description: "En español de México: Sala, Comedor, Cocina, Recámara 1, Baño 1, Estudio, Estancia familiar, Escalera, Balcón…" },
    tipo: { type: "string", enum: TIPOS_ESPACIO },
    x: { type: "number", description: "Metros desde el borde izquierdo exterior del rectángulo envolvente de esta planta" },
    y: { type: "number", description: "Metros desde el borde superior exterior del rectángulo envolvente" },
    ancho: { type: "number" },
    fondo: { type: "number" },
    grupo: { type: "integer", description: "0 si el espacio es un solo rectángulo; un mismo número > 0 para los rectángulos de un mismo espacio en L o abierto" },
  },
  required: ["nombre", "tipo", "x", "y", "ancho", "fondo", "grupo"],
};
const ESQUEMA_PUERTA = {
  type: "object",
  additionalProperties: false,
  properties: {
    x: { type: "number", description: "Metros; inicio del vano" },
    y: { type: "number" },
    orientacion: { type: "string", enum: ["h", "v"], description: "h: en un muro horizontal (el vano corre en x); v: en un muro vertical (corre en y)" },
    ancho: { type: "number" },
    principal: { type: "boolean", description: "true solo para el acceso principal desde la calle" },
  },
  required: ["x", "y", "orientacion", "ancho", "principal"],
};
const ESQUEMA_PLANTA = {
  type: "object",
  additionalProperties: false,
  properties: {
    titulo: { type: "string", description: "Título tal como aparece (PLANTA BAJA, GROUND FLOOR…) o vacío" },
    nivel: { type: "integer", description: "0 = planta baja, 1 = planta alta / primer piso, 2 = segundo piso o azotea, -1 = sótano" },
    frente_m: { type: "number", description: "Ancho exterior del rectángulo envolvente de lo construido, en metros (eje x del dibujo)" },
    fondo_m: { type: "number", description: "Profundidad exterior del rectángulo envolvente, en metros (eje y del dibujo)" },
    cotas_leidas: { type: "boolean", description: "true si frente y fondo salen de cotas o escala escritas en el dibujo" },
    calle: { type: "string", enum: ["abajo", "arriba", "izquierda", "derecha", "desconocida"], description: "Lado del dibujo donde está la calle o el acceso principal" },
    ejes_x: { type: "array", items: { type: "number" }, description: "Posiciones en metros, desde el borde izquierdo, de cada marca de las cadenas de cotas horizontales (incluye 0 y el frente)" },
    ejes_y: { type: "array", items: { type: "number" }, description: "Posiciones en metros, desde el borde superior, de cada marca de las cadenas de cotas verticales (incluye 0 y el fondo)" },
    espacios: { type: "array", items: ESQUEMA_ESPACIO },
    puertas: { type: "array", items: ESQUEMA_PUERTA },
  },
  required: ["titulo", "nivel", "frente_m", "fondo_m", "cotas_leidas", "calle", "ejes_x", "ejes_y", "espacios", "puertas"],
};
const ESQUEMA_PLANO = {
  type: "object",
  additionalProperties: false,
  properties: {
    clase: { type: "string", enum: ["planta", "fachada", "corte", "otro"], description: "Qué muestra la imagen; planta si trae al menos una planta" },
    tipo: { type: "string", enum: ["casa", "deptos", "comercial", "bodega"] },
    unidad: { type: "string", enum: ["mm", "cm", "m", "pies", "sin_cotas"], description: "Unidad de las cotas escritas" },
    escala: { type: "string", description: "Escala escrita o gráfica (1:100, 1/4\" = 1'-0\"…) o vacío" },
    plantas: { type: "array", items: ESQUEMA_PLANTA, description: "Una entrada por cada planta dibujada en la imagen, en el orden en que aparecen" },
    fachada: {
      type: "object",
      additionalProperties: false,
      description: "Solo si clase = fachada; si no, valores por omisión",
      properties: {
        descripcion: { type: "string" },
        niveles: { type: "integer" },
        estilo_sugerido: { type: "string", enum: ["contemporaneo", "minimalista", "industrial", "tropical", "mediterraneo", "colonial"] },
        material_principal: { type: "string", enum: ["concreto", "aplanado", "piedra", "ladrillo", "cantera", "travertino", "ocre", "grafito", "madera"] },
        elementos: {
          type: "object",
          additionalProperties: false,
          properties: {
            volado: { type: "boolean" }, celosia: { type: "boolean" }, balcones: { type: "boolean" }, pergola: { type: "boolean" },
            jardineras: { type: "boolean" }, basamento: { type: "boolean" }, iluminacion: { type: "boolean" },
          },
          required: ["volado", "celosia", "balcones", "pergola", "jardineras", "basamento", "iluminacion"],
        },
        mejoras: { type: "array", items: { type: "string" } },
      },
      required: ["descripcion", "niveles", "estilo_sugerido", "material_principal", "elementos", "mejoras"],
    },
    observaciones: { type: "array", items: { type: "string" } },
    confianza: { type: "number", description: "0 a 1" },
  },
  required: ["clase", "tipo", "unidad", "escala", "plantas", "fachada", "observaciones", "confianza"],
};

const INSTRUCCIONES_PLANO = `Vas a convertir este dibujo en datos para redibujar cada planta a escala. Puede ser un plano de CAD, un escaneo, una foto de celular con perspectiva o sombras, un croquis a mano o una hoja con varias plantas.

1. clase: "planta" si hay al menos una planta arquitectónica o croquis en planta; "fachada" si es una foto, render o alzado de fachada; "corte" u "otro" en los demás casos.

2. Plantas: devuelve una entrada en "plantas" por CADA planta dibujada (una hoja puede traer planta baja y planta alta lado a lado, o un departamento tipo y su azotea). No mezcles dos plantas en una. Ignora cuadros de datos, croquis de localización, cortes, fachadas y detalles.
   - titulo y nivel: lee el título de cada dibujo. Planta baja, PB, ground floor, first floor (en EE. UU.), nivel 0, sótano = -1… En inglés británico "first floor" es la planta alta. Si no hay título, ordena por la posición de la escalera y el programa (la que tiene cocina, sala y acceso suele ser la baja).

3. Unidades y escala, antes de medir nada:
   - Identifica la unidad de las cotas: números enteros como 13000 o 4500 son milímetros; 1300 o 450 son centímetros; 13.00, 4.50 o 4,50 son metros; 12'-6" o 12' 6" son pies y pulgadas (1 pie = 0.3048 m, 1 pulgada = 0.0254 m). unidad = "sin_cotas" si no hay ninguna.
   - Si hay escala gráfica (barra con 0, 1, 5 m…) o numérica, úsala para medir lo que no esté acotado.
   - Medidas escritas dentro de los cuartos ("3.50 x 4.00", "12'x14'") son ancho × fondo de ese espacio: úsalas.
   - Sin cotas ni escala: estima con objetos de tamaño conocido (puerta 0.90 m, cama matrimonial 1.40 × 1.90 m, escusado 0.40 × 0.70 m, escalón 0.28 m de huella, cajón de estacionamiento 2.50 × 5.00 m) y pon cotas_leidas = false.

4. Medidas de cada planta:
   - frente_m y fondo_m: rectángulo envolvente EXTERIOR de lo construido. Comprueba que la suma de cada cadena de cotas parciales coincide con la cota total; si no coincide, confía en la total.
   - ejes_x y ejes_y: convierte cada cadena de cotas parciales a posiciones acumuladas en metros desde el borde superior izquierdo exterior (por ejemplo cotas 4200, 4400, 4400 → ejes_x [0, 4.2, 8.6, 13]). Incluye todas las cadenas que veas, de los cuatro lados; si no hay cotas parciales, solo [0, frente] y [0, fondo].

5. espacios: TODOS los espacios como rectángulos en metros, con el origen en la esquina superior izquierda EXTERIOR del rectángulo envolvente, x hacia la derecha y y hacia abajo, tal como se ve el dibujo (no lo gires ni corrijas la perspectiva en el sistema de ejes: mide como si la foto estuviera derecha).
   - Coloca cada lado sobre un eje de cotas cuando coincida con uno; dos espacios vecinos comparten exactamente el mismo borde; los rectángulos no se traslapan y juntos cubren todo lo construido.
   - Incluye pasillos, vestíbulos, escalera (en cada nivel donde aparezca, en la misma posición), clósets, cuartos de servicio, terrazas y balcones.
   - Si el contorno no es rectangular, la parte del rectángulo envolvente que no está construida va como "jardin", "patio" o "terraza".
   - Espacios abiertos o en L (sala-comedor sin muro, estancia que rodea la escalera): divídelos en rectángulos con el mismo número de grupo > 0.
   - Un vacío o doble altura en planta alta es tipo "doble_altura".
   - Traduce los nombres al español de México y numera recámaras y baños. Abreviaturas comunes: REC./DORM./BR/BED = recámara; B./BAÑO/WC/TOILET/BATH = baño; 1/2 B./MEDIO BAÑO/POWDER = medio baño; COC./KIT. = cocina; COM./DIN. = comedor; S./EST./LIV. = sala; S-C = sala-comedor; VEST./HALL/FOYER = vestíbulo; CTO. SERV. = cuarto de servicio; A.L./LAV./LAUNDRY = lavado; GAR./COCH. = cochera; CL./W.I.C. = clóset o vestidor; FAM. = estancia familiar.

6. puertas: cada puerta o vano con el punto donde empieza el vano (en metros), orientación y ancho; principal = true solo en el acceso desde la calle.

7. calle: lado del dibujo donde está la calle o el acceso principal (en una planta alta, el lado de la fachada principal o del balcón hacia la calle).

8. Si es fachada: llena "fachada" (descripción breve, niveles, estilo y material más parecidos, elementos presentes y de 4 a 8 mejoras concretas con su porqué) y deja "plantas" vacío.
   Si es planta, llena fachada con valores neutros (descripcion vacía, niveles 0, contemporaneo, aplanado, elementos en false, mejoras vacío).

9. observaciones: máximo 6 frases cortas sobre lo que no se lee, supuestos y problemas de diseño (áreas mínimas, ventilación, circulación).
10. confianza: qué tan seguro estás de las medidas y posiciones, de 0 a 1.`;

async function leerPlano(archivo: { tipo: string; media_type: string; datos: string; nombre?: string }) {
  if (!archivo?.datos || archivo.datos.length > 14_000_000) throw new Error("archivo_invalido");
  const bloque = archivo.tipo === "pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: archivo.datos } }
    : { type: "image", source: { type: "base64", media_type: archivo.media_type || "image/jpeg", data: archivo.datos } };
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SISTEMA_ARQ,
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA_PLANO } },
    messages: [{
      role: "user",
      content: [bloque, { type: "text", text: `Archivo: ${archivo.nombre ?? "sin nombre"}.\n\n${INSTRUCCIONES_PLANO}` }],
    }],
  } as never) as unknown as { content: Array<{ type: string; text?: string }>; stop_reason: string; model: string };
  if (msg.stop_reason === "refusal") throw new Error("rechazo");
  if (msg.stop_reason === "max_tokens") throw new Error("respuesta_incompleta");
  const L = JSON.parse(texto(msg));
  // Compatibilidad con la app anterior (en caché del navegador): la primera planta también va en el nivel superior.
  const p0 = (L.plantas ?? [])[0];
  if (p0) Object.assign(L, { nivel: p0.nivel, frente_m: p0.frente_m, fondo_m: p0.fondo_m, cotas_leidas: p0.cotas_leidas, calle: p0.calle, espacios: p0.espacios, puertas: p0.puertas });
  else Object.assign(L, { nivel: 0, frente_m: 0, fondo_m: 0, cotas_leidas: false, calle: "desconocida", espacios: [], puertas: [] });
  return { lectura: L, modelo: msg.model };
}

const ESQUEMA_FACHADA = {
  type: "object",
  additionalProperties: false,
  properties: {
    descripcion: { type: "string" },
    niveles: { type: "integer" },
    estilo_actual: { type: "string" },
    estilo_sugerido: { type: "string", enum: ["contemporaneo", "minimalista", "industrial", "tropical", "mediterraneo", "colonial"] },
    material_principal: { type: "string", enum: ["concreto", "aplanado", "piedra", "ladrillo", "cantera", "travertino", "ocre", "grafito", "madera"] },
    elementos: {
      type: "object",
      additionalProperties: false,
      properties: {
        volado: { type: "boolean" }, celosia: { type: "boolean" }, balcones: { type: "boolean" }, pergola: { type: "boolean" },
        jardineras: { type: "boolean" }, basamento: { type: "boolean" }, iluminacion: { type: "boolean" },
      },
      required: ["volado", "celosia", "balcones", "pergola", "jardineras", "basamento", "iluminacion"],
    },
    mejoras: { type: "array", items: { type: "string" } },
    replica: {
      type: "object",
      additionalProperties: false,
      description: "La fachada tal como se ve, para reproducirla sobre el proyecto del cliente",
      properties: {
        muro_hex: { type: "string", description: "Color dominante del muro como #RRGGBB (blanco cálido, gris, etc.), corrigiendo sombras y la luz del atardecer" },
        acento_hex: { type: "string", description: "Color de un volumen o franja de acento vertical (#RRGGBB) o cadena vacía si no hay" },
        cancel_hex: { type: "string", description: "Color de la cancelería / marcos de ventana (#RRGGBB)" },
        puerta_hex: { type: "string", description: "Color de la puerta principal (#RRGGBB)" },
        porche_hex: { type: "string", description: "Color del fondo del acceso o porche remetido (#RRGGBB)" },
        textura: { type: "string", enum: ["concreto", "aplanado", "piedra", "ladrillo", "cantera", "travertino", "ocre", "grafito", "madera"] },
        ventanas: { type: "string", enum: ["cuadricula", "lisa", "franja", "arco", "marco"], description: "cuadricula: ventanales divididos por perfiles en paños" },
        travesano: { type: "boolean", description: "true si las ventanas o la puerta tienen un paño horizontal alto (travesaño / fijo superior)" },
        ventana_alta: { type: "boolean", description: "true si las ventanas van de piso a techo" },
        puerta_lado: { type: "string", enum: ["izq", "centro", "der"] },
        puerta_doble: { type: "boolean" },
        porche: { type: "boolean", description: "true si el acceso está remetido bajo una losa o volumen, con fondo de otro color" },
        losa_volada: { type: "boolean", description: "true si hay una losa o volado sobre el acceso" },
        balcon: { type: "string", enum: ["vidrio", "herreria", "ninguno"] },
        balcon_lado: { type: "string", enum: ["izq", "centro", "der", "todos"] },
        acento_lado: { type: "string", enum: ["izq", "der", "ninguno"] },
        acento_ancho: { type: "number", description: "Fracción del frente que ocupa el acento, 0.2 a 0.6" },
        acento_desde: { type: "integer", description: "0 si el acento baja hasta el suelo, 1 si empieza en la planta alta" },
        cubierta: { type: "string", enum: ["plano", "teja"] },
        cochera: { type: "boolean", description: "true si se ve un portón de cochera" },
        listones_hex: { type: "string", description: "Color de los paneles de listones / celosías verticales (#RRGGBB) o cadena vacía si no hay" },
        plafon_hex: { type: "string", description: "Color del plafón (cara inferior) de la losa volada o del alero, p. ej. madera u oscuro (#RRGGBB) o cadena vacía" },
        escalones: { type: "boolean", description: "true si el acceso tiene escalones al frente" },
        modulos: {
          type: "array",
          description: "Composición de la fachada en franjas verticales de IZQUIERDA a DERECHA (de 3 a 10 franjas), como se ve de frente. Cada cambio de elemento (macizo, ventanal, puerta, panel de listones) o de plano (volumen saliente) es una franja nueva. Respeta la simetría si la hay.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              ancho: { type: "number", description: "Fracción del ancho total de la fachada (todas suman 1)" },
              pb: { type: "string", enum: ["macizo", "ventanal", "ventana", "puerta", "puerta_doble", "listones", "cochera"], description: "Lo que hay en esta franja en planta baja. ventanal: vidrio casi de piso a techo; ventana: vano con antepecho; listones: panel de listones o celosía vertical; macizo: muro liso" },
              pa: { type: "string", enum: ["macizo", "ventanal", "ventana", "listones"], description: "Lo que hay en esta franja en plantas altas (macizo si es de un nivel)" },
              saliente: { type: "boolean", description: "true si esta franja pertenece a un volumen que sobresale del paño principal" },
              balcon: { type: "boolean", description: "true si al frente de esta franja corre un balcón o losa volada a la altura del entrepiso" },
              alero: { type: "boolean", description: "true si arriba de esta franja hay un alero o remate volado" },
              acabado: { type: "string", enum: ["muro", "acento"], description: "acento si la franja es de otro material o color (el de acento_hex)" },
            },
            required: ["ancho", "pb", "pa", "saliente", "balcon", "alero", "acabado"],
          },
        },
      },
      required: ["modulos", "listones_hex", "plafon_hex", "escalones", "muro_hex", "acento_hex", "cancel_hex", "puerta_hex", "porche_hex", "textura", "ventanas", "travesano", "ventana_alta", "puerta_lado", "puerta_doble", "porche", "losa_volada", "balcon", "balcon_lado", "acento_lado", "acento_ancho", "acento_desde", "cubierta", "cochera"],
    },
  },
  required: ["descripcion", "niveles", "estilo_actual", "estilo_sugerido", "material_principal", "elementos", "mejoras", "replica"],
};

async function leerFachada(archivo: { tipo: string; media_type: string; datos: string; nombre?: string }) {
  if (!archivo?.datos || archivo.datos.length > 14_000_000) throw new Error("archivo_invalido");
  const bloque = archivo.tipo === "pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: archivo.datos } }
    : { type: "image", source: { type: "base64", media_type: archivo.media_type || "image/jpeg", data: archivo.datos } };
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SISTEMA_ARQ,
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA_FACHADA } },
    messages: [{
      role: "user",
      content: [
        bloque,
        {
          type: "text",
          text: `Esta es la fachada de referencia (${archivo.nombre ?? "sin nombre"}), en foto, render o plano: el cliente quiere que la fachada de su proyecto se vea igual.
Describe en una frase lo que ves (niveles, material, cubierta, vanos). Indica su estilo y el material principal más parecido.
En "replica" describe la fachada TAL COMO SE VE para reproducirla: colores reales en #RRGGBB (corrige la luz cálida del atardecer y las sombras: un muro blanco es blanco), tipo de ventanas, travesaño, lado y tipo de la puerta, porche remetido, losa volada, balcón y su lado, volumen de acento y cubierta. Los lados se dicen mirando la fachada de frente.
Lo más importante es "modulos": la composición de izquierda a derecha con anchos proporcionales a lo que se ve (mide con cuidado), qué hay en planta baja y en planta alta de cada franja, qué franjas forman un volumen saliente, dónde corre el balcón o la losa volada y dónde hay alero. Con eso se reproduce la composición, la simetría y las proporciones de la referencia, no sólo sus colores.
En "elementos" marca lo que tiene la referencia. En "mejoras" da de 3 a 6 frases cortas sobre cómo adaptar esa fachada al proyecto, cada una con su porqué (clima, luz, privacidad, mantenimiento o valor).`,
        },
      ],
    }],
  } as never) as unknown as { content: Array<{ type: string; text?: string }>; stop_reason: string; model: string };
  if (msg.stop_reason === "refusal") throw new Error("rechazo");
  return { lectura: JSON.parse(texto(msg)), modelo: msg.model };
}

async function analizar(datos: unknown) {
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SISTEMA_ARQ,
    output_config: { effort: "high" },
    messages: [{
      role: "user",
      content: `Revisa este anteproyecto generado en la plataforma RINOVAIA y entrega tu dictamen como arquitecto experto.
Datos (JSON con proyecto, resultados de cálculo, espacios por nivel y la revisión automática por reglas):
${JSON.stringify(datos).slice(0, 60000)}

Formato (Markdown sencillo, máximo 600 palabras):
## Veredicto
Dos o tres frases: si el proyecto es viable y qué lo define.
## Fortalezas
## Riesgos y cómo resolverlos
Viñetas concretas, con cifras cuando apliquen (m², cajones, %, costos).
## Normativa y trámites
Qué revisar con el municipio de esa ciudad (uso de suelo, COS/CUS, estacionamiento, alturas, protección civil).
## Recomendaciones de diseño
Orientación, distribución, ventilación, materiales y estructura para ese clima y zona sísmica.
## Siguientes pasos
Lista numerada corta.
Aclara que es un anteproyecto y que el DRO y los corresponsables deben validarlo.`,
    }],
  } as never) as unknown as { content: Array<{ type: string; text?: string }>; stop_reason: string; model: string };
  if (msg.stop_reason === "refusal") throw new Error("rechazo");
  return { texto: texto(msg), modelo: msg.model };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, origin);
  if (origin && !ORIGINS.includes(origin)) return json({ error: "Origen no autorizado" }, 403, origin);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "RINOVAIA AI no tiene configurada la clave de Anthropic." }, 503, origin);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "anon";
  if (limited(ip)) return json({ error: "Demasiadas solicitudes. Espera unos minutos e intenta de nuevo." }, 429, origin);

  try {
    const body = await req.json();
    if (body.action === "plano") return json(await leerPlano(body.archivo), 200, origin);
    if (body.action === "croquis") return json(await leerCroquis(body.archivo), 200, origin);
    if (body.action === "fachada") return json(await leerFachada(body.archivo), 200, origin);
    if (body.action === "analisis") return json(await analizar(body.datos), 200, origin);
    return json({ error: "Acción desconocida" }, 400, origin);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error("rinova-ia", m);
    if (m === "archivo_invalido") return json({ error: "El archivo no es válido o es demasiado grande." }, 400, origin);
    if (m === "respuesta_incompleta") return json({ error: "El plano trae demasiados detalles para leerlo de una vez; sube cada planta por separado." }, 422, origin);
    if (m === "rechazo") return json({ error: "RINOVAIA AI no pudo procesar esta solicitud." }, 422, origin);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "RINOVAIA AI está saturada. Intenta en un minuto." }, 429, origin);
    if (e instanceof Anthropic.APIError) return json({ error: "RINOVAIA AI respondió con un error. Intenta de nuevo." }, 502, origin);
    return json({ error: "No fue posible completar la solicitud." }, 500, origin);
  }
});
