/**
 * Broadcast worker — consumes jobs from the "broadcasts" queue and sends Telegram messages.
 * Run alongside the web server (separate Railway service or `npm run worker`).
 */
import { Worker } from "bullmq";
import { prisma } from "../db";
import { tgSend } from "../telegram";
import { renderTemplate } from "../template";
import { getRedis } from "./redis";
import type { BroadcastJob } from "./broadcast-queue";
import type { StepType } from "@prisma/client";

// Telegram limits ~30 msg/sec. We use BullMQ's `limiter` per worker = 25/sec safe headroom.
const RATE = { max: 25, duration: 1000 };

console.log("[worker] starting broadcast worker");

const worker = new Worker<BroadcastJob>(
  "broadcasts",
  async (job) => {
    const { broadcastId, leadId } = job.data;

    const [broadcast, lead] = await Promise.all([
      prisma.broadcast.findUnique({ where: { id: broadcastId }, include: { bot: true } }),
      prisma.lead.findUnique({ where: { id: leadId } }),
    ]);
    if (!broadcast || !lead) return;
    if (lead.status !== "active") return;

    const mediaType = broadcast.mediaType as StepType | null;
    const isMedia = mediaType === "image" || mediaType === "video" || mediaType === "audio" || mediaType === "document";

    // First job of a scheduled broadcast: flip status to "sending"
    if (broadcast.status === "scheduled") {
      await prisma.broadcast.updateMany({
        where: { id: broadcastId, status: "scheduled" },
        data: { status: "sending", startedAt: new Date() },
      });
    }

    const rendered = renderTemplate(broadcast.text, lead);
    const result = await tgSend(broadcast.bot.token, {
      chatId: lead.telegramId,
      text: rendered ?? undefined,
      caption: rendered ?? undefined,
      mediaUrl: broadcast.mediaUrl ?? undefined,
      mediaType: isMedia ? (mediaType as "image" | "video" | "audio" | "document") : undefined,
      buttons: broadcast.buttons as never,
    });

    if (result.ok) {
      const kind: "text" | "image" | "video" | "audio" | "document" = isMedia
        ? (mediaType as "image" | "video" | "audio" | "document")
        : "text";
      await prisma.$transaction([
        prisma.broadcastLog.upsert({
          where: { broadcastId_leadId: { broadcastId, leadId } },
          create: { broadcastId, leadId, status: "sent", sentAt: new Date() },
          update: { status: "sent", sentAt: new Date(), errorMessage: null },
        }),
        prisma.broadcast.update({ where: { id: broadcastId }, data: { sentCount: { increment: 1 } } }),
        prisma.message.create({
          data: {
            botId: broadcast.botId,
            leadId,
            direction: "out",
            kind,
            text: rendered ?? null,
            mediaUrl: broadcast.mediaUrl ?? null,
            fromAdmin: false,
          },
        }),
      ]);
    } else if (result.blocked) {
      await prisma.$transaction([
        prisma.lead.update({ where: { id: leadId }, data: { status: "blocked" } }),
        prisma.broadcastLog.upsert({
          where: { broadcastId_leadId: { broadcastId, leadId } },
          create: { broadcastId, leadId, status: "blocked", errorMessage: result.description },
          update: { status: "blocked", errorMessage: result.description },
        }),
        prisma.broadcast.update({ where: { id: broadcastId }, data: { blockedCount: { increment: 1 } } }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.broadcastLog.upsert({
          where: { broadcastId_leadId: { broadcastId, leadId } },
          create: { broadcastId, leadId, status: "failed", errorMessage: result.description },
          update: { status: "failed", errorMessage: result.description },
        }),
        prisma.broadcast.update({ where: { id: broadcastId }, data: { failedCount: { increment: 1 } } }),
      ]);
      // Throw so BullMQ retries (up to attempts limit)
      throw new Error(`tg error ${result.errorCode}: ${result.description}`);
    }
  },
  {
    connection: getRedis(),
    concurrency: 10,
    limiter: RATE,
  },
);

worker.on("completed", (job) => {
  // Check if this was the last job for the broadcast and finalize
  finalizeIfDone(job.data.broadcastId).catch(() => {});
});

worker.on("failed", (job, err) => {
  console.error("[worker] job failed", job?.id, err.message);
  if (job) finalizeIfDone(job.data.broadcastId).catch(() => {});
});

async function finalizeIfDone(broadcastId: string) {
  const b = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (!b || b.finishedAt) return;
  const settled = b.sentCount + b.failedCount + b.blockedCount;
  if (settled >= b.totalTargets) {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: "done", finishedAt: new Date() },
    });
    console.log(`[worker] broadcast ${broadcastId} done — sent=${b.sentCount} failed=${b.failedCount} blocked=${b.blockedCount}`);
  }
}

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM, draining…");
  await worker.close();
  process.exit(0);
});
