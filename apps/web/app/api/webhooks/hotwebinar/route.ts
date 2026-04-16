import { NextRequest, NextResponse } from "next/server";

const SLACK_HOTWEBINAR_WEBHOOK_URL = process.env.SLACK_HOTWEBINAR_WEBHOOK_URL || "";

const STATUS_MAP: Record<string, { emoji: string; label: string }> = {
  paid: { emoji: "💰", label: "Venda Confirmada" },
  waiting_payment: { emoji: "⏳", label: "Aguardando Pagamento" },
  refused: { emoji: "❌", label: "Pagamento Recusado" },
  failed: { emoji: "❌", label: "Falha no Pagamento" },
  abandoned: { emoji: "🚪", label: "Abandono de Checkout" },
  cancelled: { emoji: "🚫", label: "Cancelamento" },
  refunded: { emoji: "↩️", label: "Reembolso" },
  chargeback: { emoji: "⚠️", label: "Chargeback" },
  expired: { emoji: "⏰", label: "Expirado" },
  waiting: { emoji: "⏳", label: "Waiting" },
  trial: { emoji: "🎁", label: "Trial" },
};

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) return phone;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  return `+55${digits}`;
}

async function sendSlackNotification(body: any) {
  if (!SLACK_HOTWEBINAR_WEBHOOK_URL) {
    console.warn("[Hotwebinar] SLACK_HOTWEBINAR_WEBHOOK_URL not set, skipping notification");
    return;
  }

  const status = body.status || "unknown";
  const statusInfo = STATUS_MAP[status] ?? { emoji: "🔔", label: status };

  const clientName = body.client?.name || "—";
  const clientEmail = body.client?.email || "—";
  const clientPhone = body.client?.phone ? normalizePhone(body.client.phone) : "—";
  const productName = body.product?.name || "—";
  const price = body.price ? body.price / 100 : null;
  const paymentMethod = body.payment_method || "—";
  const checkoutId = body.checkout_id || body.id || "—";

  const formattedPrice =
    price !== null ? price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

  const fields = [
    `*Cliente:* ${clientName}`,
    `*Email:* ${clientEmail}`,
    `*Telefone:* ${clientPhone}`,
    `*Produto:* ${productName}`,
    `*Valor:* ${formattedPrice}`,
    `*Pagamento:* ${paymentMethod}`,
    `*Checkout ID:* ${checkoutId}`,
  ];

  const payload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${statusInfo.emoji} ${statusInfo.label} — Hotwebinar`,
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
            text: `Recebido via FirePay em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
          },
        ],
      },
    ],
  };

  const res = await fetch(SLACK_HOTWEBINAR_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`[Hotwebinar Slack] Failed: ${res.status} - ${await res.text()}`);
  } else {
    console.log(`[Hotwebinar Slack] Notification sent: ${statusInfo.label}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[Hotwebinar Webhook] Received:", JSON.stringify(body, null, 2));

    const ignoredStatuses = ["processing", "waiting"];
    if (ignoredStatuses.includes(body.status)) {
      console.log(`[Hotwebinar Webhook] Ignoring status: ${body.status}`);
      return NextResponse.json({ success: true, message: `Ignored status: ${body.status}` });
    }

    await sendSlackNotification(body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Hotwebinar Webhook] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
