import { prisma } from "./db";
import { tgSend, type TgKeyboard } from "./telegram";
import { renderTemplate } from "./template";
import { scheduleFlowStep } from "./queue/flow-queue";
import { nanoid } from "nanoid";
import type { Bot, FlowStep, Lead } from "@prisma/client";

// Delays up to this many seconds are handled inline (a natural pause between
// two quick messages). Anything longer (minutes, hours, the 24h of a drip) is
// scheduled as a BullMQ delayed job so it survives restarts and never blocks.
const INLINE_DELAY_MAX_SECONDS = 60;

interface StepButton {
  id: string;
  label: string;
  kind: "url" | "callback" | "support";
  value?: string;        // url for url/support, target stepId for callback
  nextStepId?: string;   // alias for callback
}

function buildKeyboard(step: FlowStep): TgKeyboard | undefined {
  const raw = step.buttons as unknown as StepButton[] | null;
  if (!raw || raw.length === 0) return undefined;
  return raw.map((b) => [
    b.kind === "url" || b.kind === "support"
      ? { text: b.label, url: b.value || "https://t.me" }
      : { text: b.label, callback_data: `step:${b.id}` },
  ]);
}

/**
 * Render a single step to the lead and persist their position.
 * Walks "implicit" next steps (steps without buttons that just chain forward),
 * respecting any per-step `delaySeconds`.
 *
 * Stops walking when:
 *   - hits a step with buttons (waits for callback)
 *   - hits a step of type `delay` longer than what we'd inline (we still inline a small delay)
 *   - reaches end of chain
 */
export async function runFlowFrom(bot: Bot, lead: Lead, startStepId: string) {
  let currentId: string | null = startStepId;
  let safety = 0;

  while (currentId && safety++ < 50) {
    const step: FlowStep | null = await prisma.flowStep.findUnique({ where: { id: currentId } });
    if (!step) break;

    if (step.type === "delay") {
      const seconds = Math.max(0, step.delaySeconds ?? 1);

      // Long delay → schedule the NEXT step as a delayed job and stop walking.
      // The lead resumes when the job fires (see the flow worker).
      if (seconds > INLINE_DELAY_MAX_SECONDS) {
        if (step.nextStepId) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { currentFlowId: step.flowId, currentStepId: step.id, lastInteraction: new Date() },
          });
          await scheduleFlowStep(
            { botId: bot.id, leadId: lead.id, stepId: step.nextStepId, token: lead.flowToken ?? "" },
            seconds * 1000,
          );
        }
        return;
      }

      // Short delay → inline pause (capped so it never blocks the worker).
      await new Promise((r) => setTimeout(r, Math.min(seconds * 1000, 30_000)));
      currentId = step.nextStepId;
      continue;
    }

    const buttons = buildKeyboard(step);
    const rendered = renderTemplate(step.content, lead);
    const result = await tgSend(bot.token, {
      chatId: lead.telegramId,
      text: rendered ?? undefined,
      caption: rendered ?? undefined,
      mediaUrl: step.mediaUrl ?? undefined,
      mediaType:
        step.type === "image" || step.type === "video" || step.type === "audio" || step.type === "document"
          ? step.type
          : undefined,
      buttons,
    });

    if (!result.ok) {
      console.error(
        `[flow] tg send failed step=${step.id} type=${step.type} code=${result.errorCode} desc=${result.description}`,
      );
    }

    if (!result.ok && result.blocked) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "blocked" },
      });
      return;
    }

    // Persist outgoing message for the inbox conversation history.
    if (result.ok) {
      const kind: "text" | "image" | "video" | "audio" | "document" =
        step.type === "image" || step.type === "video" || step.type === "audio" || step.type === "document"
          ? step.type
          : "text";
      await prisma.message.create({
        data: {
          botId: bot.id,
          leadId: lead.id,
          direction: "out",
          kind,
          text: rendered ?? null,
          mediaUrl: step.mediaUrl ?? null,
          buttons: buttons ? (buttons as object) : undefined,
          fromAdmin: false,
        },
      });
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        currentFlowId: step.flowId,
        currentStepId: step.id,
        lastInteraction: new Date(),
      },
    });

    // If this step has interactive buttons, wait for the user's callback.
    if (buttons && buttons.length > 0) return;

    currentId = step.nextStepId;
  }
}

/**
 * Start (or restart) a flow for a lead from its entry step.
 */
export async function startFlow(bot: Bot, lead: Lead, flowId: string) {
  const entry = await prisma.flowStep.findFirst({
    where: { flowId, isEntry: true },
    orderBy: { createdAt: "asc" },
  });
  if (!entry) return;

  // New run token: any delayed step-jobs from a previous run become stale and
  // are skipped by the worker, so re-/start restarts cleanly without duplicates.
  const token = nanoid();
  await prisma.lead.update({ where: { id: lead.id }, data: { flowToken: token } });

  await runFlowFrom(bot, { ...lead, flowToken: token }, entry.id);
}

/**
 * Handle a button press: find the button, route to next step (callback) or noop (url).
 */
export async function handleButtonCallback(bot: Bot, lead: Lead, buttonId: string) {
  // Need to find the FlowStep that contains this button.
  // We scan recent steps the lead has touched first; fallback to global search by JSON path.
  const stepsWithButton = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM flow_steps
    WHERE buttons::text LIKE ${"%\"id\":\"" + buttonId + "\"%"}
    LIMIT 1
  `;
  if (stepsWithButton.length === 0) return;
  const step = await prisma.flowStep.findUnique({ where: { id: stepsWithButton[0].id } });
  if (!step) return;

  const button = (step.buttons as unknown as StepButton[] | null)?.find((b) => b.id === buttonId);
  if (!button) return;

  if (button.kind === "callback") {
    const next = button.nextStepId || button.value;
    if (next) await runFlowFrom(bot, lead, next);
  }
  // url and support buttons are handled client-side by Telegram; no server action needed.
}
