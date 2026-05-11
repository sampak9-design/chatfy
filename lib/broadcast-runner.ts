/**
 * Inline broadcast runner — no Redis, no separate worker.
 *
 * Strategy: when the user clicks "Disparar", the server action kicks off a
 * background async loop (setImmediate) that walks through every lead, calls
 * Telegram, updates counters in the DB, throttles to 25 msg/s.
 *
 * Why not BullMQ + worker?  Two containers + a shared Redis introduced too
 * many failure modes (env vars, separate deploys, queue state desync).  For
 * the volume Chatfy targets (≤ low five-figure leads per blast), inline
 * processing on the long-running Next.js standalone server is faster to
 * debug and just as reliable.
 *
 * Tracking state per broadcast in memory lets a follow-up Stop action
 * actually cancel mid-flight, which is what users expect.
 */
import { prisma } from "./db";
import { tgSend } from "./telegram";
import { renderTemplate } from "./template";
import type { StepType } from "@prisma/client";

const RATE_MS = 40; // ~25 msg/s — Telegram global limit is 30/s/bot

// In-memory cancel flags keyed by broadcastId.  Survives until the container restarts.
const cancelFlags = new Map<string, boolean>();
const activeRuns = new Set<string>();

export function isCancelled(broadcastId: string): boolean {
  return cancelFlags.get(broadcastId) === true;
}

export function requestCancel(broadcastId: string) {
  cancelFlags.set(broadcastId, true);
}

export function isRunning(broadcastId: string): boolean {
  return activeRuns.has(broadcastId);
}

/**
 * Run the broadcast.  Caller should *not* await this — it's designed to run
 * in the background while the server action returns / redirects immediately.
 */
export function startBroadcastRun(broadcastId: string, leadIds: string[]) {
  if (activeRuns.has(broadcastId)) {
    console.warn(`[broadcast] ${broadcastId} already running, ignoring duplicate start`);
    return;
  }
  activeRuns.add(broadcastId);
  cancelFlags.delete(broadcastId);

  // Use setImmediate so the caller's redirect happens first.
  setImmediate(() => {
    runLoop(broadcastId, leadIds).catch((e) => {
      console.error(`[broadcast] run failed ${broadcastId}:`, e);
    }).finally(() => {
      activeRuns.delete(broadcastId);
      cancelFlags.delete(broadcastId);
    });
  });
}

async function runLoop(broadcastId: string, leadIds: string[]) {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { bot: true },
  });
  if (!broadcast) return;
  if (broadcast.status !== "sending" && broadcast.status !== "scheduled") return;

  // Flip scheduled → sending on first send tick.
  if (broadcast.status === "scheduled") {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: "sending", startedAt: new Date() },
    });
  }

  const mediaType = broadcast.mediaType as StepType | null;
  const isMedia = mediaType === "image" || mediaType === "video" || mediaType === "audio" || mediaType === "document";

  console.log(`[broadcast] ${broadcastId} starting — ${leadIds.length} targets`);

  let sent = 0;
  let failed = 0;
  let blocked = 0;

  for (const leadId of leadIds) {
    if (isCancelled(broadcastId)) {
      console.log(`[broadcast] ${broadcastId} cancelled — sent=${sent}/${leadIds.length}`);
      break;
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.status !== "active") continue;

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
      sent++;
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
            buttons: (broadcast.buttons as object) ?? undefined,
            fromAdmin: false,
          },
        }),
      ]);
    } else if (result.blocked) {
      blocked++;
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
      failed++;
      console.error(`[broadcast] send failed lead=${leadId} code=${result.errorCode} desc=${result.description}`);
      await prisma.$transaction([
        prisma.broadcastLog.upsert({
          where: { broadcastId_leadId: { broadcastId, leadId } },
          create: { broadcastId, leadId, status: "failed", errorMessage: result.description },
          update: { status: "failed", errorMessage: result.description },
        }),
        prisma.broadcast.update({ where: { id: broadcastId }, data: { failedCount: { increment: 1 } } }),
      ]);
    }

    if (RATE_MS > 0) await sleep(RATE_MS);
  }

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: "done", finishedAt: new Date() },
  });

  console.log(`[broadcast] ${broadcastId} done — sent=${sent} failed=${failed} blocked=${blocked}`);
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * On server boot, resume any broadcasts that were "sending" when the previous
 * container died (e.g. Railway redeploy mid-run).  We re-enumerate the leads
 * that didn't get a "sent"/"blocked"/"failed" log yet and continue from there.
 */
export async function resumeInFlightBroadcasts() {
  const stuck = await prisma.broadcast.findMany({
    where: { status: "sending" },
    select: { id: true, totalTargets: true, botId: true, targetFilter: true },
  });
  for (const b of stuck) {
    const tf = (b.targetFilter as { status?: string; origin?: string } | null) || { status: "active" };
    const leads = await prisma.lead.findMany({
      where: {
        botId: b.botId,
        status: (tf.status || "active") as "active" | "blocked" | "unsubscribed",
        ...(tf.origin ? { origin: tf.origin as "start" | "button" | "campaign" } : {}),
      },
      select: { id: true },
    });
    // Filter to only leads that haven't been logged yet
    const settled = await prisma.broadcastLog.findMany({
      where: { broadcastId: b.id },
      select: { leadId: true },
    });
    const settledIds = new Set(settled.map((s) => s.leadId));
    const remaining = leads.filter((l) => !settledIds.has(l.id)).map((l) => l.id);
    if (remaining.length === 0) {
      await prisma.broadcast.update({
        where: { id: b.id },
        data: { status: "done", finishedAt: new Date() },
      });
      continue;
    }
    console.log(`[broadcast] resuming ${b.id} — ${remaining.length} remaining`);
    startBroadcastRun(b.id, remaining);
  }
}

/**
 * Future-fire: schedule the run for a future Date.  Uses setTimeout — fine for
 * up to ~24 days (max int32 ms).  If the container restarts before fire time,
 * resumeInFlightBroadcasts won't help because status is still "scheduled" not
 * "sending" — but on boot we also re-arm any scheduled broadcasts (below).
 */
export function scheduleBroadcastRun(broadcastId: string, leadIds: string[], when: Date) {
  const delay = Math.max(0, when.getTime() - Date.now());
  setTimeout(() => startBroadcastRun(broadcastId, leadIds), delay);
}

export async function resumeScheduledBroadcasts() {
  const now = new Date();
  const future = await prisma.broadcast.findMany({
    where: { status: "scheduled", scheduledFor: { not: null } },
    select: { id: true, scheduledFor: true, botId: true, targetFilter: true },
  });
  for (const b of future) {
    if (!b.scheduledFor) continue;
    const tf = (b.targetFilter as { status?: string; origin?: string } | null) || { status: "active" };
    const leads = await prisma.lead.findMany({
      where: {
        botId: b.botId,
        status: (tf.status || "active") as "active" | "blocked" | "unsubscribed",
        ...(tf.origin ? { origin: tf.origin as "start" | "button" | "campaign" } : {}),
      },
      select: { id: true },
    });
    const leadIds = leads.map((l) => l.id);
    if (b.scheduledFor.getTime() <= now.getTime()) {
      // Past due — fire now
      startBroadcastRun(b.id, leadIds);
    } else {
      scheduleBroadcastRun(b.id, leadIds, b.scheduledFor);
    }
  }
}
