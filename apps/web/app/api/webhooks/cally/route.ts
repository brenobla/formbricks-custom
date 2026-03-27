import { NextRequest, NextResponse } from "next/server";

const DATACRAZY_API_URL = "https://api.g1.datacrazy.io/api/v1";
const DATACRAZY_TOKEN =
  "dc_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmIyNzE2ODJlYTgwNWMyNDIzZjIwNCIsInRlbmFudElkIjoiODVlMjA3M2EtMzg4Ny00Y2QyLWFkODMtZjkwNTg0YTJhMzE0IiwibmFtZSI6IkZvcm1icmlja3MiLCJyb2xlcyI6WyJhZG1pbiJdLCJpc0FkbWluIjp0cnVlLCJpYXQiOjE3NzM4NzI5MTgsImV4cCI6MTg0MTcxMzE5OX0.w-rnb8VgXq8Zqp0eQ8P0ZUVQKdjxSfJPtJOOjZqnd6k";

// Pipeline SDR > Stage "Smart Lead"
const SDR_SMARTLEAD_STAGE_ID = "76cbf3a7-07a2-4af7-9816-95c923630be2";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";

function extractValue(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object" && val.value) return String(val.value);
  if (typeof val === "object" && val.label) return String(val.label);
  return String(val);
}

function formatDateBR(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return dateStr;
  }
}

interface MappedData {
  name: string;
  email: string;
  phone: string;
  checkout: string;
  faturamento: string;
  company: string;
  // Booking data
  bookingTitle: string;
  bookingDate: string;
  bookingStartTime: string;
  bookingEndTime: string;
  bookingLocation: string;
  meetingUrl: string;
  eventType: string;
  organizer: string;
}

function mapCallyData(body: any): Partial<MappedData> {
  const mapped: Partial<MappedData> = {};

  const payload = body?.payload || body;
  const attendee = payload?.attendees?.[0] || {};
  const responses = payload?.responses || {};

  // Attendee info
  if (attendee.name) mapped.name = attendee.name;
  if (attendee.email) mapped.email = attendee.email;

  // Override with responses if available
  const nameResp = extractValue(responses.name);
  const emailResp = extractValue(responses.email);
  if (nameResp) mapped.name = nameResp;
  if (emailResp) mapped.email = emailResp;

  // Phone/WhatsApp
  const phone = extractValue(responses.phone);
  if (phone) mapped.phone = phone;

  // Custom fields
  const checkout = extractValue(responses.checkout);
  if (checkout) mapped.checkout = checkout;

  const faturamento = extractValue(responses.faturamento);
  if (faturamento) mapped.faturamento = faturamento;

  const company = extractValue(responses.company);
  if (company) mapped.company = company;

  // Booking / scheduling data
  if (payload.title) mapped.bookingTitle = payload.title;
  if (payload.startTime) mapped.bookingStartTime = payload.startTime;
  if (payload.endTime) mapped.bookingEndTime = payload.endTime;
  if (payload.startTime) mapped.bookingDate = formatDateBR(payload.startTime);

  // Meeting URL — Cal.com puts it in metadata.videoCallUrl or in the location field
  const videoCallUrl = payload.metadata?.videoCallUrl || payload.videoCallUrl || payload.meetingUrl || "";
  if (videoCallUrl) mapped.meetingUrl = videoCallUrl;

  // Location type
  if (payload.location) mapped.bookingLocation = payload.location;

  // Event type title
  if (payload.type) mapped.eventType = payload.type;

  // Organizer
  const organizer = payload.organizer?.name || "";
  if (organizer) mapped.organizer = organizer;

  console.log("[Cally] All responses:", JSON.stringify(responses));
  console.log(
    "[Cally] Booking data:",
    JSON.stringify({
      title: payload.title,
      startTime: payload.startTime,
      endTime: payload.endTime,
      location: payload.location,
      videoCallUrl,
      type: payload.type,
      organizer: payload.organizer?.name,
    })
  );

  return mapped;
}

async function createLead(data: Partial<MappedData>) {
  const payload: Record<string, any> = {
    name: data.name || "Lead Cally",
    source: "Cally - Agendamento",
  };

  if (data.email) payload.email = data.email;
  if (data.phone) payload.phone = data.phone;
  if (data.company) payload.company = data.company;

  // Build notes with all info including booking data
  const notes: string[] = [];
  if (data.checkout) notes.push(`Checkout: ${data.checkout}`);
  if (data.faturamento) notes.push(`Faturamento: ${data.faturamento}`);
  if (data.bookingTitle) notes.push(`Reunião: ${data.bookingTitle}`);
  if (data.bookingDate) notes.push(`Data: ${data.bookingDate}`);
  if (data.meetingUrl) notes.push(`Link: ${data.meetingUrl}`);
  if (data.organizer) notes.push(`Organizador: ${data.organizer}`);
  if (notes.length > 0) payload.notes = notes.join("\n");

  const res = await fetch(`${DATACRAZY_API_URL}/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DATACRAZY_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create lead failed: ${res.status} - ${err}`);
  }
  return res.json();
}

async function createBusiness(leadId: string, data: Partial<MappedData>) {
  const businessPayload: Record<string, any> = {
    leadId,
    stageId: SDR_SMARTLEAD_STAGE_ID,
  };

  // Add booking info as business title and notes
  if (data.bookingTitle) {
    businessPayload.title = `${data.name || "Lead"} — ${data.bookingTitle}`;
  }

  const notes: string[] = [];
  if (data.bookingDate) notes.push(`📅 Data: ${data.bookingDate}`);
  if (data.meetingUrl) notes.push(`🔗 Link: ${data.meetingUrl}`);
  if (data.bookingLocation) notes.push(`📍 Local: ${data.bookingLocation}`);
  if (data.organizer) notes.push(`👤 Organizador: ${data.organizer}`);
  if (data.checkout) notes.push(`💳 Checkout: ${data.checkout}`);
  if (data.faturamento) notes.push(`💰 Faturamento: ${data.faturamento}`);
  if (notes.length > 0) businessPayload.notes = notes.join("\n");

  const res = await fetch(`${DATACRAZY_API_URL}/businesses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DATACRAZY_TOKEN}`,
    },
    body: JSON.stringify(businessPayload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create business failed: ${res.status} - ${err}`);
  }
  return res.json();
}

async function sendSlackNotification(data: Partial<MappedData>, body: any) {
  if (!SLACK_WEBHOOK_URL) return;

  const fields: string[] = [];
  if (data.name) fields.push(`*Nome:* ${data.name}`);
  if (data.email) fields.push(`*Email:* ${data.email}`);
  if (data.phone) fields.push(`*WhatsApp:* ${data.phone}`);
  if (data.company) fields.push(`*Empresa:* ${data.company}`);
  if (data.checkout) fields.push(`*Checkout:* ${data.checkout}`);
  if (data.faturamento) fields.push(`*Faturamento:* ${data.faturamento}`);
  if (data.bookingTitle) fields.push(`*Reunião:* ${data.bookingTitle}`);
  if (data.bookingDate) fields.push(`*Data:* ${data.bookingDate}`);
  if (data.meetingUrl) fields.push(`*Link:* ${data.meetingUrl}`);
  if (data.organizer) fields.push(`*Organizador:* ${data.organizer}`);

  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: [
        { type: "header", text: { type: "plain_text", text: "📅 Nova Reserva — Cally", emoji: true } },
        { type: "section", text: { type: "mrkdwn", text: fields.join("\n") } },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Recebido via Cally em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
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
    console.log("[Cally Webhook] Received:", JSON.stringify(body).substring(0, 1000));

    const mappedData = mapCallyData(body);
    console.log("[Cally Webhook] Mapped:", JSON.stringify(mappedData));

    if (!mappedData.name && !mappedData.email) {
      return NextResponse.json({ success: true, message: "No attendee data" });
    }

    // 1. Create lead via API
    const lead = await createLead(mappedData);
    console.log("[Cally] Lead created:", lead.id);

    // 2. Create business in SDR > Smart Lead (now with booking data)
    const business = await createBusiness(lead.id, mappedData);
    console.log("[Cally] Business created:", business.id);

    // 3. Slack notification (now with booking data)
    try {
      await sendSlackNotification(mappedData, body);
    } catch (e) {
      console.error("[Cally→Slack] Error:", e);
    }

    return NextResponse.json({ success: true, leadId: lead.id, businessId: business.id });
  } catch (error) {
    console.error("[Cally Webhook] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
