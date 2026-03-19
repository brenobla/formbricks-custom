import { NextRequest, NextResponse } from "next/server";

const DATACRAZY_API_URL = "https://api.g1.datacrazy.io/api/v1";
const DATACRAZY_TOKEN =
  "dc_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmIyNzE2ODJlYTgwNWMyNDIzZjIwNCIsInRlbmFudElkIjoiODVlMjA3M2EtMzg4Ny00Y2QyLWFkODMtZjkwNTg0YTJhMzE0IiwibmFtZSI6IkZvcm1icmlja3MiLCJyb2xlcyI6WyJhZG1pbiJdLCJpc0FkbWluIjp0cnVlLCJpYXQiOjE3NzM4NzI5MTgsImV4cCI6MTg0MTcxMzE5OX0.w-rnb8VgXq8Zqp0eQ8P0ZUVQKdjxSfJPtJOOjZqnd6k";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

// Pipeline Vendas
const PIPELINE_ID = "a0dac4ab-4317-4aa8-b3af-c065770d073a";
const STAGE_EFETIVADO_ID = "b28288a3-f256-4749-b39d-2a888c04e48d";

// --- DataCrazy API helpers ---

async function searchLeadByEmail(email: string): Promise<any | null> {
  const res = await fetch(`${DATACRAZY_API_URL}/leads?search=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${DATACRAZY_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  // Find exact email match
  const lead = data.data?.find((l: any) => l.email?.toLowerCase() === email.toLowerCase());
  return lead || null;
}

async function createLead(payload: Record<string, any>): Promise<any> {
  const res = await fetch(`${DATACRAZY_API_URL}/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DATACRAZY_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`DataCrazy create lead failed: ${res.status} - ${error}`);
  }
  return res.json();
}

async function getBusinessesByLead(leadId: string): Promise<any[]> {
  const res = await fetch(`${DATACRAZY_API_URL}/businesses?leadId=${leadId}&pipelineId=${PIPELINE_ID}`, {
    headers: { Authorization: `Bearer ${DATACRAZY_TOKEN}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

async function moveBusinessToStage(businessId: string, stageId: string, total?: number): Promise<any> {
  const body: Record<string, any> = { stageId };
  if (total !== undefined) body.total = total;

  const res = await fetch(`${DATACRAZY_API_URL}/businesses/${businessId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DATACRAZY_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`DataCrazy move business failed: ${res.status} - ${error}`);
  }
  return res.json();
}

async function createBusiness(leadId: string, stageId: string, total?: number): Promise<any> {
  const body: Record<string, any> = { leadId, stageId };
  if (total !== undefined) body.total = total;

  const res = await fetch(`${DATACRAZY_API_URL}/businesses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DATACRAZY_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`DataCrazy create business failed: ${res.status} - ${error}`);
  }
  return res.json();
}

// --- Slack notification ---

async function sendSlackSaleNotification(sale: {
  clientName: string;
  clientEmail: string;
  productName: string;
  price: number | string;
  paymentMethod: string;
  action: string;
}) {
  if (!SLACK_WEBHOOK_URL) return;

  const formattedPrice =
    typeof sale.price === "number"
      ? sale.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : sale.price;

  const payload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "💰 Venda Realizada — FirePay",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*Cliente:* ${sale.clientName}`,
            `*Email:* ${sale.clientEmail}`,
            `*Produto:* ${sale.productName}`,
            `*Valor:* ${formattedPrice}`,
            `*Pagamento:* ${sale.paymentMethod}`,
            `*Ação:* ${sale.action}`,
          ].join("\n"),
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Recebido via FirePay em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`[Slack] Failed: ${res.status} - ${await res.text()}`);
    else console.log("[Slack] Sale notification sent");
  } catch (e) {
    console.error("[Slack] Error:", e);
  }
}

// --- Main webhook handler ---

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log("[FirePay Webhook] Received:", JSON.stringify(body, null, 2));

    // FirePay webhook payload structure:
    // { id, checkout_id, type, status, payment_method, price, product: {name}, client: {name, email, phone, document}, ... }
    const txStatus = body.status;

    // Only process "compra-realizada" (paid) events
    if (txStatus !== "compra-realizada") {
      console.log(`[FirePay Webhook] Ignoring status: ${txStatus}`);
      return NextResponse.json({ success: true, message: `Ignored status: ${txStatus}` });
    }

    const clientEmail = body.client?.email;
    const clientName = body.client?.name || "Cliente FirePay";
    const clientPhone = body.client?.phone || "";
    const clientDocument = body.client?.document || "";
    const productName = body.product?.name || "Produto FirePay";
    const price = body.price || 0;
    const paymentMethod = body.payment_method || "";

    if (!clientEmail) {
      console.log("[FirePay Webhook] No client email, skipping");
      return NextResponse.json({ success: false, message: "No client email" }, { status: 400 });
    }

    console.log(`[FirePay Webhook] Processing sale for ${clientName} (${clientEmail})`);

    // 1. Search lead by email
    let lead = await searchLeadByEmail(clientEmail);
    let action = "";

    if (lead) {
      console.log(`[FirePay Webhook] Found existing lead: ${lead.id}`);

      // 2. Search for existing business in Pipeline Vendas
      const businesses = await getBusinessesByLead(lead.id);

      if (businesses.length > 0) {
        // Move the first (most recent) business to "Efetivado"
        const business = businesses[0];
        console.log(`[FirePay Webhook] Moving business ${business.id} to Efetivado`);
        await moveBusinessToStage(business.id, STAGE_EFETIVADO_ID, price);
        action = `Negócio #${business.code} movido para Efetivado`;

        // Send Slack notification
        await sendSlackSaleNotification({
          clientName,
          clientEmail,
          productName,
          price,
          paymentMethod,
          action,
        });

        return NextResponse.json({
          success: true,
          action: "moved_business",
          leadId: lead.id,
          businessId: business.id,
        });
      } else {
        // Lead exists but no business in this pipeline — create one at Efetivado
        console.log(`[FirePay Webhook] No business found, creating at Efetivado`);
        const business = await createBusiness(lead.id, STAGE_EFETIVADO_ID, price);
        action = `Novo negócio criado em Efetivado`;

        await sendSlackSaleNotification({
          clientName,
          clientEmail,
          productName,
          price,
          paymentMethod,
          action,
        });

        return NextResponse.json({
          success: true,
          action: "created_business_existing_lead",
          leadId: lead.id,
          businessId: business.id,
        });
      }
    } else {
      // 3. Lead not found — create lead + business at Efetivado
      console.log(`[FirePay Webhook] Lead not found, creating new lead + business`);

      lead = await createLead({
        name: clientName,
        email: clientEmail,
        phone: clientPhone,
        source: `Venda FirePay - ${productName}`,
        notes: clientDocument ? `CPF/CNPJ: ${clientDocument}` : "",
      });

      const business = await createBusiness(lead.id, STAGE_EFETIVADO_ID, price);
      action = `Novo lead + negócio criado em Efetivado`;

      await sendSlackSaleNotification({
        clientName,
        clientEmail,
        productName,
        price,
        paymentMethod,
        action,
      });

      return NextResponse.json({
        success: true,
        action: "created_lead_and_business",
        leadId: lead.id,
        businessId: business.id,
      });
    }
  } catch (error) {
    console.error("[FirePay Webhook] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
