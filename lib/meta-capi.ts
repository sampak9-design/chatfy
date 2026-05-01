/**
 * Meta Conversions API (Facebook Ads server-side tracking).
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 *
 * Why server-side: cookies and JS pixel are blocked by iOS14+/ad-blockers/browser ITP.
 * CAPI sends events directly from our server to Meta with hashed PII so attribution survives.
 */
import { createHash } from "node:crypto";
import { prisma } from "./db";
import type { Bot, TrackingSession, ConversionEventType } from "@prisma/client";

const API = "https://graph.facebook.com/v18.0";

function sha256(s: string): string {
  return createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
}

interface SendOpts {
  bot: Pick<Bot, "id" | "metaPixelId" | "metaAccessToken" | "metaTestCode">;
  session: TrackingSession;
  type: ConversionEventType;
  value?: number;
  currency?: string;
  email?: string;
  phone?: string;
  externalId?: string;
  eventSourceUrl?: string;
}

export async function sendCapiEvent(opts: SendOpts): Promise<{ ok: boolean; response?: unknown }> {
  const { bot, session, type } = opts;
  if (!bot.metaPixelId || !bot.metaAccessToken) {
    // Track-disabled bot: log the event but skip the network call.
    await prisma.conversionEvent.create({
      data: {
        sessionId: session.id,
        botId: bot.id,
        type,
        value: opts.value ?? null,
        currency: opts.currency ?? null,
        ok: false,
        response: { skipped: "meta config missing" },
      },
    });
    return { ok: false };
  }

  const userData: Record<string, unknown> = {
    fbp: session.fbp || undefined,
    fbc: session.fbc || undefined,
    client_ip_address: session.ip || undefined,
    client_user_agent: session.userAgent || undefined,
  };
  if (opts.email) userData.em = [sha256(opts.email)];
  if (opts.phone) userData.ph = [sha256(opts.phone.replace(/\D/g, ""))];
  if (opts.externalId) userData.external_id = [sha256(opts.externalId)];

  const customData: Record<string, unknown> = {};
  if (opts.value !== undefined) customData.value = opts.value;
  if (opts.currency) customData.currency = opts.currency;

  const payload = {
    data: [
      {
        event_name: type,
        event_time: Math.floor(Date.now() / 1000),
        event_id: `${session.id}-${type}`, // dedup with browser pixel if you also fire client-side
        action_source: "website" as const,
        event_source_url: opts.eventSourceUrl || undefined,
        user_data: userData,
        custom_data: Object.keys(customData).length ? customData : undefined,
      },
    ],
    ...(bot.metaTestCode ? { test_event_code: bot.metaTestCode } : {}),
  };

  let ok = false;
  let respJson: unknown = null;
  try {
    const res = await fetch(`${API}/${bot.metaPixelId}/events?access_token=${bot.metaAccessToken}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    respJson = await res.json();
    ok = res.ok && !(respJson as { error?: unknown }).error;
  } catch (e) {
    respJson = { error: String(e) };
  }

  await prisma.conversionEvent.create({
    data: {
      sessionId: session.id,
      botId: bot.id,
      type,
      value: opts.value ?? null,
      currency: opts.currency ?? null,
      ok,
      response: respJson as object,
    },
  });

  return { ok, response: respJson };
}
