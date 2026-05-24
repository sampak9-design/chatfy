/**
 * Active bot selection — cookie-based. The header switcher lets the admin
 * pick which bot to view; every page that lists bot-scoped data reads here.
 *
 * Falls back to the first bot if no cookie set (preserves single-bot UX).
 */
import { cookies } from "next/headers";
import { prisma } from "./db";
import type { Bot, BotChannel } from "@prisma/client";

const COOKIE = "chatfy_active_bot";

export async function getActiveBot(filter?: { channel?: BotChannel }): Promise<Bot | null> {
  const where = filter?.channel ? { channel: filter.channel } : {};

  const jar = await cookies();
  const cookieId = jar.get(COOKIE)?.value;
  if (cookieId) {
    const b = await prisma.bot.findUnique({ where: { id: cookieId } });
    if (b && (!filter?.channel || b.channel === filter.channel)) return b;
  }
  return prisma.bot.findFirst({ where, orderBy: { createdAt: "asc" } });
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
  const where = filter?.channel ? { channel: filter.channel } : {};
  return prisma.bot.findMany({ where, orderBy: { createdAt: "asc" } });
}
