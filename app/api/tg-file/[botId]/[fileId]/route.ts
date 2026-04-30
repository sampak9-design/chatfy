import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxy: /api/tg-file/<botId>/<fileId>
 * Resolves a Telegram file_id to its CDN path and streams the bytes back.
 * Auth required (admin session) — admin-only inbox uses this for incoming media.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ botId: string; fileId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const { botId, fileId } = await ctx.params;
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) return new Response("bot not found", { status: 404 });

  // Step 1: getFile → file_path
  const meta = await fetch(`https://api.telegram.org/bot${bot.token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const metaJson = (await meta.json()) as { ok: boolean; result?: { file_path?: string } };
  if (!metaJson.ok || !metaJson.result?.file_path) {
    return new Response("file not found on telegram", { status: 404 });
  }

  // Step 2: stream the actual file bytes
  const fileRes = await fetch(`https://api.telegram.org/file/bot${bot.token}/${metaJson.result.file_path}`);
  if (!fileRes.ok || !fileRes.body) return new Response("failed to fetch file", { status: 502 });

  const ext = metaJson.result.file_path.split(".").pop() || "";
  const ctMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", opus: "audio/ogg",
    pdf: "application/pdf",
  };
  const contentType = ctMap[ext.toLowerCase()] || fileRes.headers.get("content-type") || "application/octet-stream";

  return new Response(fileRes.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=3600",
    },
  });
}
