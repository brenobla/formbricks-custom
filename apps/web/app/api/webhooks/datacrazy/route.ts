import { NextRequest, NextResponse } from "next/server";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

const DATACRAZY_API_URL = "https://api.g1.datacrazy.io/api/v1";
const DATACRAZY_TOKEN =
  "dc_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmIyNzE2ODJlYTgwNWMyNDIzZjIwNCIsInRlbmFudElkIjoiODVlMjA3M2EtMzg4Ny00Y2QyLWFkODMtZjkwNTg0YTJhMzE0IiwibmFtZSI6IkZvcm1icmlja3MiLCJyb2xlcyI6WyJhZG1pbiJdLCJpc0FkbWluIjp0cnVlLCJpYXQiOjE3NzM4NzI5MTgsImV4cCI6MTg0MTcxMzE5OX0.w-rnb8VgXq8Zqp0eQ8P0ZUVQKdjxSfJPtJOOjZqnd6k";

// Pipeline SDR > Stage "Smart Lead"
const SDR_SMARTLEAD_STAGE_ID = "76cbf3a7-07a2-4af7-9816-95c923630be2";

// Map Formbricks question IDs to field names
const FIELD_MAP: Record<string, string> = {
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

async function createLead(data: Record<string, string>) {
  const payload: Record<string, any> = {
    name: data.name || "Lead Formbricks",
    source: "Formulário Enterprise - Formbricks",
  };

  if (data.email) payload.email = data.email;
  if (data.phone) payload.phone = data.phone;
  if (data.company) payload.company = data.company;
  if (data.instagram) payload.instagram = data.instagram;

  const notes: string[] = [];
  if (data.cargo) notes.push(`Cargo: ${data.cargo}`);
  if (data.faturamento) notes.push(`Faturamento: ${data.faturamento}`);
  if (data.checkout) notes.push(`Checkout: ${data.checkout}`);
  if (notes.length > 0) payload.notes = notes.join("\n");

  const res = await fetch(`${DATACRAZY_API_URL}/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DATACRAZY_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create lead failed: ${res.status} - ${err}`);
  }
  return res.json();
}

async function createBusiness(leadId: string) {
  const res = await fetch(`${DATACRAZY_API_URL}/businesses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DATACRAZY_TOKEN}`,
    },
    body: JSON.stringify({ leadId, stageId: SDR_SMARTLEAD_STAGE_ID }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create business failed: ${res.status} - ${err}`);
  }
  return res.json();
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

  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "🔥 Novo Lead — FirePay Enterprise", emoji: true },
        },
        { type: "section", text: { type: "mrkdwn", text: fields.join("\n") } },
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
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[DataCrazy] Received event:", body?.event);

    const mappedData = mapFormbricksData(body);
    console.log("[DataCrazy] Mapped:", JSON.stringify(mappedData));

    if (!mappedData.name && !mappedData.email && !mappedData.phone) {
      return NextResponse.json({ success: true, message: "No lead data found, skipped" });
    }

    // 1. Create lead via API
    const lead = await createLead(mappedData);
    console.log("[DataCrazy] Lead created:", lead.id);

    // 2. Create business in SDR > Smart Lead
    const business = await createBusiness(lead.id);
    console.log("[DataCrazy] Business created:", business.id);

    // 3. Slack notification
    try {
      await sendSlackNotification(mappedData);
    } catch (e) {
      console.error("[Slack] Error:", e);
    }

    return NextResponse.json({ success: true, leadId: lead.id, businessId: business.id });
  } catch (error) {
    console.error("[DataCrazy] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
