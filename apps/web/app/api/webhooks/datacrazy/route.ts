import { NextRequest, NextResponse } from "next/server";

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

  const notes: string[] = [];
  if (data.cargo) notes.push(`Cargo: ${data.cargo}`);
  if (data.faturamento) notes.push(`Faturamento: ${data.faturamento}`);
  if (data.checkout) notes.push(`Checkout: ${data.checkout}`);
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
  const res = await fetch(`${DATACRAZY_API_URL}/businesses?leadId=${leadId}&limit=1`, {
    headers: { Authorization: `Bearer ${DATACRAZY_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const businesses = data?.data || [];
  return businesses[0] || null;
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

    return NextResponse.json({
      success: true,
      leadId,
      businessId,
      action: isUpdate ? "updated" : "created",
      event,
    });
  } catch (error) {
    console.error("[DataCrazy] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
