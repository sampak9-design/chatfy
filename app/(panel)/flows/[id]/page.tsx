import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { FlowEditor } from "@/components/flow-editor/FlowEditor";
import type { FlowGraph, FlowNodeData } from "@/components/flow-editor/types";

export const dynamic = "force-dynamic";

async function saveFlow(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const graphRaw = String(formData.get("graph"));
  const name = String(formData.get("name") || "").trim();

  let graph: FlowGraph;
  try {
    graph = JSON.parse(graphRaw);
  } catch {
    return;
  }

  // Persist the graph blob (source of truth for the editor)
  await prisma.flow.update({
    where: { id },
    data: { graph: graph as object, ...(name ? { name } : {}) },
  });

  // Sync FlowStep rows so the runtime engine has a queryable representation.
  // Strategy: wipe and recreate. Flows are small (<200 nodes typical), this is fine.
  await prisma.flowStep.deleteMany({ where: { flowId: id } });

  // First pass: create all steps without nextStepId mapping
  const nodeIdToStepId = new Map<string, string>();
  for (const node of graph.nodes) {
    const data = node.data as FlowNodeData;
    if (data.type === "start") {
      // The "start" node has no message body; we don't persist it as a step.
      continue;
    }
    const created = await prisma.flowStep.create({
      data: {
        flowId: id,
        nodeId: node.id,
        type: data.type as "text" | "image" | "video" | "audio" | "document" | "delay" | "buttons",
        content: data.content || null,
        mediaUrl: data.mediaUrl || null,
        delaySeconds: data.delaySeconds ?? null,
        buttons: data.buttons ? (data.buttons as object) : undefined,
        isEntry: false,
      },
    });
    nodeIdToStepId.set(node.id, created.id);
  }

  // Identify entry nodes: targets of edges originating from the "start" node
  const startNode = graph.nodes.find((n) => (n.data as FlowNodeData).type === "start");
  const entryTargets = new Set<string>();
  if (startNode) {
    for (const e of graph.edges) {
      if (e.source === startNode.id) entryTargets.add(e.target);
    }
  }

  // Second pass: wire up nextStepId from "default" edges, button nextStepId from button-handle edges
  for (const node of graph.nodes) {
    const data = node.data as FlowNodeData;
    if (data.type === "start") continue;
    const stepId = nodeIdToStepId.get(node.id);
    if (!stepId) continue;

    // implicit next: an edge from this node's "out" (no sourceHandle, or sourceHandle === "out")
    const implicitEdge = graph.edges.find(
      (e) => e.source === node.id && (!e.sourceHandle || e.sourceHandle === "out"),
    );
    const implicitNextStepId = implicitEdge ? nodeIdToStepId.get(implicitEdge.target) : undefined;

    // button edges: sourceHandle = `btn:<buttonId>`
    let buttonsWithRouting: object | undefined;
    if (data.buttons && data.buttons.length > 0) {
      buttonsWithRouting = data.buttons.map((b) => {
        if (b.kind !== "callback") return b;
        const edge = graph.edges.find((e) => e.source === node.id && e.sourceHandle === `btn:${b.id}`);
        const nextStepId = edge ? nodeIdToStepId.get(edge.target) : undefined;
        return { ...b, nextStepId };
      });
    }

    await prisma.flowStep.update({
      where: { id: stepId },
      data: {
        nextStepId: implicitNextStepId ?? null,
        isEntry: entryTargets.has(node.id),
        buttons: buttonsWithRouting,
      },
    });
  }

  revalidatePath(`/flows/${id}`);
}

async function setAsWelcome(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const flow = await prisma.flow.findUnique({ where: { id } });
  if (!flow) return;
  await prisma.bot.update({ where: { id: flow.botId }, data: { welcomeFlowId: id } });
  revalidatePath(`/flows/${id}`);
  redirect(`/flows/${id}`);
}

export default async function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const flow = await prisma.flow.findUnique({ where: { id } });
  if (!flow) notFound();
  const bot = await prisma.bot.findUnique({ where: { id: flow.botId } });

  const graph = (flow.graph as unknown as FlowGraph) || { nodes: [], edges: [] };
  const isWelcome = bot?.welcomeFlowId === flow.id;

  return (
    <FlowEditor
      flowId={flow.id}
      flowName={flow.name}
      initialGraph={graph}
      saveAction={saveFlow}
      setAsWelcomeAction={setAsWelcome}
      isWelcome={isWelcome}
    />
  );
}
