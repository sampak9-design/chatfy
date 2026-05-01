import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type NodeKind = "pageview" | "lead" | "registered" | "deposited" | "custom";

interface FunnelNodeData {
  kind: NodeKind;
  label: string;
  landingId?: string;
  utmSource?: string;
  utmCampaign?: string;
}

interface FunnelGraph {
  nodes: { id: string; data: FunnelNodeData }[];
  edges: { id: string; source: string; target: string }[];
}

function rangeFromQuery(req: NextRequest): { gte?: Date; lte?: Date } {
  const range = req.nextUrl.searchParams.get("range") || "all";
  const now = new Date();
  if (range === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return { gte: d };
  }
  if (range === "7d") {
    return { gte: new Date(now.getTime() - 7 * 86_400_000) };
  }
  if (range === "30d") {
    return { gte: new Date(now.getTime() - 30 * 86_400_000) };
  }
  return {};
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const funnel = await prisma.funnel.findUnique({ where: { id } });
  if (!funnel) return NextResponse.json({ error: "not found" }, { status: 404 });

  const graph = funnel.graph as unknown as FunnelGraph;
  const dateRange = rangeFromQuery(req);

  // Build a count for each node
  const counts: Record<string, number> = {};
  const sumDeposit: Record<string, number> = {};

  await Promise.all(
    graph.nodes.map(async (n) => {
      const d = n.data;
      const baseWhere = {
        botId: funnel.botId,
        ...(d.landingId ? { landingId: d.landingId } : {}),
        ...(d.utmSource ? { utmSource: d.utmSource } : {}),
        ...(d.utmCampaign ? { utmCampaign: d.utmCampaign } : {}),
      };

      let where: object = { ...baseWhere };
      if (d.kind === "pageview") {
        where = { ...baseWhere, ...(dateRange.gte ? { pageViewAt: dateRange } : {}) };
      } else if (d.kind === "lead") {
        where = { ...baseWhere, leadAt: { not: null, ...(dateRange.gte ? dateRange : {}) } };
      } else if (d.kind === "registered") {
        where = { ...baseWhere, registeredAt: { not: null, ...(dateRange.gte ? dateRange : {}) } };
      } else if (d.kind === "deposited") {
        where = { ...baseWhere, depositedAt: { not: null, ...(dateRange.gte ? dateRange : {}) } };
        const sum = await prisma.trackingSession.aggregate({
          where,
          _sum: { depositValue: true },
        });
        sumDeposit[n.id] = sum._sum.depositValue ?? 0;
      } else if (d.kind === "custom") {
        // Custom = count any session that has at least one ConversionEvent of type Custom
        const sessions = await prisma.conversionEvent.groupBy({
          by: ["sessionId"],
          where: {
            botId: funnel.botId,
            type: "Custom",
            ...(dateRange.gte ? { createdAt: dateRange } : {}),
          },
        });
        counts[n.id] = sessions.length;
        return;
      }

      counts[n.id] = await prisma.trackingSession.count({ where });
    }),
  );

  return NextResponse.json({ counts, sumDeposit, ts: Date.now() });
}
