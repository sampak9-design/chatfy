"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { nanoid } from "nanoid";
import { ArrowLeft, Save, Eye, UserPlus, ClipboardCheck, DollarSign, Sparkles, Trash2, Activity } from "lucide-react";
import Link from "next/link";
import { FunnelStepNode } from "./FunnelStepNode";
import type { FunnelGraph, FunnelNode, FunnelNodeData, NodeKind } from "./types";

const nodeTypes = { funnel: FunnelStepNode };

const PALETTE: { kind: NodeKind; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { kind: "pageview",   label: "Visita",     icon: Eye,            color: "#3b82f6" },
  { kind: "lead",       label: "Lead",       icon: UserPlus,       color: "#f97316" },
  { kind: "registered", label: "Cadastro",   icon: ClipboardCheck, color: "#a855f7" },
  { kind: "deposited",  label: "Depósito",   icon: DollarSign,     color: "#22c55e" },
  { kind: "custom",     label: "Custom",     icon: Sparkles,       color: "#94a3b8" },
];

interface Landing { id: string; name: string }

interface Props {
  funnelId: string;
  funnelName: string;
  initialGraph: FunnelGraph;
  landings: Landing[];
  saveAction: (formData: FormData) => Promise<void>;
}

function defaultDataFor(kind: NodeKind): FunnelNodeData {
  const meta = PALETTE.find((p) => p.kind === kind)!;
  return { kind, label: meta.label };
}

interface StatsResponse {
  counts: Record<string, number>;
  sumDeposit: Record<string, number>;
  ts: number;
}

function FunnelEditorInner(props: Props) {
  const initial = props.initialGraph;
  const [nodes, setNodes] = useState<Node[]>(initial.nodes.map((n) => ({ ...n, type: "funnel" })));
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState(props.funnelName);
  const [saving, setSaving] = useState(false);
  const [range, setRange] = useState<"today" | "7d" | "30d" | "all">("7d");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rfi, setRfi] = useState<ReactFlowInstance | null>(null);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((conn: Connection) => setEdges((eds) => addEdge({ ...conn, type: "default", animated: true }, eds)), []);

  // Live polling — refetch stats every 5s
  useEffect(() => {
    let cancel = false;
    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/funnel-stats/${props.funnelId}?range=${range}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as StatsResponse;
        if (!cancel) setStats(data);
      } catch { /* ignore */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => { cancel = true; clearInterval(interval); };
  }, [props.funnelId, range]);

  // Merge stats + compute conversion rate per edge target
  const decoratedNodes = useMemo(() => {
    if (!stats) return nodes;
    // Build parent map: target -> source
    const parent = new Map<string, string>();
    for (const e of edges) parent.set(e.target, e.source);

    return nodes.map((n) => {
      const count = stats.counts[n.id] ?? 0;
      const depositSum = stats.sumDeposit[n.id];
      const parentId = parent.get(n.id);
      const parentCount = parentId ? (stats.counts[parentId] ?? 0) : 0;
      const rate = parentId && parentCount > 0 ? (count / parentCount) * 100 : undefined;

      return {
        ...n,
        data: { ...(n.data as FunnelNodeData), count, depositSum, rate },
      };
    });
  }, [nodes, edges, stats]);

  const addNode = useCallback((kind: NodeKind, position?: { x: number; y: number }) => {
    const id = nanoid(8);
    const node: Node<FunnelNodeData> = {
      id,
      type: "funnel",
      position: position ?? { x: 350, y: 100 + nodes.length * 80 },
      data: defaultDataFor(kind),
    };
    setNodes((nds) => [...nds, node]);
    setSelectedId(id);
  }, [nodes.length]);

  const onDragStart = (e: React.DragEvent, kind: NodeKind) => {
    e.dataTransfer.setData("application/chatfy-funnel-node", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/chatfy-funnel-node") as NodeKind;
    if (!kind || !rfi || !wrapperRef.current) return;
    const bounds = wrapperRef.current.getBoundingClientRect();
    const position = rfi.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    addNode(kind, position);
  }, [rfi, addNode]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const selected = nodes.find((n) => n.id === selectedId) as FunnelNode | undefined;

  const updateSelected = (patch: Partial<FunnelNodeData>) => {
    if (!selectedId) return;
    setNodes((nds) => nds.map((n) => n.id === selectedId ? { ...n, data: { ...(n.data as FunnelNodeData), ...patch } } : n));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const onSave = async () => {
    setSaving(true);
    const fd = new FormData();
    fd.set("id", props.funnelId);
    fd.set("name", name);
    // Strip live values before saving
    const cleanNodes = nodes.map((n) => {
      const d = n.data as FunnelNodeData;
      const { count, depositSum, rate, ...rest } = d;
      void count; void depositSum; void rate;
      return { ...n, data: rest };
    });
    fd.set("graph", JSON.stringify({ nodes: cleanNodes, edges }));
    await props.saveAction(fd);
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/track" className="btn btn-ghost" style={{ padding: "6px 10px" }}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" style={{ width: 280 }} />
          <span className="flex items-center gap-1 text-xs" style={{ color: stats ? "var(--success)" : "var(--text-faint)" }}>
            <Activity className="w-3 h-3" /> {stats ? "ao vivo" : "carregando…"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="input" style={{ width: 130 }}>
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="all">Tudo</option>
          </select>
          <button onClick={onSave} disabled={saving} className="btn btn-primary">
            <Save className="w-4 h-4" /> {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Palette */}
        <div className="w-56 shrink-0 p-3 space-y-2" style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
          <div className="text-[11px] uppercase tracking-wider px-2 mb-1" style={{ color: "var(--text-faint)" }}>Etapas</div>
          {PALETTE.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.kind}
                draggable
                onDragStart={(e) => onDragStart(e, p.kind)}
                onClick={() => addNode(p.kind)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-grab active:cursor-grabbing"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: p.color + "22", color: p.color }}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                {p.label}
              </div>
            );
          })}
          <p className="text-[11px] px-1 pt-2" style={{ color: "var(--text-faint)" }}>
            Arraste pro canvas ou clique pra adicionar.
          </p>
        </div>

        {/* Canvas */}
        <div ref={wrapperRef} className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={decoratedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfi}
            onSelectionChange={(sel) => setSelectedId(sel.nodes[0]?.id ?? null)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#1a2036" />
            <Controls />
            <MiniMap maskColor="rgba(0,0,0,0.5)" nodeColor="#1a2036" />
          </ReactFlow>
        </div>

        {/* Properties */}
        <div className="w-72 shrink-0 overflow-y-auto" style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)" }}>
          {!selected ? (
            <div className="p-5 text-sm" style={{ color: "var(--text-faint)" }}>
              Selecione uma etapa pra editar filtros.
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold capitalize">{selected.data.kind}</div>
                <button onClick={deleteSelected} className="btn btn-danger text-xs" style={{ padding: "4px 8px" }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div>
                <label className="label">Rótulo</label>
                <input
                  value={selected.data.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Filtrar por landing (opcional)</label>
                <select
                  value={selected.data.landingId || ""}
                  onChange={(e) => updateSelected({ landingId: e.target.value || undefined })}
                  className="input"
                >
                  <option value="">— todas —</option>
                  {props.landings.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">UTM source (opcional)</label>
                <input
                  value={selected.data.utmSource || ""}
                  onChange={(e) => updateSelected({ utmSource: e.target.value || undefined })}
                  className="input"
                  placeholder="facebook"
                />
              </div>
              <div>
                <label className="label">UTM campaign (opcional)</label>
                <input
                  value={selected.data.utmCampaign || ""}
                  onChange={(e) => updateSelected({ utmCampaign: e.target.value || undefined })}
                  className="input"
                  placeholder="black_friday"
                />
              </div>
              <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                Conecte etapas no canvas pra ver % de conversão automaticamente.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FunnelEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <FunnelEditorInner {...props} />
    </ReactFlowProvider>
  );
}
