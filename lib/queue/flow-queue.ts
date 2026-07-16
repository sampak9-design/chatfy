import { Queue } from "bullmq";
import { getRedis } from "./redis";

/**
 * A single scheduled step in a lead's flow journey.
 * Used to resume a flow after a long delay (e.g. the 24h between days of a
 * 60-day drip) — the job fires `stepId` for `leadId` once the delay elapses.
 */
export interface FlowJob {
  botId: string;
  leadId: string;
  stepId: string;   // the step to render when the job fires
  token: string;    // lead.flowToken snapshot; if it changed, the run was superseded → skip
}

let queue: Queue<FlowJob> | null = null;

export function getFlowQueue(): Queue<FlowJob> {
  if (queue) return queue;
  queue = new Queue<FlowJob>("flow-steps", {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { age: 7 * 86_400, count: 10_000 },
      removeOnFail: { age: 14 * 86_400 },
    },
  });
  return queue;
}

/** Enqueue the next step to run after `delayMs`. Deduped by (lead, step, token). */
export async function scheduleFlowStep(job: FlowJob, delayMs: number) {
  const q = getFlowQueue();
  await q.add("step", job, {
    delay: Math.max(0, delayMs),
    jobId: `flow:${job.leadId}:${job.stepId}:${job.token}`,
  });
}
