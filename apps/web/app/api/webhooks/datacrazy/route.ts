import { NextRequest, NextResponse } from "next/server";
import { createWebhookLog } from "@/lib/webhookLog/service";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

const DATACRAZY_API_URL = "https://api.g1.datacrazy.io/api/v1";
const DATACRAZY_TOKEN =
  "dc_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmIyNzE2ODJlYTgwNWMyNDIzZjIwNCIsInRlbmFudElkIjoiODVlMjA3M2EtMzg4Ny00Y2QyLWFkODMtZjkwNTg0YTJhMzE0IiwibmFtZSI6IkZvcm1icmlja3MiLCJyb2xlcyI6WyJhZG1pbiJdLCJpc0FkbWluIjp0cnVlLCJpYXQiOjE3NzM4NzI5MTgsImV4cCI6MTg0MTcxMzE5OX0.w-rnb8VgXq8Zqp0eQ8P0ZUVQKdjxSfJPtJOOjZqnd6k";

// Pipeline SDR > Stage "Smart Lead"
const SDR_SMARTLEAD_STAGE_ID = "76cbf3a7-07a2-4af7-9816-95c923630be2";

// DataCrazy native webhook — populates custom/additional fields
const DATACRAZY_WEBHOOK_URL =
  "https://api.datacrazy.io/v1/crm/api/crm/integrations/webhook/business/69b031f7-f44c-4cca-a33f-10e4f92b987e";

// Map Formbricks question IDs to field names
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
      const utmSource = url.searchParams.get("utm_source");
      const utmCampaign = url.searchParams.get("utm_campaign");
      const utmMedium = url.searchParams.get("utm_medium");
      const utmContent = url.searchParams.get("utm_content");
      const utmTerm = url.searchParams.get("utm_term");
      if (utmSource) mappedData.utm_source = utmSource;
      if (utmCampaign) mappedData.utm_campaign = utmCampaign;
      if (utmMedium) mappedData.utm_medium = utmMedium;
      if (utmContent) mappedData.utm_content = utmContent;
      if (utmTerm) mappedData.utm_term = utmTerm;
    } catch {
      // URL parsing failed, skip UTMs
    }
  }

  return mappedData;
}

function buildLeadPayload(data: Record<string, string>): Record<string, any> {
  const payload: Record<string, any> = {
    name: data.name || "Lead Formbricks",
    source: "Formulário Enterprise - Formbricks",
  };

  if (data.email) payload.email = data.email;
  if (data.phone) payload.phone = data.phone;
  if (data.company) payload.company = data.company;
  if (data.instagram) payload.instagram = data.instagram;

  // Use utm_source as lead source if available
  if (data.utm_source) {
    payload.source = data.utm_source;
  }

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

async function findLeadByEmail(email: string): Promise<any | null> {
  const res = await fetch(`${DATACRAZY_API_URL}/leads?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${DATACRAZY_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  // Find exact match in results
  const leads = data?.data || [];
  return leads.find((l: any) => l.email === email) || null;
}

async function updateLead(leadId: string, data: Record<string, string>): Promise<any> {
  const payload = buildLeadPayload(data);
  delete payload.source; // don't overwrite source on update

  const res = await fetch(`${DATACRAZY_API_URL}/leads/${leadId}`, {
    method: "PATCH",
    headers: dcHeaders,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[DataCrazy] Update lead failed: ${res.status} - ${err}`);
    return null;
  }
  return res.json();
}

async function createLead(data: Record<string, string>): Promise<any> {
  const res = await fetch(`${DATACRAZY_API_URL}/leads`, {
    method: "POST",
    headers: dcHeaders,
    body: JSON.stringify(buildLeadPayload(data)),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create lead failed: ${res.status} - ${err}`);
  }
  return res.json();
}

async function findBusinessByLead(leadId: string): Promise<any | null> {
  // DataCrazy API ignores leadId filter, so we search in the SDR pipeline and match locally
  const res = await fetch(`${DATACRAZY_API_URL}/businesses?stageId=${SDR_SMARTLEAD_STAGE_ID}&limit=100`, {
    headers: { Authorization: `Bearer ${DATACRAZY_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const businesses = data?.data || [];
  return businesses.find((b: any) => b.lead?.id === leadId || b.leadId === leadId) || null;
}

async function createBusiness(leadId: string): Promise<any> {
  const res = await fetch(`${DATACRAZY_API_URL}/businesses`, {
    method: "POST",
    headers: dcHeaders,
    body: JSON.stringify({ leadId, stageId: SDR_SMARTLEAD_STAGE_ID }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create business failed: ${res.status} - ${err}`);
  }
  return res.json();
}

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = body?.event || "unknown";
    console.log("[DataCrazy] Received event:", event);

    const mappedData = mapFormbricksData(body);
    console.log("[DataCrazy] Mapped:", JSON.stringify(mappedData));

    // Need at least email to do anything useful
    if (!mappedData.email) {
      console.log("[DataCrazy] No email yet, skipping");
      return NextResponse.json({ success: true, message: "No email yet, skipped" });
    }

    const isFinished = event === "responseFinished";
    let leadId: string;
    let isUpdate = false;

    // 1. Search for existing lead by email
    const existingLead = await findLeadByEmail(mappedData.email);
    if (existingLead) {
      leadId = existingLead.id;
      isUpdate = true;
      await updateLead(leadId, mappedData);
      console.log(`[DataCrazy] Lead updated: ${leadId} (${event})`);
    } else {
      const lead = await createLead(mappedData);
      leadId = lead.id;
      console.log(`[DataCrazy] Lead created: ${leadId} (${event})`);
    }

    // 2. Create business if lead doesn't have one yet (on any event with email)
    let businessId: string | null = null;
    const existingBusiness = await findBusinessByLead(leadId);
    if (!existingBusiness) {
      const business = await createBusiness(leadId);
      businessId = business.id;
      console.log("[DataCrazy] Business created:", businessId);
    } else {
      businessId = existingBusiness.id;
      console.log("[DataCrazy] Business already exists:", businessId);
    }

    // 3. Send to native webhook for custom fields (only on finish, when all data is available)
    if (isFinished) {
      try {
        await fetch(DATACRAZY_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mappedData),
        });
      } catch (e) {
        console.error("[DataCrazy] Native webhook error:", e);
      }
    }

    // 3. Slack notification (only on finish or first creation)
    if (isFinished || !isUpdate) {
      try {
        await sendSlackNotification(mappedData, isUpdate);
      } catch (e) {
        console.error("[Slack] Error:", e);
      }
    }

    const result = { success: true, leadId, businessId, action: isUpdate ? "updated" : "created", event };

    // Log incoming webhook
    createWebhookLog({
      environmentId: "cmmwb6rme000anz01mwo85wps",
      direction: "incoming",
      source: "datacrazy",
      url: "/api/webhooks/datacrazy",
      event,
      requestBody: {
        mapped: mappedData,
        utms: { utm_source: mappedData.utm_source, utm_campaign: mappedData.utm_campaign },
      },
      responseStatus: 200,
      responseBody: result,
      success: true,
    }).catch(() => {});

    return NextResponse.json(result);
  } catch (error) {
    console.error("[DataCrazy] Error:", error);

    createWebhookLog({
      environmentId: "cmmwb6rme000anz01mwo85wps",
      direction: "incoming",
      source: "datacrazy",
      url: "/api/webhooks/datacrazy",
      responseStatus: 500,
      success: false,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    }).catch(() => {});

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
