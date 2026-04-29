/**
 * Minimal Telegram Bot API client (no SDK dependency).
 * All public methods accept the bot token explicitly so we never leak it.
 */

const API = "https://api.telegram.org";

export type TgInlineButton =
  | { text: string; url: string }
  | { text: string; callback_data: string };

export type TgKeyboard = TgInlineButton[][];

interface SendOptions {
  chatId: number | string;
  text?: string;
  caption?: string;
  parseMode?: "HTML" | "MarkdownV2";
  buttons?: TgKeyboard;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "document";
}

export interface TelegramSendResult {
  ok: boolean;
  blocked: boolean;
  errorCode?: number;
  description?: string;
}

function replyMarkup(buttons?: TgKeyboard) {
  if (!buttons || buttons.length === 0) return undefined;
  return JSON.stringify({ inline_keyboard: buttons });
}

async function call(token: string, method: string, body: Record<string, unknown>): Promise<TelegramSendResult> {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; error_code?: number; description?: string };
  if (json.ok) return { ok: true, blocked: false };

  // 403 with "bot was blocked" / "user is deactivated" → mark lead as blocked
  const desc = (json.description || "").toLowerCase();
  const blocked =
    json.error_code === 403 ||
    desc.includes("blocked") ||
    desc.includes("deactivated") ||
    desc.includes("kicked");
  return { ok: false, blocked, errorCode: json.error_code, description: json.description };
}

export async function tgSend(token: string, opts: SendOptions): Promise<TelegramSendResult> {
  const markup = replyMarkup(opts.buttons);
  if (opts.mediaUrl && opts.mediaType) {
    const map = {
      image: { method: "sendPhoto", field: "photo" },
      video: { method: "sendVideo", field: "video" },
      audio: { method: "sendAudio", field: "audio" },
      document: { method: "sendDocument", field: "document" },
    } as const;
    const cfg = map[opts.mediaType];
    return call(token, cfg.method, {
      chat_id: opts.chatId,
      [cfg.field]: opts.mediaUrl,
      caption: opts.caption ?? opts.text,
      parse_mode: opts.parseMode ?? "HTML",
      reply_markup: markup,
    });
  }
  return call(token, "sendMessage", {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: opts.parseMode ?? "HTML",
    reply_markup: markup,
    disable_web_page_preview: false,
  });
}

export async function tgSetWebhook(token: string, url: string, secret: string) {
  const res = await fetch(`${API}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }),
  });
  return res.json();
}

export async function tgDeleteWebhook(token: string) {
  const res = await fetch(`${API}/bot${token}/deleteWebhook`, { method: "POST" });
  return res.json();
}

export async function tgGetMe(token: string) {
  const res = await fetch(`${API}/bot${token}/getMe`);
  return res.json();
}

export async function tgAnswerCallback(token: string, callbackQueryId: string, text?: string) {
  return fetch(`${API}/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}
