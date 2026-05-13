import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@formbricks/database";

const SLACK_HOTWEBINAR_WEBHOOK_URL = process.env.SLACK_HOTWEBINAR_WEBHOOK_URL || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

interface MonthMetrics {
  newUsers: number;
  cancellations: number;
}

async function getMetrics(): Promise<{ current: MonthMetrics; previous: MonthMetrics }> {
  // Novos pagantes = emails únicos com status 'paid' ou 'trial' no mês
  const currentNew = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT COUNT(DISTINCT client_email) AS count
    FROM _hotwebinar_events
    WHERE status IN ('paid', 'trial')
      AND received_at >= date_trunc('month', NOW())
      AND client_email IS NOT NULL
  `);

  const previousNew = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT COUNT(DISTINCT client_email) AS count
    FROM _hotwebinar_events
    WHERE status IN ('paid', 'trial')
      AND received_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
      AND received_at <  date_trunc('month', NOW())
      AND client_email IS NOT NULL
  `);

  const currentCancellations = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT COUNT(DISTINCT client_email) AS count
    FROM _hotwebinar_events
    WHERE status = 'cancelled'
      AND received_at >= date_trunc('month', NOW())
      AND client_email IS NOT NULL
  `);

  const previousCancellations = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`
    SELECT COUNT(DISTINCT client_email) AS count
    FROM _hotwebinar_events
    WHERE status = 'cancelled'
      AND received_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
      AND received_at <  date_trunc('month', NOW())
      AND client_email IS NOT NULL
  `);

  return {
    current: {
      newUsers: Number(currentNew[0]?.count ?? 0),
      cancellations: Number(currentCancellations[0]?.count ?? 0),
    },
    previous: {
      newUsers: Number(previousNew[0]?.count ?? 0),
      cancellations: Number(previousCancellations[0]?.count ?? 0),
    },
  };
}

async function sendDailySummary() {
  if (!SLACK_HOTWEBINAR_WEBHOOK_URL) return;

  const { current, previous } = await getMetrics();

  // Churn % = cancelamentos / (usuários mês anterior + novos deste mês)
  const totalBase = previous.newUsers + current.newUsers;
  const churnPct = totalBase > 0 ? ((current.cancellations / totalBase) * 100).toFixed(1) : "0.0";

  // Crescimento % vs mês anterior
  let growthText = "—";
  if (previous.newUsers > 0) {
    const growth = (((current.newUsers - previous.newUsers) / previous.newUsers) * 100).toFixed(1);
    const sign = Number(growth) >= 0 ? "+" : "";
    growthText = `${sign}${growth}%`;
  } else if (current.newUsers > 0) {
    growthText = "+100%";
  }

  const now = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    month: "long",
    year: "numeric",
  });

  const payload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "☀️ Bom dia, time!",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `Aqui está o resumo da Hotwebinar em *${now}*:`,
            "",
            `👥 *Novos usuários este mês:* ${current.newUsers}`,
            `🚪 *Cancelamentos este mês:* ${current.cancellations}`,
            `📉 *Churn atual:* ${churnPct}%`,
            `📈 *Crescimento vs mês anterior:* ${growthText}`,
          ].join("\n"),
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Gerado automaticamente em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
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

  if (!res.ok) throw new Error(`Slack error: ${res.status} ${await res.text()}`);
  console.log("[Hotwebinar Summary] Sent to Slack successfully");
}

export async function GET(request: NextRequest) {
  // Proteção por secret para evitar chamadas não autorizadas
  const secret = request.nextUrl.searchParams.get("secret");
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sendDailySummary();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Hotwebinar Summary] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
