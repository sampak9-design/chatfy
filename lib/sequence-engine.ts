/**
 * Sequence engine — day-based drip anchored to each lead's ENROLLMENT.
 *
 * Ao ser inscrito (primeiro /start ou "Processar agora"), grava-se startedAt.
 * "Dia atual" do lead = dias completos desde startedAt + 1 → TODO mundo começa
 * no Dia 1 a partir da inscrição, independente de quando entrou no bot.
 *   - inscrito agora     → dia 1
 *   - inscrito ontem     → dia 2
 *
 * Regras:
 *   - envia (uma vez) todos os passos com day <= dia atual que ainda não foram
 *     entregues, em ordem. Normalmente é 1 por dia; se o worker ficou parado, os
 *     dias represados saem em sequência (sem pular nenhum).
 *   - passos futuros (day > dia atual) esperam o dia chegar.
 *
 * Idempotência: SequenceDelivery tem unique(stepId, leadId) — reserva antes de
 * enviar, então webhook e tick nunca disparam o mesmo dia duas vezes.
 */
import { prisma } from "./db";
import { startFlow } from "./flow-engine";
import type { Bot, Lead, Sequence, SequenceStep } from "@prisma/client";

const DAY_MS = 86_400_000;

type SequenceWithSteps = Sequence & { steps: SequenceStep[] };

/** Try to reserve a delivery row. Returns false if it already exists. */
async function claim(sequenceId: string, stepId: string, leadId: string): Promise<boolean> {
  try {
    await prisma.sequenceDelivery.create({ data: { sequenceId, stepId, leadId, status: "sent" } });
    return true;
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}

/** Enrollment anchor for (sequence, lead) — creates it (startedAt = now) on first touch. */
async function anchorStartedAt(sequenceId: string, leadId: string): Promise<Date> {
  const existing = await prisma.sequenceEnrollment.findUnique({
    where: { sequenceId_leadId: { sequenceId, leadId } },
    select: { startedAt: true },
  });
  if (existing) return existing.startedAt;
  try {
    const created = await prisma.sequenceEnrollment.create({
      data: { sequenceId, leadId },
      select: { startedAt: true },
    });
    return created.startedAt;
  } catch {
    // Race: created concurrently — read it back.
    const again = await prisma.sequenceEnrollment.findUnique({
      where: { sequenceId_leadId: { sequenceId, leadId } },
      select: { startedAt: true },
    });
    return again?.startedAt ?? new Date();
  }
}

async function deliverForLead(bot: Bot, lead: Lead, sequences: SequenceWithSteps[], now: number) {
  if (lead.status !== "active") return;

  for (const seq of sequences) {
    if (seq.steps.length === 0) continue;
    const startedAt = await anchorStartedAt(seq.id, lead.id);
    const day = Math.floor(Math.max(0, now - startedAt.getTime()) / DAY_MS) + 1;

    for (const step of seq.steps) {
      if (step.day > day) break; // ordered by day → nothing else is due yet
      const reserved = await claim(seq.id, step.id, lead.id);
      if (!reserved) continue; // already delivered

      try {
        const sent = await startFlow(bot, lead, step.flowId);
        if (!sent) {
          console.error("[sequence] flow has no entry step", { seq: seq.id, step: step.id, flow: step.flowId });
          await prisma.sequenceDelivery
            .update({ where: { stepId_leadId: { stepId: step.id, leadId: lead.id } }, data: { status: "failed" } })
            .catch(() => {});
        }
      } catch (err) {
        console.error("[sequence] send failed", { seq: seq.id, step: step.id, lead: lead.id, err });
        await prisma.sequenceDelivery
          .update({ where: { stepId_leadId: { stepId: step.id, leadId: lead.id } }, data: { status: "failed" } })
          .catch(() => {});
      }
    }
  }
}

/** Fire any currently-due sequence steps for a single lead (used on /start for instant Dia 1). */
export async function processSequencesForLead(bot: Bot, lead: Lead) {
  const sequences = await prisma.sequence.findMany({
    where: { botId: bot.id, active: true },
    include: { steps: { orderBy: { day: "asc" } } },
  });
  if (sequences.length === 0) return;
  await deliverForLead(bot, lead, sequences, Date.now());
}

/**
 * Reset a sequence: wipe all deliveries + enrollments so every lead restarts at
 * Dia 1 from now. After this, "Processar agora" (or the next tick / /start) will
 * re-enroll everyone and send Dia 1.
 */
export async function resetSequence(sequenceId: string) {
  await prisma.sequenceDelivery.deleteMany({ where: { sequenceId } });
  await prisma.sequenceEnrollment.deleteMany({ where: { sequenceId } });
}

/** Run one sequence now against all active leads of its bot (used by the "Processar agora" button). */
export async function processSequenceNow(sequenceId: string) {
  const now = Date.now();
  const seq = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: { steps: { orderBy: { day: "asc" } } },
  });
  if (!seq || !seq.active) return;
  const bot = await prisma.bot.findUnique({ where: { id: seq.botId } });
  if (!bot) return;

  let cursor: string | undefined;
  for (;;) {
    const leads = await prisma.lead.findMany({
      where: { botId: seq.botId, status: "active" },
      take: 500,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (leads.length === 0) break;
    for (const lead of leads) await deliverForLead(bot, lead, [seq], now);
    if (leads.length < 500) break;
    cursor = leads[leads.length - 1].id;
  }
}

/** Periodic sweep (worker tick): advance every active lead of every bot that has sequences. */
export async function processAllSequences() {
  const now = Date.now();

  const active = await prisma.sequence.findMany({
    where: { active: true },
    include: { steps: { orderBy: { day: "asc" } } },
  });
  if (active.length === 0) return;

  // Group sequences by bot.
  const byBot = new Map<string, SequenceWithSteps[]>();
  for (const s of active) {
    const arr = byBot.get(s.botId) ?? [];
    arr.push(s);
    byBot.set(s.botId, arr);
  }

  for (const [botId, sequences] of byBot) {
    const bot = await prisma.bot.findUnique({ where: { id: botId } });
    if (!bot || bot.paused || !bot.active) continue;

    // Page through active leads so audiences of any size are handled.
    let cursor: string | undefined;
    for (;;) {
      const leads = await prisma.lead.findMany({
        where: { botId, status: "active" },
        take: 500,
        orderBy: { id: "asc" },
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (leads.length === 0) break;
      for (const lead of leads) await deliverForLead(bot, lead, sequences, now);
      if (leads.length < 500) break;
      cursor = leads[leads.length - 1].id;
    }
  }
}
