/**
 * Postback endpoint for the broker registration.
 * Broker calls: POST /api/track/registered?secret=<botPostbackSecret>
 *   body: { ref: "<sessionId>", email?: string, broker_user_id?: string }
 * Or:       GET /api/track/registered?secret=...&ref=...&email=...&broker_user_id=...
 *
 * Fires `CompleteRegistration` to Meta CAPI.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendCapiEvent } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  ref?: string;
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

  const email = body.email || req.nextUrl.searchParams.get("email") || undefined;
  const brokerUserId = body.broker_user_id || req.nextUrl.searchParams.get("broker_user_id") || undefined;

  const updated = await prisma.trackingSession.update({
    where: { id: ref },
    data: {
      registeredAt: session.registeredAt ?? new Date(),
      brokerEmail: email ?? session.brokerEmail,
      brokerUserId: brokerUserId ?? session.brokerUserId,
    },
  });

  const result = await sendCapiEvent({
    bot: session.bot,
    session: updated,
    type: "CompleteRegistration",
    email,
    externalId: brokerUserId || (session.leadId ?? undefined),
  });

  return NextResponse.json({ ok: true, capiOk: result.ok });
}

export async function POST(req: NextRequest) {
  let body: Body = {};
  try { body = await req.json(); } catch { /* maybe form */ }
  if (!body.ref) {
    try {
      const form = await req.formData();
      body = {
        ref: String(form.get("ref") || ""),
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
