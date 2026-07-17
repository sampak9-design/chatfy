/**
 * Sequence engine — day-based drip anchored to each lead's entry (Lead.createdAt).
 *
 * "Dia atual" do lead = quantos dias completos se passaram desde a entrada + 1.
 *   - entrou hoje        → dia 1
 *   - entrou ontem       → dia 2
 *   - entrou há 5 dias   → dia 6
 *
 * Regras:
 *   - o passo cujo `day` == dia atual é ENVIADO (uma vez).
 *   - passos de dias já vencidos (day < dia atual) que nunca foram entregues são
 *     marcados como "skipped" (não reenviados) — é o catch-up de quem já estava
 *     no meio do caminho quando a sequência foi criada.
 *   - passos futuros (day > dia atual) esperam o dia chegar.
 *
 * Idempotência: SequenceDelivery tem unique(stepId, leadId). A entrega é
 * "reivindicada" criando o registro antes de enviar, então webhook e tick
 * nunca disparam o mesmo dia duas vezes.
 */
import { prisma } from "./db";
import { startFlow } from "./flow-engine";
import type { Bot, Lead, Sequence, SequenceStep } from "@prisma/client";

const DAY_MS = 86_400_000;

type SequenceWithSteps = Sequence & { steps: SequenceStep[] };

/** 1-based day of the journey for this lead, right now. */
function currentDay(lead: Lead, now: number): number {
  const elapsed = Math.max(0, now - lead.createdAt.getTime());
  return Math.floor(elapsed / DAY_MS) + 1;
}

/** Try to reserve a delivery row. Returns false if it already exists. */
async function claim(
  sequenceId: string,
  stepId: string,
  leadId: string,
  status: "sent" | "skipped",
): Promise<boolean> {
  try {
    await prisma.sequenceDelivery.create({ data: { sequenceId, stepId, leadId, status } });
    return true;
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}

async function deliverForLead(bot: Bot, lead: Lead, sequences: SequenceWithSteps[], now: number) {
  if (lead.status !== "active") return;
  const day = currentDay(lead, now);

  for (const seq of sequences) {
    for (const step of seq.steps) {
      if (step.day > day) break; // steps are ordered by day → nothing else is due
      const send = step.day === day;
      const reserved = await claim(seq.id, step.id, lead.id, send ? "sent" : "skipped");
      if (!reserved) continue; // already delivered/skipped in a previous run
      if (!send) continue; // past day → recorded as skipped, nothing to send

      try {
        await startFlow(bot, lead, step.flowId);
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
