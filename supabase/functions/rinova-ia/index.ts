// RINOVAIA AI — función de Supabase (Deno) que usa Claude para:
//   action "croquis":  leer un croquis (foto o PDF) y devolver tipo de inmueble, medidas, niveles y programa.
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
function limited(ip: string, max = 12, windowMs = 10 * 60 * 1000) {
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
    if (body.action === "croquis") return json(await leerCroquis(body.archivo), 200, origin);
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
