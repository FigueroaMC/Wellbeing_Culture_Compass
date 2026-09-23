// Edge Function: notify-lead-compass
//
// Qué hace: cuando alguien llena el Wellbeing Culture Compass y se guarda su
// lead en la tabla `leads_compass`, Supabase llama a esta función (vía un
// Database Webhook) y esta función le manda un correo de aviso a Paradigma B
// a través de Resend.
//
// Seguridad: solo responde si la petición trae el header
// "x-webhook-secret" con el mismo valor que el secret WEBHOOK_SECRET
// configurado aquí abajo — así nadie más puede usar esta URL para mandar
// correos en tu nombre.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const NOTIFY_TO = Deno.env.get("NOTIFY_TO") || "newsletter@paradigmab.com";
// Mientras tu dominio no esté verificado en Resend, el remitente tiene que
// ser el de prueba de Resend (onboarding@resend.dev). Cuando verifiques tu
// dominio, cambia esta variable NOTIFY_FROM en Supabase por algo como
// "Wellbeing Culture Compass <avisos@paradigmab.com>".
const NOTIFY_FROM = Deno.env.get("NOTIFY_FROM") || "Wellbeing Culture Compass <onboarding@resend.dev>";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const incomingSecret = req.headers.get("x-webhook-secret");
  if (!WEBHOOK_SECRET || incomingSecret !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!RESEND_API_KEY) {
    console.error("Falta configurar el secret RESEND_API_KEY en Supabase.");
    return new Response("Server misconfigured", { status: 500 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // El Database Webhook de Supabase manda la fila nueva dentro de "record".
  const lead = payload.record ?? payload;

  const nombre = lead.nombre ?? "(sin nombre)";
  const cargo = lead.cargo ?? "-";
  const empresa = lead.empresa ?? "-";
  const correo = lead.correo ?? "-";
  const celular = lead.celular ?? "-";
  const porcentaje = lead.porcentaje_global ?? "-";
  const nivel = lead.nivel_global ?? "-";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6; color:#1f1f1f;">
      <h2 style="color:#8F579F;">Nuevo diagnóstico en el Wellbeing Culture Compass</h2>
      <p><strong>Empresa:</strong> ${empresa}</p>
      <p><strong>Evaluado por:</strong> ${nombre} (${cargo})</p>
      <p><strong>Correo:</strong> ${correo}</p>
      <p><strong>Celular:</strong> ${celular}</p>
      <p><strong>Resultado:</strong> ${porcentaje}% — ${nivel}</p>
    </div>
  `;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: NOTIFY_FROM,
      to: [NOTIFY_TO],
      subject: `Nuevo lead: ${empresa} (${porcentaje}% — ${nivel})`,
      html,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error("Resend error:", errText);
    return new Response("Error sending email", { status: 502 });
  }

  return new Response("OK", { status: 200 });
});
