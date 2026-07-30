import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tgAnswerCallback, tgSend } from "@/lib/telegram";
import { handleButtonCallback, startFlow } from "@/lib/flow-engine";
import { processSequencesForLead } from "@/lib/sequence-engine";
import { sendCapiEvent } from "@/lib/meta-capi";
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

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Notify the configured channel/group that a user sent a message to the bot. */
async function notifyIncoming(bot: Bot, lead: Lead, msg: TgMessage) {
  if (!bot.notifyChatId) return;
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || `id ${lead.telegramId}`;
  const uname = lead.username ? ` (@${lead.username})` : "";
  let body = msg.text || msg.caption || "";
  if (!body) {
    body = msg.photo ? "🖼️ [imagem]"
      : msg.video ? "🎥 [vídeo]"
      : msg.audio || msg.voice ? "🎧 [áudio]"
      : msg.document ? "📎 [documento]"
      : msg.sticker ? "🩷 [figurinha]"
      : "[mensagem]";
  }
  const text =
    `📩 <b>Nova mensagem no bot</b> — ${escapeHtml(bot.name)}\n` +
    `👤 ${escapeHtml(name)}${escapeHtml(uname)}\n` +
    `🆔 <code>${lead.telegramId}</code>\n\n` +
    escapeHtml(body).slice(0, 3500);

  // Link direto pra abrir a conversa desse lead no Inbox do painel.
  const appUrl = process.env.APP_URL;
  const buttons = appUrl
    ? [[{ text: "💬 Abrir conversa no painel", url: `${appUrl}/inbox?lead=${lead.id}` }]]
    : undefined;

  await tgSend(bot.token, { chatId: bot.notifyChatId, text, buttons }).catch((e) => console.error("[notify]", e));
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

      // Deep-link conventions:
      //   t_<sessionId> → tracking session from a Chatfy landing (fires Lead CAPI)
      //   f_<flowId>    → start that specific flow instead of welcome
      let targetFlowId: string | null = bot.welcomeFlowId ?? null;
      let trackingSessionId: string | null = null;

      if (param?.startsWith("f_")) {
        const flowId = param.slice(2);
        const flow = await prisma.flow.findFirst({
          where: { id: flowId, botId: bot.id, active: true },
          select: { id: true },
        });
        if (flow) targetFlowId = flow.id;
      } else if (param?.startsWith("t_")) {
        const sessionId = param.slice(2);
        const session = await prisma.trackingSession.findFirst({
          where: { id: sessionId, botId: bot.id },
          include: { landing: true },
        });
        if (session) {
          trackingSessionId = session.id;
          if (session.landing?.flowId) targetFlowId = session.landing.flowId;
        }
      }

      const lead = await upsertLead(bot, msg.from, "start", param);
      await storeIncoming(bot.id, lead.id, msg);

      // Link the tracking session to the lead and fire Lead CAPI
      if (trackingSessionId) {
        const session = await prisma.trackingSession.update({
          where: { id: trackingSessionId },
          data: { leadId: lead.id, leadAt: new Date() },
        });
        sendCapiEvent({
          bot,
          session,
          type: "Lead",
          externalId: lead.telegramId,
        }).catch((e) => console.error("[capi lead]", e));
      }

      if (targetFlowId) {
        startFlow(bot, lead, targetFlowId).catch((e) => console.error("[startFlow]", e));
      }

      // Enroll in active drip sequences and fire the day this lead is due right now.
      processSequencesForLead(bot, lead).catch((e) => console.error("[sequence]", e));
    } else if (update.callback_query?.data?.startsWith("step:")) {
      const cq = update.callback_query;
      const lead = await upsertLead(bot, cq.from, "button");
      const buttonId = cq.data!.slice("step:".length);
      tgAnswerCallback(bot.token, cq.id).catch(() => {});
      handleButtonCallback(bot, lead, buttonId).catch((e) => console.error("[callback]", e));
    } else if (msg?.from) {
      const lead = await upsertLead(bot, msg.from, "start");
      await storeIncoming(bot.id, lead.id, msg);
      notifyIncoming(bot, lead, msg).catch((e) => console.error("[notify]", e));
    }
  } catch (e) {
    console.error("[webhook]", e);
  }

  return NextResponse.json({ ok: true });
}
