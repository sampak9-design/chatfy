import type { Edge, Node } from "reactflow";

export type NodeKind = "pageview" | "lead" | "registered" | "deposited" | "custom";

export interface FunnelNodeData {
  kind: NodeKind;
  label: string;
  landingId?: string;
  utmSource?: string;
  utmCampaign?: string;
  // Live values (populated client-side via /api/funnel-stats):
  count?: number;
  depositSum?: number;
  // Conversion rate vs. parent (computed client-side from edges):
  rate?: number;
}

export type FunnelNode = Node<FunnelNodeData>;
export type FunnelEdge = Edge;

export interface FunnelGraph {
  nodes: FunnelNode[];
  edges: FunnelEdge[];
}
