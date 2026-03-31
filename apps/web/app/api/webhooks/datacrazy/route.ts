import { NextRequest, NextResponse } from "next/server";
import { createWebhookLog } from "@/lib/webhookLog/service";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

const DATACRAZY_API_URL = "https://api.g1.datacrazy.io/api/v1";
const DATACRAZY_TOKEN =
  "dc_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmIyNzE2ODJlYTgwNWMyNDIzZjIwNCIsInRlbmFudElkIjoiODVlMjA3M2EtMzg4Ny00Y2QyLWFkODMtZjkwNTg0YTJhMzE0IiwibmFtZSI6IkZvcm1icmlja3MiLCJyb2xlcyI6WyJhZG1pbiJdLCJpc0FkbWluIjp0cnVlLCJpYXQiOjE3NzM4NzI5MTgsImV4cCI6MTg0MTcxMzE5OX0.w-rnb8VgXq8Zqp0eQ8P0ZUVQKdjxSfJPtJOOjZqnd6k";

const SDR_SMARTLEAD_STAGE_ID = "76cbf3a7-07a2-4af7-9816-95c923630be2";

const DATACRAZY_WEBHOOK_URL =
  "https://api.datacrazy.io/v1/crm/api/crm/integrations/webhook/business/69b031f7-f44c-4cca-a33f-10e4f92b987e";

const FIELD_MAP: Record<string, string> = {
  blx7ixux827c5xrcrb9fl2m9: "name",
  vgt3oqqdaogjmeppsuyq2zn4: "email",
  x69hbypuftyq99wb3x0drig8: "phone",
  qziv755kb71axfzxsoo4n5rf: "company",
  gm8e6hcyhdetukw1f4whlcuc: "instagram",
  ga04117jjo69bals1got7fng: "cargo",
  w0v1d756qnzrdzj3b60qd84e: "faturamento",
  rzg15b2mt47ea5h0imy4obpj: "checkout",
};

const dcHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${DATACRAZY_TOKEN}`,
};

// ============================================================
// Retry helper — retries up to 3 times with 1s delay
// ============================================================
async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      console.error(`[${label}] Attempt ${i + 1}/${retries} failed:`, err);
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`${label} failed after ${retries} retries`);
}

// ============================================================
// Data mapping
// ============================================================
function mapFormbricksData(body: any): Record<string, string> {
  const responseData = body?.data?.data || body?.data?.response?.data || body?.data || {};
  const mappedData: Record<string, string> = {};

  for (const [questionId, value] of Object.entries(responseData)) {
    const fieldName = FIELD_MAP[questionId];
    if (fieldName && typeof value === "string") {
      mappedData[fieldName] = value;
    }
  }

  // Extract UTM params from response meta
  const meta = body?.data?.meta || body?.data?.response?.meta || {};
  const metaUrl = meta?.url || "";
  if (metaUrl) {
    try {
      const url = new URL(metaUrl);
      for (const param of ["utm_source", "utm_campaign", "utm_medium", "utm_content", "utm_term"]) {
        const val = url.searchParams.get(param);
        if (val) mappedData[param] = val;
      }
    } catch {
      // ignore
    }
  }

  return mappedData;
}

function buildLeadPayload(data: Record<string, string>): Record<string, any> {
  const payload: Record<string, any> = {
    name: data.name || "Lead Formbricks",
    source: data.utm_source || "Formulário Enterprise - Formbricks",
  };

  if (data.email) payload.email = data.email;
  if (data.phone) payload.phone = data.phone;
  if (data.company) payload.company = data.company;
  if (data.instagram) payload.instagram = data.instagram;

  const notes: string[] = [];
  if (data.cargo) notes.push(`Cargo: ${data.cargo}`);
  if (data.faturamento) notes.push(`Faturamento: ${data.faturamento}`);
  if (data.checkout) notes.push(`Checkout: ${data.checkout}`);
  if (data.utm_source) notes.push(`UTM Source: ${data.utm_source}`);
  if (data.utm_campaign) notes.push(`UTM Campaign: ${data.utm_campaign}`);
  if (data.utm_medium) notes.push(`UTM Medium: ${data.utm_medium}`);
  if (data.utm_content) notes.push(`UTM Content: ${data.utm_content}`);
  if (data.utm_term) notes.push(`UTM Term: ${data.utm_term}`);
  if (notes.length > 0) payload.notes = notes.join("\n");

  return payload;
}

// ============================================================
// DataCrazy API calls — all with retry
// ============================================================
async function findLeadByEmail(email: string): Promise<any | null> {
  try {
    const res = await fetch(`${DATACRAZY_API_URL}/leads?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${DATACRAZY_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const leads = data?.data || [];
    return leads.find((l: any) => l.email?.toLowerCase() === email.toLowerCase()) || null;
  } catch (err) {
    console.error("[DataCrazy] findLeadByEmail error:", err);
    return null;
  }
}

async function createLead(data: Record<string, string>): Promise<any> {
  return withRetry(async () => {
    const res = await fetch(`${DATACRAZY_API_URL}/leads`, {
      method: "POST",
      headers: dcHeaders,
      body: JSON.stringify(buildLeadPayload(data)),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status} - ${err}`);
    }
    return res.json();
  }, "createLead");
}

async function updateLead(leadId: string, data: Record<string, string>): Promise<any> {
  const payload = buildLeadPayload(data);
  delete payload.source;
  try {
    const res = await fetch(`${DATACRAZY_API_URL}/leads/${leadId}`, {
      method: "PATCH",
      headers: dcHeaders,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[DataCrazy] Update lead failed: ${res.status}`);
    }
    return res.ok ? res.json() : null;
  } catch (err) {
    console.error("[DataCrazy] updateLead error:", err);
    return null;
  }
}

async function createBusiness(leadId: string): Promise<any> {
  return withRetry(async () => {
    const res = await fetch(`${DATACRAZY_API_URL}/businesses`, {
      method: "POST",
      headers: dcHeaders,
      body: JSON.stringify({ leadId, stageId: SDR_SMARTLEAD_STAGE_ID }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status} - ${err}`);
    }
    return res.json();
  }, "createBusiness");
}

// ============================================================
// Slack notification
// ============================================================
async function sendSlackNotification(data: Record<string, string>, isUpdate: boolean) {
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
  if (data.utm_source) fields.push(`*UTM Source:* ${data.utm_source}`);
  if (data.utm_campaign) fields.push(`*UTM Campaign:* ${data.utm_campaign}`);
  if (data.utm_medium) fields.push(`*UTM Medium:* ${data.utm_medium}`);

  const title = isUpdate ? "🔄 Lead Atualizado — FirePay" : "🔥 Novo Lead — FirePay Enterprise";

  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: [
        { type: "header", text: { type: "plain_text", text: title, emoji: true } },
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

// ============================================================
// Main handler
// ============================================================
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let mappedData: Record<string, string> = {};
  let event = "unknown";

  try {
    const body = await request.json();
    event = body?.event || "unknown";
    console.log("[DataCrazy] Event:", event);

    mappedData = mapFormbricksData(body);
    console.log("[DataCrazy] Mapped:", JSON.stringify(mappedData));

    // Need at least email to proceed
    if (!mappedData.email) {
      return NextResponse.json({ success: true, message: "No email yet, skipped" });
    }

    const isFinished = event === "responseFinished";

    // ============================
    // STEP 1: Create or update lead (with retry)
    // ============================
    let leadId: string;
    let isUpdate = false;

    const existingLead = await findLeadByEmail(mappedData.email);
    if (existingLead) {
      leadId = existingLead.id;
      isUpdate = true;
      await updateLead(leadId, mappedData);
      console.log(`[DataCrazy] Lead updated: ${leadId}`);
    } else {
      const lead = await createLead(mappedData);
      leadId = lead.id;
      console.log(`[DataCrazy] Lead created: ${leadId}`);
    }

    // ============================
    // STEP 2: ALWAYS create business (with retry)
    // Never skip — if createBusiness fails, retry handles it
    // ============================
    let businessId: string | null = null;
    try {
      const business = await createBusiness(leadId);
      businessId = business.id;
      console.log("[DataCrazy] Business created:", businessId);
    } catch (bizErr) {
      // Business creation failed even after retries
      // This can happen if business already exists (API may reject duplicates)
      console.error("[DataCrazy] Business creation failed after retries:", bizErr);
      // Don't fail the whole request — lead was already created
    }

    // ============================
    // STEP 3: Native webhook for custom fields (non-blocking)
    // ============================
    if (isFinished) {
      fetch(DATACRAZY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mappedData),
      }).catch((e) => console.error("[DataCrazy] Native webhook error:", e));
    }

    // ============================
    // STEP 4: Slack notification (non-blocking)
    // ============================
    if (isFinished || !isUpdate) {
      sendSlackNotification(mappedData, isUpdate).catch((e) => console.error("[Slack] Error:", e));
    }

    const result = {
      success: true,
      leadId,
      businessId,
      action: isUpdate ? "updated" : "created",
      event,
    };

    createWebhookLog({
      environmentId: "cmmwb6rme000anz01mwo85wps",
      direction: "incoming",
      source: "datacrazy",
      url: "/api/webhooks/datacrazy",
      event,
      requestBody: mappedData,
      responseStatus: 200,
      responseBody: result,
      durationMs: Date.now() - startTime,
      success: true,
    }).catch(() => {});

    return NextResponse.json(result);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[DataCrazy] FATAL:", errMsg);

    createWebhookLog({
      environmentId: "cmmwb6rme000anz01mwo85wps",
      direction: "incoming",
      source: "datacrazy",
      url: "/api/webhooks/datacrazy",
      event,
      requestBody: mappedData,
      responseStatus: 500,
      durationMs: Date.now() - startTime,
      success: false,
      errorMessage: errMsg,
    }).catch(() => {});

    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }
}
