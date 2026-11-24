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

// Lectura geométrica de un plano, croquis o fachada (una imagen por solicitud).
const TIPOS_ESPACIO = ["sala", "comedor", "sala_comedor", "cocina", "recamara", "recamara_principal", "bano", "medio_bano", "estudio", "estancia",
  "pasillo", "vestibulo", "escalera", "closet", "vestidor", "lavado", "cochera", "terraza", "balcon", "jardin", "patio", "bodega", "local", "oficina", "otro"];
const ESQUEMA_PLANO = {
  type: "object",
  additionalProperties: false,
  properties: {
    clase: { type: "string", enum: ["planta", "fachada", "corte", "otro"], description: "Qué muestra la imagen" },
    nivel: { type: "integer", description: "0 = planta baja, 1 = primer piso / planta alta…" },
    tipo: { type: "string", enum: ["casa", "deptos", "comercial", "bodega"] },
    frente_m: { type: "number", description: "Ancho exterior del contorno construido en metros (eje x del dibujo)" },
    fondo_m: { type: "number", description: "Profundidad exterior del contorno construido en metros (eje y del dibujo)" },
    cotas_leidas: { type: "boolean", description: "true si frente y fondo salen de cotas escritas en el plano" },
    calle: { type: "string", enum: ["abajo", "arriba", "izquierda", "derecha", "desconocida"], description: "Lado del dibujo donde está la calle o el acceso principal" },
    espacios: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nombre: { type: "string", description: "En español de México: Sala, Comedor, Cocina, Recámara 1, Baño 1, Estudio, Estancia familiar, Escalera, Balcón…" },
          tipo: { type: "string", enum: TIPOS_ESPACIO },
          x: { type: "number", description: "Metros desde el borde izquierdo exterior del contorno" },
          y: { type: "number", description: "Metros desde el borde superior exterior del contorno" },
          ancho: { type: "number" },
          fondo: { type: "number" },
          grupo: { type: "integer", description: "0 si el espacio es un solo rectángulo; un mismo número > 0 para los rectángulos de un espacio en L" },
        },
        required: ["nombre", "tipo", "x", "y", "ancho", "fondo", "grupo"],
      },
    },
    puertas: {
      type: "array",
      items: {
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
      },
    },
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
  required: ["clase", "nivel", "tipo", "frente_m", "fondo_m", "cotas_leidas", "calle", "espacios", "puertas", "fachada", "observaciones", "confianza"],
};

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
      content: [
        bloque,
        {
          type: "text",
          text: `Archivo: ${archivo.nombre ?? "sin nombre"}. Vas a convertir este dibujo en datos para redibujar el plano a escala.

1. clase: "planta" si es una planta arquitectónica o croquis en planta; "fachada" si es una foto, render o alzado de fachada; "corte" u "otro" en los demás casos.
2. Si es planta:
   - frente_m y fondo_m: medidas EXTERIORES del contorno construido. Usa las cotas escritas (13000 en milímetros = 13 m; 1300 en centímetros = 13 m). Si no hay cotas, estima con puertas de 0.90 m, camas matrimoniales de 1.40 × 1.90 m y escusados de 0.40 × 0.70 m, y pon cotas_leidas = false.
   - nivel: deduce de títulos como "planta baja", "ground floor", "planta alta", "second floor", "primer nivel" (planta baja = 0; "second floor" en inglés = 1). Si no hay pistas y hay escalera con cocina y sala, 0.
   - espacios: TODOS los espacios como rectángulos en metros, con el origen en la esquina superior izquierda EXTERIOR del contorno, x hacia la derecha y y hacia abajo, tal como se ve en el dibujo (no lo gires). Los rectángulos deben cubrir el contorno completo sin traslaparse: incluye pasillos, vestíbulos, escalera, clósets grandes, terrazas y balcones dentro del contorno. Ajusta sus lados a los ejes de los muros que ves, de modo que dos espacios vecinos compartan exactamente el mismo borde. Un espacio en L o abierto a otro (por ejemplo estancia que rodea la escalera) se divide en rectángulos con el mismo número de grupo. Traduce los nombres al español de México y numera recámaras y baños.
   - puertas: cada puerta o vano con su posición en metros (el punto donde empieza el vano), orientación y ancho; marca principal = true solo en el acceso desde la calle.
   - calle: lado donde está el acceso principal o la calle (en una planta alta, el lado del balcón o de la fachada principal).
3. Si es fachada: llena "fachada" (descripción breve, niveles, estilo y material más parecidos, elementos presentes y de 4 a 8 mejoras concretas con su porqué) y deja espacios y puertas vacíos, frente_m y fondo_m en 0.
4. Para planta, llena fachada con valores neutros (descripcion vacía, niveles 0, contemporaneo, aplanado, elementos en false, mejoras vacío).
5. observaciones: máximo 6 frases cortas sobre lo que no se lee, supuestos y problemas de diseño (áreas mínimas, ventilación, circulación).`,
        },
      ],
    }],
  } as never) as unknown as { content: Array<{ type: string; text?: string }>; stop_reason: string; model: string };
  if (msg.stop_reason === "refusal") throw new Error("rechazo");
  return { lectura: JSON.parse(texto(msg)), modelo: msg.model };
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
      },
      required: ["muro_hex", "acento_hex", "cancel_hex", "puerta_hex", "porche_hex", "textura", "ventanas", "travesano", "ventana_alta", "puerta_lado", "puerta_doble", "porche", "losa_volada", "balcon", "balcon_lado", "acento_lado", "acento_ancho", "acento_desde", "cubierta", "cochera"],
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
    if (m === "rechazo") return json({ error: "RINOVAIA AI no pudo procesar esta solicitud." }, 422, origin);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "RINOVAIA AI está saturada. Intenta en un minuto." }, 429, origin);
    if (e instanceof Anthropic.APIError) return json({ error: "RINOVAIA AI respondió con un error. Intenta de nuevo." }, 502, origin);
    return json({ error: "No fue posible completar la solicitud." }, 500, origin);
  }
});
