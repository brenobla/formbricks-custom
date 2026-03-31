"use server";

import { getWebhookLogs } from "@/lib/webhookLog/service";

export async function getWebhookLogsAction(
  environmentId: string,
  filters: {
    direction?: "outgoing" | "incoming";
    source?: string;
    success?: boolean;
    page?: number;
  }
) {
  return getWebhookLogs(environmentId, filters);
}
