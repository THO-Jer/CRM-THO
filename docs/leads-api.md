# API de Captación de Leads (THO Web -> CRM)

## Endpoint
- **Producción CRM**: `POST https://<tu-crm>/api/public/leads`
- **Staging CRM** (si existe): `POST https://<tu-crm-staging>/api/public/leads`

## Autenticación
Puedes usar cualquiera de estos mecanismos (el endpoint acepta ambos):

- `Authorization: Bearer <LEADS_API_KEY>`
- `x-api-key: <LEADS_API_KEY>`

> Guardar `LEADS_API_KEY` en variables de entorno (Vercel), nunca en el repo.

## CORS habilitado
Dominios permitidos por defecto:
- `https://tho-web.vercel.app`
- `https://tho.cl`
- `https://www.tho.cl`

Adicionalmente puedes sumar dominios con `LEADS_ALLOWED_ORIGINS` (CSV).

## Contrato del payload (JSON)
```json
{
  "name": "string",
  "email": "string (requerido)",
  "phone": "string (opcional)",
  "company": "string (opcional)",
  "service_interest": "esg | comunidad | organizacional | no_definido",
  "entry_type": "flash_audit_esg | scan_cultura | mapa_riesgos | general",
  "message": "string",
  "source": "tho-web",
  "page_url": "string",
  "utm": {
    "utm_source": "string",
    "utm_medium": "string",
    "utm_campaign": "string",
    "utm_content": "string",
    "utm_term": "string"
  },
  "consent": {
    "granted": true,
    "timestamp": "2026-01-15T17:33:00.000Z"
  },
  "metadata": {
    "browser": "Chrome",
    "language": "es-CL"
  },
  "honeypot": ""
}
```

## Respuestas
- `201` `{ "id": "<uuid>", "status": "created | updated" }`
- `400` payload inválido (por ejemplo sin email válido, o honeypot lleno)
- `401` API key inválida o ausente
- `405` método inválido
- `429` rate limit excedido

## Comportamiento CRM del lead
- El lead se guarda en `prospectos` (pipeline CRM).
- Se crea/actualiza en **etapa `Contactado`**.
- **Dedupe por email** (`lead_email`):
  - Si no existe -> crea prospecto nuevo (`status: created`).
  - Si existe -> actualiza ese prospecto (`status: updated`).
- Siempre guarda `lead_utm` y `lead_page_url` para atribución.
- Crea una actividad automática en `notas` para trazar la captación/actualización.

## Seguridad mínima implementada
- API key por `Bearer` o `x-api-key`.
- Rate limit en memoria por `token + IP`.
- Honeypot anti-spam (`honeypot`/`website` debe venir vacío).
- `captcha` aún no forzado (se puede agregar después).

## Variables de entorno requeridas (CRM)
- `LEADS_API_KEY=<secret_largo_y_unico>`
- `SUPABASE_URL=<https://...supabase.co>`
- `SUPABASE_SERVICE_ROLE_KEY=<service_role_key>`
- `LEADS_OWNER_USER_ID=<uuid_del_usuario_dueno_del_pipeline>`

Opcionales:
- `LEADS_ALLOWED_ORIGINS=https://qa.tho.cl,https://staging.tho.cl`
- `LEADS_RATE_LIMIT_MAX=30`
- `LEADS_RATE_LIMIT_WINDOW_MS=900000`

## Ejemplo cURL
```bash
curl -X POST 'https://<tu-crm>/api/public/leads' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <LEADS_API_KEY>' \
  -d '{
    "name": "María Pérez",
    "email": "maria@empresa.cl",
    "phone": "+56912345678",
    "company": "Empresa SPA",
    "service_interest": "esg",
    "entry_type": "flash_audit_esg",
    "message": "Quiero coordinar una demo",
    "source": "tho-web",
    "page_url": "https://tho-web.vercel.app/flash-audit",
    "utm": {
      "utm_source": "google",
      "utm_medium": "cpc",
      "utm_campaign": "esg_q1",
      "utm_content": "anuncio_1",
      "utm_term": "consultoria esg"
    },
    "consent": {
      "granted": true,
      "timestamp": "2026-01-15T17:33:00.000Z"
    },
    "metadata": {
      "browser": "Chrome",
      "language": "es-CL"
    },
    "honeypot": ""
  }'
```
