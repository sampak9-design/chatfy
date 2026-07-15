import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setActiveBot, getOwnedBot } from "@/lib/active-bot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const form = await req.formData();
  const botId = String(form.get("botId") || "").trim();
  if (!botId) return NextResponse.json({ ok: false }, { status: 400 });

  // Only allow switching to a bot this account owns.
  if (!(await getOwnedBot(botId))) return NextResponse.json({ ok: false }, { status: 403 });

  await setActiveBot(botId);
  const referer = req.headers.get("referer") || "/";
  return NextResponse.redirect(referer, 303);
}
