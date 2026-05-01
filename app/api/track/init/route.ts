import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendCapiEvent } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const landingId = String(form.get("landingId") || "");
  if (!landingId) return new NextResponse("missing landingId", { status: 400 });

  const landing = await prisma.landing.findUnique({
    where: { id: landingId },
    include: { bot: true },
  });
  if (!landing || !landing.active) return new NextResponse("landing inactive", { status: 404 });

  const session = await prisma.trackingSession.create({
    data: {
      botId: landing.botId,
      landingId: landing.id,
      fbclid: (form.get("fbclid") as string) || null,
      fbp: (form.get("fbp") as string) || null,
      fbc: (form.get("fbc") as string) || null,
      utmSource: (form.get("utm_source") as string) || null,
      utmMedium: (form.get("utm_medium") as string) || null,
      utmCampaign: (form.get("utm_campaign") as string) || null,
      utmContent: (form.get("utm_content") as string) || null,
      utmTerm: (form.get("utm_term") as string) || null,
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") || null,
    },
  });

  // Fire-and-forget PageView so we don't block the redirect.
  sendCapiEvent({
    bot: landing.bot,
    session,
    type: "PageView",
    eventSourceUrl: req.headers.get("referer") || undefined,
  }).catch((e) => console.error("[capi pageview]", e));

  // Redirect to Telegram with our tracking id encoded after /start
  const startParam = `t_${session.id}`;
  const tgUrl = landing.bot.username
    ? `https://t.me/${landing.bot.username}?start=${startParam}`
    : `/`; // fallback if bot username missing

  return NextResponse.redirect(tgUrl, 303);
}
