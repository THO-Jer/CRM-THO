// Vercel Serverless Function — ES Module syntax
// POST /api/public/leads
//
// Endpoint público que recibe leads desde el sitio tho.cl (vía tho-web/src/lib/crm.ts).
// Valida con LEADS_API_KEY, inserta en public.prospectos usando Supabase service-role
// (bypassa RLS porque el caller no está autenticado), y asigna el owner desde LEADS_OWNER_USER_ID.
//
// Env vars requeridas en Vercel:
//   - SUPABASE_URL                  (la del proyecto Supabase, ej: https://xxx.supabase.co)
//   - SUPABASE_SERVICE_ROLE_KEY     (service role key — NO publicable)
//   - LEADS_API_KEY                 (debe coincidir con el LEADS_API_KEY de tho-web)
//   - LEADS_OWNER_USER_ID           (auth.users.id del consultor que recibirá los leads)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://bepifbenblkqjuplvylh.supabase.co";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEADS_API_KEY = process.env.LEADS_API_KEY;
const LEADS_OWNER_USER_ID = process.env.LEADS_OWNER_USER_ID;

function getApiKey(req) {
  const auth = req.headers["authorization"] || req.headers["Authorization"] || "";
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const headerKey = req.headers["x-api-key"];
  if (headerKey) return String(headerKey).trim();
  if (req.body && typeof req.body.apiKey === "string") {
    return req.body.apiKey.trim();
  }
  return null;
}

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildNotas(payload) {
  const parts = [];
  if (payload.email) parts.push(`Email: ${payload.email}`);
  if (payload.phone) parts.push(`Teléfono: ${payload.phone}`);
  if (payload.serviceName) parts.push(`Servicio: ${payload.serviceName}`);
  if (payload.levelName) parts.push(`Nivel: ${payload.levelName}`);
  if (payload.resourceName) parts.push(`Recurso: ${payload.resourceName}`);
  if (payload.message) parts.push(`Mensaje: ${payload.message}`);
  if (payload.eventLabel) parts.push(`Evento: ${payload.eventLabel}`);
  if (payload.source) parts.push(`Source: ${payload.source}`);
  if (payload.pageUrl) parts.push(`URL: ${payload.pageUrl}`);
  if (payload.utm && typeof payload.utm === "object" && Object.keys(payload.utm).length > 0) {
    parts.push(`UTM: ${JSON.stringify(payload.utm)}`);
  }
  return parts.join("\n");
}

function dateNDaysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", method: req.method });
  }

  // Server-side config checks
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[LEADS API] missing SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY" });
  }
  if (!LEADS_API_KEY) {
    console.error("[LEADS API] missing LEADS_API_KEY");
    return res.status(500).json({ error: "Server misconfigured: LEADS_API_KEY" });
  }
  if (!LEADS_OWNER_USER_ID) {
    console.error("[LEADS API] missing LEADS_OWNER_USER_ID");
    return res.status(500).json({ error: "Server misconfigured: LEADS_OWNER_USER_ID" });
  }

  // Auth
  const providedKey = getApiKey(req);
  if (!providedKey || providedKey !== LEADS_API_KEY) {
    console.warn("[LEADS API] unauthorized", {
      hasAuth: !!req.headers["authorization"],
      hasXApiKey: !!req.headers["x-api-key"],
      hasBodyKey: !!(req.body && req.body.apiKey),
    });
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Validate body
  const body = req.body || {};
  const name = safeString(body.name);
  const email = safeString(body.email);
  const company = safeString(body.company);

  if (!name || !email) {
    return res.status(400).json({ error: "Missing required fields: name, email" });
  }

  // Build prospecto row
  const tipo =
    safeString(body.serviceName) ||
    safeString(body.resourceName) ||
    safeString(body.type) ||
    "Lead web";

  const prospecto = {
    user_id: LEADS_OWNER_USER_ID,
    organizacion: company || "Sin organización",
    contacto: `${name} <${email}>`,
    tipo,
    estado: "Lead nuevo",
    valor: 0,
    probabilidad: 10,
    proximo_paso: "Revisar lead y contactar",
    fecha_limite: dateNDaysFromNow(7),
    notas: buildNotas(body),
    fecha_contacto: dateNDaysFromNow(0),
  };

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("prospectos")
      .insert(prospecto)
      .select("id")
      .single();

    if (error) {
      console.error("[LEADS API] supabase insert error", error.message, error.details || "");
      return res.status(500).json({ error: "Insert failed", details: error.message });
    }

    console.log("[LEADS API] inserted prospecto", data?.id, "email=", email, "tipo=", tipo);
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err) {
    console.error("[LEADS API] unexpected error", err);
    return res.status(500).json({
      error: "Internal error",
      message: err && err.message ? err.message : String(err),
    });
  }
}
