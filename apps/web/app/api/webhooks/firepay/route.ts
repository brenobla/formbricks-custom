import { NextRequest, NextResponse } from "next/server";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) return phone;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  return `+55${digits}`;
}

async function sendSlackNotification(sale: {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  productName: string;
  price: number;
  paymentMethod: string;
  checkoutId: string | number;
}) {
  if (!SLACK_WEBHOOK_URL) return;

  const formattedPrice = sale.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "💰 Venda Realizada — FirePay", emoji: true },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [
              `*Cliente:* ${sale.clientName}`,
              `*Email:* ${sale.clientEmail}`,
              `*Telefone:* ${sale.clientPhone || "—"}`,
              `*Produto:* ${sale.productName}`,
              `*Valor:* ${formattedPrice}`,
              `*Pagamento:* ${sale.paymentMethod || "—"}`,
              `*Checkout ID:* ${sale.checkoutId}`,
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
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[FirePay Webhook] Received:", JSON.stringify(body, null, 2));

    const txStatus = body.status;
    if (txStatus !== "paid") {
      console.log(`[FirePay Webhook] Ignoring status: ${txStatus}`);
      return NextResponse.json({ success: true, message: `Ignored status: ${txStatus}` });
    }

    const clientEmail = body.client?.email;
    if (!clientEmail) {
      console.log("[FirePay Webhook] No client email, skipping");
      return NextResponse.json({ success: false, message: "No client email" }, { status: 400 });
    }

    const sale = {
      clientName: body.client?.name || "Cliente FirePay",
      clientEmail,
      clientPhone: body.client?.phone ? normalizePhone(body.client.phone) : "",
      productName: body.product?.name || "Produto FirePay",
      price: body.price ? body.price / 100 : 0,
      paymentMethod: body.payment_method || "",
      checkoutId: body.checkout_id || body.id || "—",
    };

    await sendSlackNotification(sale);
    console.log("[FirePay Webhook] Slack notification sent");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FirePay Webhook] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
