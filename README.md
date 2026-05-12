# CRM THO (Vite + Vercel + Supabase)

Esta versión evita la **pantalla blanca** en Vercel porque el JSX se compila con Vite.

## 1) Crear tabla y RLS en Supabase

Supabase -> **SQL Editor** -> pega y ejecuta:

```sql
create extension if not exists pgcrypto;

create table if not exists public.prospectos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  organizacion text not null,
  contacto text not null,
  tipo text not null,
  estado text not null,
  valor numeric not null,
  probabilidad int not null default 10,
  proximo_paso text not null,
  fecha_limite date not null,
  notas text,
  fecha_contacto date default current_date,
  created_at timestamptz default now()
);

alter table public.prospectos enable row level security;

drop policy if exists "prospectos_select_own" on public.prospectos;
create policy "prospectos_select_own"
on public.prospectos for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "prospectos_insert_own" on public.prospectos;
create policy "prospectos_insert_own"
on public.prospectos for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "prospectos_update_own" on public.prospectos;
create policy "prospectos_update_own"
on public.prospectos for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "prospectos_delete_own" on public.prospectos;
create policy "prospectos_delete_own"
on public.prospectos for delete
to authenticated
using (auth.uid() = user_id);
```

## 2) Auth en Supabase
Supabase -> **Authentication -> Providers**:
- Email: ON
- (Opcional) desactiva "Confirm email" si quieres acceso inmediato.

## 3) Deploy en Vercel
Vercel detecta Vite y ejecuta `npm install` + `npm run build` automáticamente.

### Sin terminal (recomendado)
Usa **GitHub Desktop**:
1. Clona tu repo `CRM-THO`
2. Copia el contenido de esta carpeta dentro del repo (reemplazando lo anterior)
3. Commit + Push

Luego en Vercel (ya conectado al repo):
- Deploys -> se redeployea solo

### Con terminal
```bash
npm install
npm run dev
```

## 4) Supabase keys
Están en `src/supabaseClient.js` (publicables).

---

## 5) Endpoint público de captura de leads

`api/public/leads.js` es una serverless function que recibe leads desde el sitio público (`tho.cl`) y los inserta como nuevos prospectos en Supabase.

### Cómo funciona

1. `tho-web` POSTea a `https://crm-tho.vercel.app/api/public/leads` con los datos del formulario (nombre, email, organización, servicio, nivel, mensaje, etc.).
2. La función valida un API key compartido.
3. Inserta en la tabla `prospectos` usando la **service role key** de Supabase (bypassa RLS porque el caller no está autenticado).
4. El prospecto queda asignado al owner definido por env var (`LEADS_OWNER_USER_ID`).
5. El owner ve el prospecto en su Pipeline como **Lead nuevo**, valor 0, probabilidad 10%, próximo paso "Revisar lead y contactar".

### Env vars requeridas en Vercel (proyecto CRM-THO)

| Variable | Para qué sirve |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase (ej: `https://bepifbenblkqjuplvylh.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de Supabase. **No publicable** — sólo en server-side, nunca en el cliente. |
| `LEADS_API_KEY` | Token compartido con `tho-web`. El sitio público lo envía en `Authorization: Bearer`. Debe coincidir EXACTO con el `LEADS_API_KEY` del proyecto `tho-web`. |
| `LEADS_OWNER_USER_ID` | UUID de Supabase Auth del consultor que recibirá los leads. Se obtiene en Supabase Dashboard → Authentication → Users → click sobre tu usuario → `id`. |

### Test rápido

```bash
curl -X POST https://crm-tho.vercel.app/api/public/leads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <LEADS_API_KEY>" \
  -d '{"name":"Test","email":"test@example.com","company":"Test Co","type":"brochure_download","serviceName":"Sostenibilidad Corporativa","levelName":"Nivel 1"}'
```

Respuesta esperada: `{"ok":true,"id":"<uuid del prospecto creado>"}`. Luego se ve en el dashboard del CRM como "Lead nuevo".
