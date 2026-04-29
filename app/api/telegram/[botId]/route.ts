import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tgAnswerCallback } from "@/lib/telegram";
import { handleButtonCallback, startFlow } from "@/lib/flow-engine";
import type { Bot, Lead } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number };
  text?: string;
  contact?: { phone_number?: string };
}

interface TgCallbackQuery {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

async function upsertLead(bot: Bot, user: TgUser, origin: "start" | "button" | "campaign" = "start"): Promise<Lead> {
  const data = {
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    username: user.username ?? null,
    languageCode: user.language_code ?? null,
    lastInteraction: new Date(),
  };
  return prisma.lead.upsert({
    where: { botId_telegramId: { botId: bot.id, telegramId: String(user.id) } },
    create: {
      botId: bot.id,
      telegramId: String(user.id),
      origin,
      status: "active",
      ...data,
    },
    update: {
      ...data,
      // If they came back, mark active again
      status: "active",
    },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ botId: string }> }) {
  const { botId } = await ctx.params;

  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot || !bot.active) return NextResponse.json({ ok: false }, { status: 404 });

  // Validate Telegram secret header
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (secretHeader !== bot.webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json()) as TgUpdate;

  try {
    if (update.message?.text === "/start" && update.message.from) {
      const lead = await upsertLead(bot, update.message.from, "start");
      if (bot.welcomeFlowId) {
        // fire and forget — Telegram expects a 200 quickly
        startFlow(bot, lead, bot.welcomeFlowId).catch((e) => console.error("[startFlow]", e));
      }
    } else if (update.callback_query?.data?.startsWith("step:")) {
      const cq = update.callback_query;
      const lead = await upsertLead(bot, cq.from, "button");
      const buttonId = cq.data!.slice("step:".length);
      tgAnswerCallback(bot.token, cq.id).catch(() => {});
      handleButtonCallback(bot, lead, buttonId).catch((e) => console.error("[callback]", e));
    } else if (update.message?.from) {
      // Any other message — at least keep lead fresh
      await upsertLead(bot, update.message.from, "start");
    }
  } catch (e) {
    console.error("[webhook]", e);
  }

  return NextResponse.json({ ok: true });
}
