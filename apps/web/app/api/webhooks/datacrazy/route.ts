import { NextRequest, NextResponse } from "next/server";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

// DataCrazy native webhook — creates lead + business with custom field mapping
const DATACRAZY_WEBHOOK_URL =
  "https://api.datacrazy.io/v1/crm/api/crm/integrations/webhook/business/69b031f7-f44c-4cca-a33f-10e4f92b987e";

// Map Formbricks question IDs to DataCrazy field names
const FIELD_MAP: Record<string, string> = {
  // Actual CUID2 question IDs from the surveys
  blx7ixux827c5xrcrb9fl2m9: "name", // Qual seu nome completo?
  vgt3oqqdaogjmeppsuyq2zn4: "email", // Qual seu e-mail?
  x69hbypuftyq99wb3x0drig8: "phone", // Qual seu Whatsapp?
  qziv755kb71axfzxsoo4n5rf: "company", // Qual a sua empresa?
  gm8e6hcyhdetukw1f4whlcuc: "instagram", // Qual o Instagram da sua empresa?
  ga04117jjo69bals1got7fng: "cargo", // Qual seu cargo atual?
  w0v1d756qnzrdzj3b60qd84e: "faturamento", // Qual seu faturamento mensal?
  rzg15b2mt47ea5h0imy4obpj: "checkout", // Qual checkout usa atualmente?
};

function mapFormbricksData(body: any): Record<string, string> {
  const responseData = body?.data?.data || body?.data?.response?.data || body?.data || {};
  const mappedData: Record<string, string> = {};

  for (const [questionId, value] of Object.entries(responseData)) {
    const fieldName = FIELD_MAP[questionId];
    if (fieldName && typeof value === "string") {
      mappedData[fieldName] = value;
    }
  }

  return mappedData;
}

async function sendToDataCrazy(data: Record<string, string>) {
  const response = await fetch(DATACRAZY_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const responseText = await response.text();
  console.log("[DataCrazy Webhook] Status:", response.status, "Response:", responseText);

  if (!response.ok) {
    throw new Error(`DataCrazy webhook failed: ${response.status} - ${responseText}`);
  }

  return responseText;
}

async function sendSlackNotification(data: Record<string, string>) {
  if (!SLACK_WEBHOOK_URL) return;

  const fields: string[] = [];
  if (data.name) fields.push(`*Nome:* ${data.name}`);
  if (data.email) fields.push(`*Email:* ${data.email}`);
  if (data.phone) fields.push(`*WhatsApp:* ${data.phone}`);
  if (data.company) fields.push(`*Empresa:* ${data.company}`);
  if (data.instagram) fields.push(`*Instagram:* ${data.instagram}`);
  if (data.cargo) fields.push(`*Cargo:* ${data.cargo}`);
  if (data.faturamento) fields.push(`*Faturamento:* ${data.faturamento}`);
  if (data.checkout) fields.push(`*Checkout:* ${data.checkout}`);

  const payload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🔥 Novo Lead — FirePay Enterprise",
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
            text: `Recebido via <https://forms.firepay.com.br|Formbricks> em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
          },
        ],
      },
    ],
  };

  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`[Slack] Failed: ${response.status} - ${await response.text()}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[DataCrazy Webhook] Received event:", body?.event);

    const mappedData = mapFormbricksData(body);
    console.log("[DataCrazy Webhook] Mapped data:", JSON.stringify(mappedData));

    if (!mappedData.name && !mappedData.email && !mappedData.phone) {
      console.log("[DataCrazy Webhook] No lead data found, skipping");
      return NextResponse.json({ success: true, message: "No lead data found, skipped" });
    }

    // 1. Send to DataCrazy native webhook (creates lead + business + custom fields)
    await sendToDataCrazy(mappedData);

    // 2. Send Slack notification
    try {
      await sendSlackNotification(mappedData);
    } catch (slackError) {
      console.error("[Slack] Error:", slackError);
    }

    return NextResponse.json({ success: true, ok: true });
  } catch (error) {
    console.error("[DataCrazy Webhook] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
