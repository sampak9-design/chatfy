import { Queue } from "bullmq";
import { getRedis } from "./redis";

/**
 * Drives the periodic sequence sweep. A single repeatable job ("tick") fires
 * every few minutes; the worker handles it by calling processAllSequences().
 */
let queue: Queue | null = null;

export function getSequenceQueue(): Queue {
  if (queue) return queue;
  queue = new Queue("sequence-tick", {
    connection: getRedis(),
    defaultJobOptions: {
      removeOnComplete: { age: 3_600, count: 100 },
      removeOnFail: { age: 86_400 },
    },
  });
  return queue;
}

const TICK_EVERY_MS = 15 * 60_000; // 15 minutes

/** Register the repeatable tick (idempotent — safe to call on every worker boot). */
export async function ensureSequenceTick() {
  const q = getSequenceQueue();
  await q.add(
    "tick",
    {},
    {
      repeat: { every: TICK_EVERY_MS },
      jobId: "sequence-tick", // stable id → BullMQ keeps a single repeatable schedule
    },
  );
}
