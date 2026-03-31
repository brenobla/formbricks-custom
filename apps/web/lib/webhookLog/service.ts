"use server";

import { prisma } from "@formbricks/database";

interface WebhookLogInput {
  environmentId: string;
  direction: "outgoing" | "incoming";
  source: string;
  webhookId?: string;
  url: string;
  event?: string;
  surveyId?: string;
  requestBody?: any;
  responseStatus?: number;
  responseBody?: any;
  durationMs?: number;
  success: boolean;
  errorMessage?: string;
}

function truncatePayload(payload: any, maxBytes = 10240): any {
  if (!payload) return null;
  try {
    const str = JSON.stringify(payload);
    if (str.length <= maxBytes) return payload;
    return { _truncated: true, _size: str.length, _preview: str.substring(0, maxBytes) };
  } catch {
    return { _error: "Could not serialize payload" };
  }
}

export async function createWebhookLog(data: WebhookLogInput): Promise<void> {
  try {
    await prisma.webhookLog.create({
      data: {
        environmentId: data.environmentId,
        direction: data.direction,
        source: data.source,
        webhookId: data.webhookId || null,
        url: data.url,
        event: data.event || null,
        surveyId: data.surveyId || null,
        requestBody: truncatePayload(data.requestBody),
        responseStatus: data.responseStatus || null,
        responseBody: truncatePayload(data.responseBody),
        durationMs: data.durationMs || null,
        success: data.success,
        errorMessage: data.errorMessage || null,
      },
    });
  } catch (err) {
    console.error("[WebhookLog] Failed to create log:", err);
  }
}

interface WebhookLogFilters {
  direction?: "outgoing" | "incoming";
  source?: string;
  success?: boolean;
  page?: number;
  pageSize?: number;
}

export async function getWebhookLogs(environmentId: string, filters: WebhookLogFilters = {}) {
  const { direction, source, success, page = 1, pageSize = 50 } = filters;

  const where: any = { environmentId };
  if (direction) where.direction = direction;
  if (source) where.source = source;
  if (success !== undefined) where.success = success;

  const [logs, total] = await Promise.all([
    prisma.webhookLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.webhookLog.count({ where }),
  ]);

  return {
    data: logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
