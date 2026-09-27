/**
 * Saúde do processamento em background (Redis + worker).
 * Serve pra enxergar no painel se o serviço worker está de pé — sem ele a
 * sequência não avança e os delays de fluxo não disparam.
 */
import { getSequenceQueue } from "./queue/sequence-queue";
import { getFlowQueue } from "./queue/flow-queue";
import { getBroadcastQueue } from "./queue/broadcast-queue";

export interface SystemHealth {
  ok: boolean;             // Redis acessível
  workerOnline: boolean;   // algum worker conectado na fila do tick
  workers: number;
  lastTickAt: Date | null; // último ciclo da sequência concluído
  scheduled: number;       // passos de fluxo agendados (delayed + waiting)
  failed: number;          // jobs com falha
  error?: string;
}

const EMPTY: SystemHealth = {
  ok: false,
  workerOnline: false,
  workers: 0,
  lastTickAt: null,
  scheduled: 0,
  failed: 0,
};

export async function getSystemHealth(): Promise<SystemHealth> {
  try {
    const seqQ = getSequenceQueue();
    const flowQ = getFlowQueue();
    const bQ = getBroadcastQueue();

    const [workers, tickJobs, flowCounts, bCounts] = await Promise.all([
      seqQ.getWorkers(),
      seqQ.getJobs(["completed"], 0, 4),
      flowQ.getJobCounts("delayed", "waiting", "failed"),
      bQ.getJobCounts("failed"),
    ]);

    const finished = tickJobs.map((j) => j.finishedOn ?? 0).filter((t) => t > 0);
    const lastTickAt = finished.length ? new Date(Math.max(...finished)) : null;

    return {
      ok: true,
      workerOnline: workers.length > 0,
      workers: workers.length,
      lastTickAt,
      scheduled: (flowCounts.delayed ?? 0) + (flowCounts.waiting ?? 0),
      failed: (flowCounts.failed ?? 0) + (bCounts.failed ?? 0),
    };
  } catch (e) {
    return { ...EMPTY, error: e instanceof Error ? e.message : "falha ao consultar o Redis" };
  }
}
