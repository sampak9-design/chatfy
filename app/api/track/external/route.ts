/**
 * External tracking endpoint — called by JS on the user's own landing page.
 * Cross-origin friendly (CORS *).
 *
 * Body (JSON or form): { landing: <slug>, fbp, fbc, fbclid, utm_source, utm_medium,
 *                        utm_campaign, utm_content, utm_term, referrer }
 * Response: { ok: true, redirect: "https://t.me/<bot>?start=t_<sessionId>" }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendCapiEvent } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

interface Payload {
  landing?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
}

export async function POST(req: NextRequest) {
  let body: Payload = {};
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { body = (await req.json()) as Payload; } catch { /* ignore */ }
  } else {
    try {
      const form = await req.formData();
      body = {
        landing: String(form.get("landing") || ""),
        fbp: String(form.get("fbp") || ""),
        fbc: String(form.get("fbc") || ""),
        fbclid: String(form.get("fbclid") || ""),
        utm_source: String(form.get("utm_source") || ""),
        utm_medium: String(form.get("utm_medium") || ""),
        utm_campaign: String(form.get("utm_campaign") || ""),
        utm_content: String(form.get("utm_content") || ""),
        utm_term: String(form.get("utm_term") || ""),
        referrer: String(form.get("referrer") || ""),
      };
    } catch { /* ignore */ }
  }

  const slug = body.landing?.trim();
  if (!slug) return NextResponse.json({ ok: false, error: "missing landing slug" }, { status: 400, headers: corsHeaders });

  const landing = await prisma.landing.findFirst({
    where: { slug, active: true },
    include: { bot: true },
  });
  if (!landing) return NextResponse.json({ ok: false, error: "landing not found" }, { status: 404, headers: corsHeaders });

  const session = await prisma.trackingSession.create({
    data: {
      botId: landing.botId,
      landingId: landing.id,
      fbclid: body.fbclid || null,
      fbp: body.fbp || null,
      fbc: body.fbc || null,
      utmSource: body.utm_source || null,
      utmMedium: body.utm_medium || null,
      utmCampaign: body.utm_campaign || null,
      utmContent: body.utm_content || null,
      utmTerm: body.utm_term || null,
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") || null,
    },
  });

  // Fire-and-forget PageView CAPI
  sendCapiEvent({
    bot: landing.bot,
    session,
    type: "PageView",
    eventSourceUrl: body.referrer || undefined,
  }).catch((e) => console.error("[capi external pageview]", e));

  const redirect = landing.bot.username
    ? `https://t.me/${landing.bot.username}?start=t_${session.id}`
    : "/";

  return NextResponse.json({ ok: true, redirect, sessionId: session.id }, { headers: corsHeaders });
}
