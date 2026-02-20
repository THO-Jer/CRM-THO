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

## 5) Captación de leads desde THO Web

Se agregó un endpoint serverless para captación:

- `POST /api/public/leads`

Documentación completa de contrato, seguridad, CORS, ENVs y ejemplos:

- `docs/leads-api.md`

Antes de usarlo, ejecutar también la migración SQL:

- `sql/leads-captacion-migration.sql`
