// Vercel Serverless Function — administración de cuentas de inicio de sesión
//
//   GET    /api/admin/usuarios   → lista de cuentas de Supabase Auth (email,
//                                  proveedor, creada, último ingreso). Admin o superadmin.
//   DELETE /api/admin/usuarios   → body { email }. Borra el acceso al CRM (si
//                                  existe) y la cuenta de Supabase Auth. Sólo superadmin.
//
// Por qué existe: borrar una cuenta de auth.users y leer el "último ingreso"
// requieren la service role key, que nunca debe estar en el navegador.
// El caller se identifica con su access_token de Supabase (Authorization: Bearer)
// y su rol se valida contra public.crm_members.
//
// OJO: las cuentas de Supabase Auth son compartidas con tho-web (Studio).
// Borrar una cuenta también le quita el login a Studio.
//
// Env vars (Vercel): SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getCaller(admin, req) {
  const header = req.headers["authorization"] || "";
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email) return null;
  const { data: m, error: mErr } = await admin
    .from("crm_members")
    .select("email, rol, activo")
    .eq("email", email)
    .maybeSingle();
  if (mErr || !m || !m.activo) return null;
  return { email, rol: m.rol };
}

async function listarCuentas(admin) {
  const cuentas = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    cuentas.push(...users);
    if (users.length < 200) break;
  }
  return cuentas;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: "Servidor sin configurar (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." });
  }
  const admin = adminClient();
  const caller = await getCaller(admin, req);
  if (!caller || !["superadmin", "admin"].includes(caller.rol)) {
    return res.status(403).json({ error: "No autorizado." });
  }

  try {
    if (req.method === "GET") {
      const users = await listarCuentas(admin);
      const cuentas = users
        .filter((u) => u.email)
        .map((u) => ({
          email: u.email.toLowerCase(),
          proveedor: u.app_metadata?.provider || null,
          creada: u.created_at || null,
          ultimo_ingreso: u.last_sign_in_at || null,
        }));
      return res.status(200).json({ cuentas });
    }

    if (req.method === "DELETE") {
      if (caller.rol !== "superadmin") {
        return res.status(403).json({ error: "Sólo el superadmin puede borrar cuentas." });
      }
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "Falta el email." });
      if (email === caller.email) return res.status(400).json({ error: "No puedes borrar tu propia cuenta." });

      // 1. Quitar acceso al CRM (el trigger impide dejar el CRM sin superadmin)
      const { error: delErr } = await admin.from("crm_members").delete().eq("email", email);
      if (delErr) return res.status(409).json({ error: delErr.message });

      // 2. Borrar la cuenta de inicio de sesión
      const users = await listarCuentas(admin);
      const user = users.find((u) => (u.email || "").toLowerCase() === email);
      if (!user) {
        return res.status(200).json({ ok: true, mensaje: "Acceso al CRM eliminado. No había cuenta de inicio de sesión." });
      }
      const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
      if (authErr) {
        console.error("[admin/usuarios] deleteUser", email, authErr.message);
        return res.status(409).json({
          error: "Se quitó el acceso al CRM, pero la cuenta de inicio de sesión no se pudo borrar (puede tener registros asociados). Ya no puede entrar al CRM.",
        });
      }
      console.log("[admin/usuarios] cuenta borrada por", caller.email);
      return res.status(200).json({ ok: true, mensaje: "Cuenta y acceso eliminados." });
    }

    return res.status(405).json({ error: "Método no permitido." });
  } catch (err) {
    console.error("[admin/usuarios] error", err?.message || err);
    return res.status(500).json({ error: "Error interno." });
  }
}
