import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { FunnelEditor } from "@/components/funnel-canvas/FunnelEditor";
import type { FunnelGraph } from "@/components/funnel-canvas/types";

export const dynamic = "force-dynamic";

async function saveFunnel(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const graphRaw = String(formData.get("graph"));
  let graph: FunnelGraph;
  try { graph = JSON.parse(graphRaw); } catch { return; }

  await prisma.funnel.update({
    where: { id },
    data: { graph: graph as object, ...(name ? { name } : {}) },
  });
  revalidatePath(`/track/${id}`);
}

export default async function TrackEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const funnel = await prisma.funnel.findUnique({ where: { id } });
  if (!funnel) notFound();

  const landings = await prisma.landing.findMany({
    where: { botId: funnel.botId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const graph = (funnel.graph as unknown as FunnelGraph) || { nodes: [], edges: [] };

  return (
    <FunnelEditor
      funnelId={funnel.id}
      funnelName={funnel.name}
      initialGraph={graph}
      landings={landings}
      saveAction={saveFunnel}
    />
  );
}
