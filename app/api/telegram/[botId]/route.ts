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

interface TgPhotoSize { file_id: string; width: number; height: number }
interface TgFile { file_id: string; mime_type?: string }

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number };
  text?: string;
  caption?: string;
  contact?: { phone_number?: string };
  photo?: TgPhotoSize[];
  video?: TgFile;
  audio?: TgFile;
  voice?: TgFile;
  document?: TgFile;
  sticker?: TgFile;
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

async function storeIncoming(botId: string, leadId: string, msg: TgMessage) {
  // Pick the best media we can persist for the inbox.
  let kind: "text" | "image" | "video" | "audio" | "document" | "sticker" | "other" = "text";
  let fileId: string | undefined;
  if (msg.photo && msg.photo.length > 0) {
    kind = "image";
    fileId = msg.photo[msg.photo.length - 1].file_id; // largest size
  } else if (msg.video) { kind = "video"; fileId = msg.video.file_id; }
  else if (msg.audio || msg.voice) { kind = "audio"; fileId = (msg.audio || msg.voice)!.file_id; }
  else if (msg.document) { kind = "document"; fileId = msg.document.file_id; }
  else if (msg.sticker) { kind = "sticker"; fileId = msg.sticker.file_id; }
  else if (!msg.text) { kind = "other"; }

  await prisma.message.create({
    data: {
      botId,
      leadId,
      direction: "in",
      kind,
      text: msg.text || msg.caption || null,
      fileId: fileId || null,
    },
  });
}

async function upsertLead(
  bot: Bot,
  user: TgUser,
  origin: "start" | "button" | "campaign" = "start",
  source?: string,
): Promise<Lead> {
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
      source: source ?? null,
      ...data,
    },
    update: {
      ...data,
      // Don't overwrite source if the lead already had one (preserve first-touch attribution).
      // If they came back, mark active again.
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
    const msg = update.message;
    const text = msg?.text;

    if (text && text.startsWith("/start") && msg?.from) {
      // Telegram delivers `t.me/<bot>?start=foo` as the message text "/start foo".
      const param = text.slice("/start".length).trim().slice(0, 64) || undefined;
      const lead = await upsertLead(bot, msg.from, "start", param);
      await storeIncoming(bot.id, lead.id, msg);
      if (bot.welcomeFlowId) {
        startFlow(bot, lead, bot.welcomeFlowId).catch((e) => console.error("[startFlow]", e));
      }
    } else if (update.callback_query?.data?.startsWith("step:")) {
      const cq = update.callback_query;
      const lead = await upsertLead(bot, cq.from, "button");
      const buttonId = cq.data!.slice("step:".length);
      tgAnswerCallback(bot.token, cq.id).catch(() => {});
      handleButtonCallback(bot, lead, buttonId).catch((e) => console.error("[callback]", e));
    } else if (msg?.from) {
      const lead = await upsertLead(bot, msg.from, "start");
      await storeIncoming(bot.id, lead.id, msg);
    }
  } catch (e) {
    console.error("[webhook]", e);
  }

  return NextResponse.json({ ok: true });
}
