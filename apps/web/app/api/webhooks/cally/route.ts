import { NextRequest, NextResponse } from "next/server";

// DataCrazy native webhook — creates lead + business with custom field mapping
const DATACRAZY_WEBHOOK_URL =
  "https://api.datacrazy.io/v1/crm/api/crm/integrations/webhook/business/69b031f7-f44c-4cca-a33f-10e4f92b987e";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

function extractValue(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object" && val.value) return String(val.value);
  if (typeof val === "object" && val.label) return String(val.label);
  return String(val);
}

function mapCallyData(body: any): Record<string, string> {
  const mapped: Record<string, string> = {};

  // Cal.com/Cally webhook payload structure:
  // body.payload.attendees[0].name, body.payload.attendees[0].email
  // body.payload.responses.{fieldSlug} for custom fields
  const payload = body?.payload || body;
  const attendee = payload?.attendees?.[0] || {};
  const responses = payload?.responses || {};

  // Attendee info (always present)
  if (attendee.name) mapped.name = attendee.name;
  if (attendee.email) mapped.email = attendee.email;

  // Override with responses if available (responses have priority)
  const nameResp = extractValue(responses.name);
  const emailResp = extractValue(responses.email);
  if (nameResp) mapped.name = nameResp;
  if (emailResp) mapped.email = emailResp;

  // Phone/WhatsApp
  const phone = extractValue(responses.phone);
  if (phone) mapped.phone = phone;

  // Custom fields from Cally form
  const checkout = extractValue(responses.checkout);
  if (checkout) mapped.checkout = checkout;

  const faturamento = extractValue(responses.faturamento);
  if (faturamento) mapped.faturamento = faturamento;

  // Company (if field exists)
  const company = extractValue(responses.company);
  if (company) mapped.company = company;

  // Log all responses for debugging
  console.log("[Cally] All responses:", JSON.stringify(responses));

  return mapped;
}

async function sendToDataCrazy(data: Record<string, string>) {
  const response = await fetch(DATACRAZY_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const responseText = await response.text();
  console.log("[Cally→DataCrazy] Status:", response.status, "Response:", responseText);

  if (!response.ok) {
    throw new Error(`DataCrazy webhook failed: ${response.status} - ${responseText}`);
  }

  return responseText;
}

async function sendSlackNotification(data: Record<string, string>, payload: any) {
  if (!SLACK_WEBHOOK_URL) return;

  const fields: string[] = [];
  if (data.name) fields.push(`*Nome:* ${data.name}`);
  if (data.email) fields.push(`*Email:* ${data.email}`);
  if (data.phone) fields.push(`*WhatsApp:* ${data.phone}`);
  if (data.company) fields.push(`*Empresa:* ${data.company}`);
  if (data.checkout) fields.push(`*Checkout:* ${data.checkout}`);
  if (data.faturamento) fields.push(`*Faturamento:* ${data.faturamento}`);

  const p = payload?.payload || payload;
  if (p?.title) fields.push(`*Reunião:* ${p.title}`);
  if (p?.startTime) {
    const date = new Date(p.startTime);
    fields.push(`*Data:* ${date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  }

  const slackPayload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📅 Nova Reserva — Cally",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: fields.join("\n"),
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Recebido via Cally em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
          },
        ],
      },
    ],
  };

  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(slackPayload),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[Cally Webhook] Received:", JSON.stringify(body).substring(0, 500));

    const mappedData = mapCallyData(body);
    console.log("[Cally Webhook] Mapped:", JSON.stringify(mappedData));

    if (!mappedData.name && !mappedData.email) {
      console.log("[Cally Webhook] No attendee data, skipping");
      return NextResponse.json({ success: true, message: "No attendee data" });
    }

    // 1. Send to DataCrazy
    await sendToDataCrazy(mappedData);

    // 2. Send Slack notification
    try {
      await sendSlackNotification(mappedData, body);
    } catch (e) {
      console.error("[Cally→Slack] Error:", e);
    }

    return NextResponse.json({ success: true, ok: true });
  } catch (error) {
    console.error("[Cally Webhook] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
