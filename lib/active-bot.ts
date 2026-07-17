/**
 * Active bot selection — cookie-based. The header switcher lets the admin
 * pick which bot to view; every page that lists bot-scoped data reads here.
 *
 * Falls back to the first bot if no cookie set (preserves single-bot UX).
 */
import { cookies } from "next/headers";
import { prisma } from "./db";
import { requireOwnerId } from "./auth";
import type { Bot, BotChannel } from "@prisma/client";

const COOKIE = "chatfy_active_bot";

export async function getActiveBot(filter?: { channel?: BotChannel }): Promise<Bot | null> {
  const ownerId = await requireOwnerId();
  const where = { ownerId, ...(filter?.channel ? { channel: filter.channel } : {}) };

  const jar = await cookies();
  const cookieId = jar.get(COOKIE)?.value;
  if (cookieId) {
    // Only honor the cookie if the bot belongs to this account.
    const b = await prisma.bot.findFirst({ where: { id: cookieId, ...where } });
    if (b) return b;
  }
  return prisma.bot.findFirst({ where, orderBy: { createdAt: "asc" } });
}

/**
 * Fetch a bot by id only if it belongs to the current account, else null.
 * Use in every by-id page/action so one account can't touch another's bot.
 */
export async function getOwnedBot(botId: string): Promise<Bot | null> {
  const ownerId = await requireOwnerId();
  return prisma.bot.findFirst({ where: { id: botId, ownerId } });
}

/** True if the flow's bot belongs to the current account. */
export async function ownsFlow(flowId: string): Promise<boolean> {
  const ownerId = await requireOwnerId();
  const f = await prisma.flow.findFirst({ where: { id: flowId, bot: { ownerId } }, select: { id: true } });
  return !!f;
}

/** True if the funnel's bot belongs to the current account. */
export async function ownsFunnel(funnelId: string): Promise<boolean> {
  const ownerId = await requireOwnerId();
  const f = await prisma.funnel.findFirst({ where: { id: funnelId, bot: { ownerId } }, select: { id: true } });
  return !!f;
}

/** True if the landing's bot belongs to the current account. */
export async function ownsLanding(landingId: string): Promise<boolean> {
  const ownerId = await requireOwnerId();
  const l = await prisma.landing.findFirst({ where: { id: landingId, bot: { ownerId } }, select: { id: true } });
  return !!l;
}

/** True if the sequence's bot belongs to the current account. */
export async function ownsSequence(sequenceId: string): Promise<boolean> {
  const ownerId = await requireOwnerId();
  const s = await prisma.sequence.findFirst({ where: { id: sequenceId, bot: { ownerId } }, select: { id: true } });
  return !!s;
}

export async function setActiveBot(botId: string) {
  const jar = await cookies();
  jar.set(COOKIE, botId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

export async function listBots(filter?: { channel?: BotChannel }): Promise<Bot[]> {
  const ownerId = await requireOwnerId();
  const where = { ownerId, ...(filter?.channel ? { channel: filter.channel } : {}) };
  return prisma.bot.findMany({ where, orderBy: { createdAt: "asc" } });
}
