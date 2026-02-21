import { createClient } from '@supabase/supabase-js';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://tho-web.vercel.app',
  'https://www.tho-web.vercel.app',
  'https://tho.cl',
  'https://www.tho.cl'
];

const SERVICE_INTERESTS = new Set(['esg', 'comunidad', 'organizacional', 'no_definido']);
const ENTRY_TYPES = new Set(['flash_audit_esg', 'scan_cultura', 'mapa_riesgos', 'general']);
const rateLimitStore = new Map();

function getAllowedOrigins() {
  const extra = (process.env.LEADS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function setCorsHeaders(req, res) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/$/, '') : '';
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
}

function extractApiKey(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  if (req.headers['x-api-key']) return req.headers['x-api-key'];

  const body = asJson(req.body);
  if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
    return body.apiKey.trim();
  }

  return '';
}

function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string') {
    return xForwardedFor.split(',')[0].trim();
  }

  return req.socket?.remoteAddress || 'unknown';
}

function applyRateLimit(req, res, token) {
  const maxRequests = Number(process.env.LEADS_RATE_LIMIT_MAX || 30);
  const windowMs = Number(process.env.LEADS_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
  const key = `${token}:${getClientIp(req)}`;
  const now = Date.now();

  const item = rateLimitStore.get(key);
  if (!item || now > item.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (item.count >= maxRequests) {
    res.setHeader('Retry-After', Math.ceil((item.resetAt - now) / 1000));
    return false;
  }

  item.count += 1;
  return true;
}

function asJson(reqBody) {
  if (!reqBody) return {};
  if (typeof reqBody === 'object') return reqBody;
  if (typeof reqBody === 'string') {
    try {
      return JSON.parse(reqBody);
    } catch {
      return {};
    }
  }

  return {};
}

function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizePayload(raw) {
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const serviceInterest = SERVICE_INTERESTS.has(raw.service_interest) ? raw.service_interest : 'no_definido';
  const entryType = ENTRY_TYPES.has(raw.entry_type) ? raw.entry_type : 'general';
  const pageUrl = typeof raw.page_url === 'string' ? raw.page_url.trim() : '';

  return {
    name: typeof raw.name === 'string' ? raw.name.trim() : '',
    email,
    phone: typeof raw.phone === 'string' ? raw.phone.trim() : null,
    company: typeof raw.company === 'string' ? raw.company.trim() : null,
    serviceInterest,
    entryType,
    message: typeof raw.message === 'string' ? raw.message.trim() : null,
    source: typeof raw.source === 'string' ? raw.source.trim() : 'tho-web',
    pageUrl,
    utm: {
      utm_source: raw.utm?.utm_source || null,
      utm_medium: raw.utm?.utm_medium || null,
      utm_campaign: raw.utm?.utm_campaign || null,
      utm_content: raw.utm?.utm_content || null,
      utm_term: raw.utm?.utm_term || null
    },
    consent: {
      granted: Boolean(raw.consent?.granted ?? raw.consent),
      timestamp: raw.consent?.timestamp || new Date().toISOString()
    },
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    honeypot: raw.website || raw.honeypot || ''
  };
}

function buildLeadNotes(payload) {
  return [
    `Lead captado por API (${payload.source}).`,
    payload.message ? `Mensaje: ${payload.message}` : null,
    `Página: ${payload.pageUrl || 'no informada'}`,
    `UTM: ${JSON.stringify(payload.utm)}`,
    `Interés: ${payload.serviceInterest}`,
    `Entry type: ${payload.entryType}`
  ]
    .filter(Boolean)
    .join('\n');
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expectedApiKey = process.env.LEADS_API_KEY;
  const incomingApiKey = extractApiKey(req);

  if (!expectedApiKey) {
    return res.status(500).json({ error: 'Server misconfigured: LEADS_API_KEY missing' });
  }

  if (!incomingApiKey || incomingApiKey !== expectedApiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!applyRateLimit(req, res, incomingApiKey)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const payload = normalizePayload(asJson(req.body));

  if (payload.honeypot) {
    return res.status(400).json({ error: 'Spam detected' });
  }

  if (!payload.email || !isEmailValid(payload.email)) {
    return res.status(400).json({ error: 'Invalid payload: email is required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  const leadsOwnerUserId = process.env.LEADS_OWNER_USER_ID;
  const supabaseTokenRole = decodeJwtPayload(supabaseServiceRoleKey || '')?.role;

  if (!supabaseUrl || !supabaseServiceRoleKey || !leadsOwnerUserId) {
    return res.status(500).json({
      error: 'Server misconfigured: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY) and LEADS_OWNER_USER_ID are required'
    });
  }

  if (supabaseTokenRole && supabaseTokenRole !== 'service_role') {
    return res.status(500).json({
      error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY must be the service_role key (not anon key)'
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const nowIso = new Date().toISOString();

  const leadData = {
    user_id: leadsOwnerUserId,
    organizacion: payload.company || 'Lead web sin empresa',
    contacto: payload.name || payload.email,
    tipo: payload.entryType,
    estado: 'Contactado',
    valor: 0,
    probabilidad: 10,
    proximo_paso: 'Primer contacto comercial',
    fecha_limite: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notas: buildLeadNotes(payload),
    lead_email: payload.email,
    lead_phone: payload.phone,
    lead_source: payload.source,
    lead_page_url: payload.pageUrl,
    lead_utm: payload.utm,
    lead_metadata: payload.metadata,
    lead_service_interest: payload.serviceInterest,
    lead_entry_type: payload.entryType,
    lead_consent: payload.consent.granted,
    lead_consent_at: payload.consent.timestamp,
    updated_at: nowIso
  };

  const { data: existing, error: findError } = await supabase
    .from('prospectos')
    .select('id')
    .eq('lead_email', payload.email)
    .maybeSingle();

  if (findError) {
    return res.status(500).json({ error: 'Could not check duplicate leads', details: findError.message });
  }

  let leadId;
  let status;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('prospectos')
      .update({ ...leadData, estado: 'Contactado' })
      .eq('id', existing.id);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update duplicate lead', details: updateError.message });
    }

    leadId = existing.id;
    status = 'updated';
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('prospectos')
      .insert([leadData])
      .select('id')
      .single();

    if (insertError) {
      return res.status(500).json({ error: 'Failed to create lead', details: insertError.message });
    }

    leadId = inserted.id;
    status = 'created';
  }

  const activity = {
    entidad_tipo: 'prospecto',
    entidad_id: leadId,
    tipo: 'nota',
    contenido: existing?.id
      ? `Lead duplicado por email. Se actualizó prospecto existente (${payload.email}).`
      : `Lead nuevo recibido por API (${payload.email}).`,
    created_by_email: 'captacion-api@tho.cl'
  };

  const { error: noteError } = await supabase.from('notas').insert([activity]);
  if (noteError) {
    console.warn('No se pudo crear actividad automática en notas:', noteError.message);
  }

  return res.status(201).json({ id: leadId, status });
}
