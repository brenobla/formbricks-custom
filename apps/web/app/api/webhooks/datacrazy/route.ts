import { NextRequest, NextResponse } from "next/server";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

const DATACRAZY_API_URL = "https://api.g1.datacrazy.io/api/v1";
const DATACRAZY_TOKEN =
  "dc_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmIyNzE2ODJlYTgwNWMyNDIzZjIwNCIsInRlbmFudElkIjoiODVlMjA3M2EtMzg4Ny00Y2QyLWFkODMtZjkwNTg0YTJhMzE0IiwibmFtZSI6IkZvcm1icmlja3MiLCJyb2xlcyI6WyJhZG1pbiJdLCJpc0FkbWluIjp0cnVlLCJpYXQiOjE3NzM4NzI5MTgsImV4cCI6MTg0MTcxMzE5OX0.w-rnb8VgXq8Zqp0eQ8P0ZUVQKdjxSfJPtJOOjZqnd6k";

// Pipeline SDR > Stage "Smart Lead"
const SDR_SMARTLEAD_STAGE_ID = "76cbf3a7-07a2-4af7-9816-95c923630be2";

// DataCrazy native webhook — creates lead + business with custom field mapping
const DATACRAZY_WEBHOOK_URL =
  "https://api.datacrazy.io/v1/crm/api/crm/integrations/webhook/business/69b031f7-f44c-4cca-a33f-10e4f92b987e";

// Map Formbricks question IDs to DataCrazy lead fields
// These IDs come from the survey blocks
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
  // Legacy fallback IDs
  q_nome: "name",
  q_email: "email",
  q_whatsapp: "phone",
  q_empresa: "company",
  q_site: "site",
  q_cargo: "cargo",
  q_faturamento: "faturamento",
  q_checkout: "checkout",
};

async function createDataCrazyLead(data: Record<string, string>) {
  const leadPayload: Record<string, any> = {
    name: data.name || "Lead Formbricks",
    source: "Formulário Enterprise - Formbricks",
  };

  if (data.email) leadPayload.email = data.email;
  if (data.phone) leadPayload.phone = data.phone;
  if (data.company) leadPayload.company = data.company;
  if (data.site) leadPayload.site = data.site;
  if (data.instagram) leadPayload.instagram = data.instagram;

  // Add cargo, faturamento, checkout as notes
  const notes: string[] = [];
  if (data.cargo) notes.push(`Cargo: ${data.cargo}`);
  if (data.faturamento) notes.push(`Faturamento: ${data.faturamento}`);
  if (data.checkout) notes.push(`Checkout atual: ${data.checkout}`);
  if (notes.length > 0) {
    leadPayload.notes = notes.join("\n");
  }

  const response = await fetch(`${DATACRAZY_API_URL}/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DATACRAZY_TOKEN}`,
    },
    body: JSON.stringify(leadPayload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DataCrazy create lead failed: ${response.status} - ${error}`);
  }

  return response.json();
}

async function createDataCrazyBusiness(leadId: string) {
  const response = await fetch(`${DATACRAZY_API_URL}/businesses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DATACRAZY_TOKEN}`,
    },
    body: JSON.stringify({
      leadId,
      stageId: SDR_SMARTLEAD_STAGE_ID,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DataCrazy create business failed: ${response.status} - ${error}`);
  }

  return response.json();
}

async function sendSlackNotification(data: Record<string, string>) {
  const fields: string[] = [];
  if (data.name) fields.push(`*Nome:* ${data.name}`);
  if (data.email) fields.push(`*Email:* ${data.email}`);
  if (data.phone) fields.push(`*WhatsApp:* ${data.phone}`);
  if (data.company) fields.push(`*Empresa:* ${data.company}`);
  if (data.site) fields.push(`*Site:* ${data.site}`);
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
    const error = await response.text();
    console.error(`[Slack Webhook] Failed: ${response.status} - ${error}`);
  } else {
    console.log("[Slack Webhook] Notification sent successfully");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Formbricks webhook payload has: event, data (with responseId, response, surveyId, etc.)
    const responseData = body?.data?.data || body?.data?.response?.data || body?.data || {};

    console.log("[DataCrazy Webhook] Received payload:", JSON.stringify(body, null, 2));
    console.log("[DataCrazy Webhook] Response data:", JSON.stringify(responseData, null, 2));

    // Extract fields from Formbricks response
    // Response data keys are the question IDs, values are the answers
    const mappedData: Record<string, string> = {};

    for (const [questionId, value] of Object.entries(responseData)) {
      const fieldName = FIELD_MAP[questionId];
      if (fieldName && typeof value === "string") {
        mappedData[fieldName] = value;
      } else if (!fieldName) {
        // Try to match by partial key (in case IDs are CUID2 format)
        const lowerKey = questionId.toLowerCase();
        if (lowerKey.includes("nome") || lowerKey.includes("name")) mappedData.name = String(value);
        else if (lowerKey.includes("email")) mappedData.email = String(value);
        else if (lowerKey.includes("whatsapp") || lowerKey.includes("phone") || lowerKey.includes("telefone"))
          mappedData.phone = String(value);
        else if (lowerKey.includes("empresa") || lowerKey.includes("company"))
          mappedData.company = String(value);
        else if (lowerKey.includes("site") || lowerKey.includes("url")) mappedData.site = String(value);
        else if (lowerKey.includes("cargo")) mappedData.cargo = String(value);
        else if (lowerKey.includes("faturamento") || lowerKey.includes("receita"))
          mappedData.faturamento = String(value);
        else if (lowerKey.includes("checkout")) mappedData.checkout = String(value);
      }
    }

    // Also check if data is nested differently
    if (Object.keys(mappedData).length === 0 && body?.data) {
      // Try flat structure
      for (const [key, value] of Object.entries(body.data)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes("nome") || lowerKey.includes("name")) mappedData.name = String(value);
        else if (lowerKey.includes("email")) mappedData.email = String(value);
        else if (lowerKey.includes("whatsapp") || lowerKey.includes("phone"))
          mappedData.phone = String(value);
        else if (lowerKey.includes("empresa") || lowerKey.includes("company"))
          mappedData.company = String(value);
        else if (lowerKey.includes("site")) mappedData.site = String(value);
        else if (lowerKey.includes("cargo")) mappedData.cargo = String(value);
        else if (lowerKey.includes("faturamento")) mappedData.faturamento = String(value);
        else if (lowerKey.includes("checkout")) mappedData.checkout = String(value);
      }
    }

    console.log("[DataCrazy Webhook] Mapped data:", JSON.stringify(mappedData, null, 2));

    if (!mappedData.name && !mappedData.email && !mappedData.phone) {
      console.log("[DataCrazy Webhook] No lead data found, skipping");
      return NextResponse.json({ success: true, message: "No lead data found, skipped" });
    }

    // 1. Create lead + business via API (ensures correct pipeline/stage)
    const lead = await createDataCrazyLead(mappedData);
    console.log("[DataCrazy Webhook] Lead created:", JSON.stringify(lead, null, 2));

    const business = await createDataCrazyBusiness(lead.id);
    console.log("[DataCrazy Webhook] Business created in SDR/Smart Lead:", JSON.stringify(business, null, 2));

    // 2. Also send to native webhook to populate custom fields (non-blocking)
    try {
      const dcWebhookResponse = await fetch(DATACRAZY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mappedData),
      });
      console.log("[DataCrazy Webhook] Native webhook status:", dcWebhookResponse.status);
    } catch (webhookError) {
      console.error("[DataCrazy Webhook] Native webhook error:", webhookError);
    }

    // 3. Send Slack notification (non-blocking)
    try {
      await sendSlackNotification(mappedData);
    } catch (slackError) {
      console.error("[Slack Webhook] Error:", slackError);
    }

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      businessId: business.id,
    });
  } catch (error) {
    console.error("[DataCrazy Webhook] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
