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
export async function GET(req: NextRequest, ctx: { params: Promise<{ botId: string; fileId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const { botId, fileId } = await ctx.params;
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) return new Response("bot not found", { status: 404 });

  // Step 1: getFile → file_path
  const meta = await fetch(`https://api.telegram.org/bot${bot.token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const metaJson = (await meta.json()) as { ok: boolean; result?: { file_path?: string }; description?: string };
  if (!metaJson.ok || !metaJson.result?.file_path) {
    console.error(`[tg-file] getFile failed for ${fileId}:`, metaJson.description);
    return new Response("file not found on telegram", { status: 404 });
  }

  const filePath = metaJson.result.file_path;

  // Step 2: forward Range header so the audio/video element can seek
  const range = req.headers.get("range") || undefined;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${bot.token}/${filePath}`, {
    headers: range ? { range } : {},
  });

  if (!fileRes.ok || !fileRes.body) {
    console.error(`[tg-file] download failed for ${filePath}: ${fileRes.status}`);
    return new Response("failed to fetch file", { status: 502 });
  }

  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const ctMap: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", opus: "audio/ogg",
    pdf: "application/pdf",
    webp_pic: "image/webp",
  };
  const contentType = ctMap[ext] || fileRes.headers.get("content-type") || "application/octet-stream";

  // Forward upstream headers that the browser needs for media playback (length + range support).
  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("accept-ranges", "bytes");
  const len = fileRes.headers.get("content-length");
  if (len) headers.set("content-length", len);
  const cr = fileRes.headers.get("content-range");
  if (cr) headers.set("content-range", cr);

  return new Response(fileRes.body, {
    status: fileRes.status, // 200 or 206 for partial content
    headers,
  });
}
