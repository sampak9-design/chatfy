/**
 * Postback for broker deposit / purchase event.
 * POST /api/track/deposit?secret=<botPostbackSecret>
 *   body: { ref: "<sessionId>", value: 100, currency?: "BRL", broker_user_id?: string, email?: string }
 *
 * Fires `Purchase` to Meta CAPI.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendCapiEvent } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  ref?: string;
  value?: number | string;
  currency?: string;
  email?: string;
  broker_user_id?: string;
}

async function handle(req: NextRequest, body: Body) {
  const secret = req.nextUrl.searchParams.get("secret");
  const ref = body.ref || req.nextUrl.searchParams.get("ref") || "";
  if (!secret || !ref) return NextResponse.json({ ok: false, error: "missing secret/ref" }, { status: 400 });

  const session = await prisma.trackingSession.findUnique({
    where: { id: ref },
    include: { bot: true },
  });
  if (!session) return NextResponse.json({ ok: false, error: "session not found" }, { status: 404 });
  if (session.bot.postbackSecret !== secret) return NextResponse.json({ ok: false, error: "invalid secret" }, { status: 401 });

  const valueRaw = body.value ?? req.nextUrl.searchParams.get("value") ?? "0";
  const value = typeof valueRaw === "number" ? valueRaw : parseFloat(String(valueRaw)) || 0;
  const currency = body.currency || req.nextUrl.searchParams.get("currency") || "BRL";
  const email = body.email || req.nextUrl.searchParams.get("email") || undefined;
  const brokerUserId = body.broker_user_id || req.nextUrl.searchParams.get("broker_user_id") || undefined;

  const updated = await prisma.trackingSession.update({
    where: { id: ref },
    data: {
      depositedAt: new Date(),
      depositValue: (session.depositValue ?? 0) + value,
      brokerEmail: email ?? session.brokerEmail,
      brokerUserId: brokerUserId ?? session.brokerUserId,
    },
  });

  const result = await sendCapiEvent({
    bot: session.bot,
    session: updated,
    type: "Purchase",
    value,
    currency,
    email,
    externalId: brokerUserId || (session.leadId ?? undefined),
  });

  return NextResponse.json({ ok: true, capiOk: result.ok });
}

export async function POST(req: NextRequest) {
  let body: Body = {};
  try { body = await req.json(); } catch { /* try form */ }
  if (!body.ref) {
    try {
      const form = await req.formData();
      body = {
        ref: String(form.get("ref") || ""),
        value: form.get("value") as string | undefined,
        currency: String(form.get("currency") || "") || undefined,
        email: String(form.get("email") || "") || undefined,
        broker_user_id: String(form.get("broker_user_id") || "") || undefined,
      };
    } catch { /* ignore */ }
  }
  return handle(req, body);
}

export async function GET(req: NextRequest) {
  return handle(req, {});
}
