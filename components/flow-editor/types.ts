import type { Edge, Node } from "reactflow";

export type StepKind =
  | "start"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "delay"
  | "buttons";

export interface StepButton {
  id: string;
  label: string;
  kind: "url" | "callback" | "support";
  value?: string;       // url for url/support
  nextStepId?: string;  // resolved at save time for callback buttons
}

export interface FlowNodeData {
  type: StepKind;
  label?: string;
  content?: string;
  mediaUrl?: string;
  delaySeconds?: number;
  buttons?: StepButton[];
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}
