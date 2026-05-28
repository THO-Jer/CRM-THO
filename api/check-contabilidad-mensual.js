// Vercel Cron Function — resumen de cierre contable mensual
// Se ejecuta el día 26 de cada mes a las 12:00 UTC (≈ 09:00 Chile).
//
// Consulta Supabase y reporta cuántos registros hay por área contable en el mes:
//   - Facturas emitidas
//   - Facturas recibidas / gastos
//   - Boletas de honorarios
//   - Sueldos / retiros de socios
//   - Movimientos bancarios sin conciliar
//
// Siempre envía el resumen, tenga o no pendientes.
//
// Env vars requeridas en Vercel:
//   - SUPABASE_URL              URL del proyecto Supabase
//   - SUPABASE_SERVICE_ROLE_KEY Service role key (bypassa RLS)
//   - RESEND_API_KEY            API key de Resend (resend.com)
//   - ALERT_EMAILS              Emails separados por coma
//   - CRON_SECRET               String secreto para proteger llamadas manuales
//
// Prueba manual: GET /api/check-contabilidad-mensual?secret=<CRON_SECRET>

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL            = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY          = process.env.RESEND_API_KEY;
const ALERT_EMAILS            = process.env.ALERT_EMAILS || "jeremiasortizn@gmail.com";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRangoMes() {
  const now = new Date();
  const y   = now.getUTCFullYear();
  const m   = String(now.getUTCMonth() + 1).padStart(2, "0");
  const mesLabel = new Date(Date.UTC(y, now.getUTCMonth(), 1))
    .toLocaleString("es-CL", { month: "long", year: "numeric" });
  const mesCorto = new Date(Date.UTC(y, now.getUTCMonth(), 1))
    .toLocaleString("es-CL", { month: "long" });
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-31`, mesLabel, mesCorto };
}

async function contar(supabase, tabla, campoFecha, desde, hasta) {
  const { count, error } = await supabase
    .from(tabla)
    .select("*", { count: "exact", head: true })
    .gte(campoFecha, desde)
    .lte(campoFecha, hasta);
  if (error) { console.error(`[cron] ${tabla}:`, error.message); return null; }
  return count ?? 0;
}

async function contarPendientes(supabase) {
  const { count, error } = await supabase
    .from("movimientos_bancarios")
    .select("*", { count: "exact", head: true })
    .eq("estado_conciliacion", "pendiente");
  if (error) { console.error("[cron] movimientos pendientes:", error.message); return null; }
  return count ?? 0;
}

// ─── Email ────────────────────────────────────────────────────────────────────

async function enviarResumen(destinatarios, mesLabel, mesCorto, items) {
  if (!RESEND_API_KEY) { console.error("[cron] Falta RESEND_API_KEY"); return false; }

  const pendientes = items.filter(i => !i.ok).map(i => i.nombre);
  const todoBien   = pendientes.length === 0;

  const filas = items.map(item => {
    const colorFondo = item.ok ? "#f0fdf4" : "#fff7ed";
    const colorTexto = item.ok ? "#15803d" : "#c2410c";
    const badge      = item.ok
      ? `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;">✓ ${item.detalle}</span>`
      : `<span style="background:#ffedd5;color:#c2410c;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;">✗ ${item.detalle}</span>`;

    return `
    <tr style="background:${item.ok ? "#fff" : "#fffbf7"};">
      <td style="padding:11px 14px;font-size:18px;width:32px;">${item.icono}</td>
      <td style="padding:11px 14px;font-size:13px;color:#1f2937;font-weight:500;">${item.nombre}</td>
      <td style="padding:11px 14px;text-align:right;">${badge}</td>
    </tr>
    <tr><td colspan="3" style="padding:0;"><div style="height:1px;background:#f3f4f6;margin:0 14px;"></div></td></tr>`;
  }).join("");

  const resumenTexto = todoBien
    ? `Todo al día para ${mesCorto} 🎉`
    : `Pendiente: <strong>${pendientes.join(", ")}</strong>.`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;padding:24px;margin:0;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">

    <div style="background:#F97316;padding:22px 24px;">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">
        📋 Cierre contable · ${mesCorto}
      </h1>
      <p style="margin:5px 0 0;color:rgba(255,255,255,.85);font-size:13px;">
        Estado al día 26 — THO
      </p>
    </div>

    <div style="padding:20px 24px 8px;">
      <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">${resumenTexto}</p>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${filas}</tbody>
      </table>
    </div>

    <div style="padding:20px 24px 24px;">
      <a href="https://crm-tho.vercel.app"
         style="display:inline-block;background:#F97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">
        Ir al CRM →
      </a>
    </div>

    <div style="padding:12px 24px;background:#f9fafb;border-top:1px solid #f3f4f6;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">
        Enviado automáticamente el día 26 de cada mes · CRM THO
      </p>
    </div>
  </div>
</body>
</html>`;

  const asunto = todoBien
    ? `✅ Contabilidad al día — ${mesCorto}`
    : `📋 Cierre contable pendiente — ${mesCorto}: ${pendientes.join(", ")}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "CRM THO <onboarding@resend.dev>", // cambiar a crm@tho.cl si verificas dominio en Resend
      to: destinatarios,
      subject: asunto,
      html,
    }),
  });

  if (!res.ok) { console.error("[cron] Resend error:", await res.text()); return false; }
  return true;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const authHeader  = req.headers["authorization"] || "";
  const secretParam = req.query?.secret || "";
  const cronSecret  = process.env.CRON_SECRET || "";

  const autorizado =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (cronSecret && secretParam === cronSecret);

  if (!autorizado) return res.status(401).json({ error: "No autorizado" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    return res.status(500).json({ error: "Faltan env vars de Supabase" });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { desde, hasta, mesLabel, mesCorto } = getRangoMes();

  const [emitidas, recibidas, boletas, sueldos, pendientes] = await Promise.all([
    contar(supabase, "facturas_emitidas",  "fecha_emision", desde, hasta),
    contar(supabase, "facturas_recibidas", "fecha_emision", desde, hasta),
    contar(supabase, "boletas_honorarios", "fecha_emision", desde, hasta),
    contar(supabase, "sueldos_socios",     "fecha_pago",    desde, hasta),
    contarPendientes(supabase),
  ]);

  const items = [
    {
      icono:  "📤",
      nombre: "Facturas emitidas",
      ok:     emitidas !== null && emitidas > 0,
      detalle: emitidas === null ? "Error al consultar"
             : emitidas === 0   ? "Sin registros este mes"
             : `${emitidas} factura${emitidas !== 1 ? "s" : ""}`,
    },
    {
      icono:  "📥",
      nombre: "Facturas recibidas",
      ok:     recibidas !== null && recibidas > 0,
      detalle: recibidas === null ? "Error al consultar"
             : recibidas === 0   ? "Sin registros este mes"
             : `${recibidas} registro${recibidas !== 1 ? "s" : ""}`,
    },
    {
      icono:  "👤",
      nombre: "Boletas de honorarios",
      ok:     boletas !== null && boletas > 0,
      detalle: boletas === null ? "Error al consultar"
             : boletas === 0   ? "Sin registros este mes"
             : `${boletas} boleta${boletas !== 1 ? "s" : ""}`,
    },
    {
      icono:  "💰",
      nombre: "Sueldos / retiros",
      ok:     sueldos !== null && sueldos > 0,
      detalle: sueldos === null ? "Error al consultar"
             : sueldos === 0   ? "Sin registros este mes"
             : `${sueldos} registro${sueldos !== 1 ? "s" : ""}`,
    },
    {
      icono:  "🏦",
      nombre: "Conciliación bancaria",
      ok:     pendientes !== null && pendientes === 0,
      detalle: pendientes === null ? "Error al consultar"
             : pendientes === 0   ? "Sin pendientes"
             : `${pendientes} movimiento${pendientes !== 1 ? "s" : ""} sin conciliar`,
    },
  ];

  const destinatarios = ALERT_EMAILS.split(",").map(e => e.trim()).filter(Boolean);
  console.log(`[cron] cierre-mensual ${mesLabel}`, items.map(i => `${i.nombre}: ${i.detalle}`));

  const enviado = await enviarResumen(destinatarios, mesLabel, mesCorto, items);

  return res.status(200).json({
    ok: enviado,
    mes: mesLabel,
    items: items.map(({ icono, nombre, detalle, ok }) => ({ icono, nombre, detalle, ok })),
    emailEnviado: enviado,
  });
}
