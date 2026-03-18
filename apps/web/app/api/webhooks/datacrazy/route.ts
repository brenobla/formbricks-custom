import { NextRequest, NextResponse } from "next/server";

const DATACRAZY_API_URL = "https://api.g1.datacrazy.io/api/v1";
const DATACRAZY_TOKEN =
  "dc_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmIyNzE2ODJlYTgwNWMyNDIzZjIwNCIsInRlbmFudElkIjoiODVlMjA3M2EtMzg4Ny00Y2QyLWFkODMtZjkwNTg0YTJhMzE0IiwibmFtZSI6IkZvcm1icmlja3MiLCJyb2xlcyI6WyJhZG1pbiJdLCJpc0FkbWluIjp0cnVlLCJpYXQiOjE3NzM4NzI5MTgsImV4cCI6MTg0MTcxMzE5OX0.w-rnb8VgXq8Zqp0eQ8P0ZUVQKdjxSfJPtJOOjZqnd6k";

// Pipeline Vendas > Stage "Novo"
const VENDAS_STAGE_ID = "ee8bb812-f039-4f77-b2d1-e078a878d71e";

// Map Formbricks question IDs to DataCrazy lead fields
// These IDs come from the survey blocks
const FIELD_MAP: Record<string, string> = {
  // Try multiple possible question ID formats
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

  // Add cargo, faturamento, checkout as notes
  const notes: string[] = [];
  if (data.cargo) notes.push(`Cargo: ${data.cargo}`);
  if (data.faturamento) notes.push(`Faturamento: ${data.faturamento}`);
  if (data.checkout) notes.push(`Checkout atual: ${data.checkout}`);
  if (notes.length > 0) {
    leadPayload.notes = { content: notes.join("\n") };
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
      stageId: VENDAS_STAGE_ID,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DataCrazy create business failed: ${response.status} - ${error}`);
  }

  return response.json();
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

    // 1. Create lead in DataCrazy
    const lead = await createDataCrazyLead(mappedData);
    console.log("[DataCrazy Webhook] Lead created:", JSON.stringify(lead, null, 2));

    // 2. Create business (deal) in Vendas pipeline
    const business = await createDataCrazyBusiness(lead.id);
    console.log("[DataCrazy Webhook] Business created:", JSON.stringify(business, null, 2));

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
