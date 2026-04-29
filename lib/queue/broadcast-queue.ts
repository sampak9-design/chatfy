import { Queue } from "bullmq";
import { getRedis } from "./redis";

export interface BroadcastJob {
  broadcastId: string;
  leadId: string;
}

let queue: Queue<BroadcastJob> | null = null;

export function getBroadcastQueue(): Queue<BroadcastJob> {
  if (queue) return queue;
  queue = new Queue<BroadcastJob>("broadcasts", {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 5_000 },
      removeOnFail: { age: 7 * 86_400 },
    },
  });
  return queue;
}
