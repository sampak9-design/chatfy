"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
import { ArrowLeft, Save, Star, MessageSquare, Image as ImageIcon, Video, Music, FileText, Clock, MousePointerClick, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { StepNode } from "./StepNode";
import type { FlowGraph, FlowNode, FlowNodeData, StepButton, StepKind } from "./types";

const nodeTypes = { step: StepNode };

const PALETTE: { kind: StepKind; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { kind: "text", label: "Texto", icon: MessageSquare, color: "#3b82f6" },
  { kind: "image", label: "Imagem", icon: ImageIcon, color: "#a855f7" },
  { kind: "video", label: "Vídeo", icon: Video, color: "#ec4899" },
  { kind: "audio", label: "Áudio", icon: Music, color: "#f59e0b" },
  { kind: "document", label: "Documento", icon: FileText, color: "#06b6d4" },
  { kind: "buttons", label: "Botões", icon: MousePointerClick, color: "#f97316" },
  { kind: "delay", label: "Delay", icon: Clock, color: "#94a3b8" },
];

interface Props {
  flowId: string;
  flowName: string;
  initialGraph: FlowGraph;
  saveAction: (formData: FormData) => Promise<void>;
  setAsWelcomeAction: (formData: FormData) => Promise<void>;
  isWelcome: boolean;
}

function defaultDataFor(kind: StepKind): FlowNodeData {
  switch (kind) {
    case "delay": return { type: kind, delaySeconds: 5 };
    case "buttons": return { type: kind, content: "Escolha uma opção:", buttons: [] };
    default: return { type: kind, content: kind === "text" ? "Olá!" : "" };
  }
}

function ensureStartNode(graph: FlowGraph): FlowGraph {
  if (graph.nodes.some((n) => (n.data as FlowNodeData).type === "start")) return graph;
  return {
    ...graph,
    nodes: [
      {
        id: "start",
        type: "step",
        position: { x: 50, y: 50 },
        data: { type: "start", label: "Início (/start)" },
        deletable: false,
      } as FlowNode,
      ...graph.nodes,
    ],
  };
}

function FlowEditorInner(props: Props) {
  const initial = useMemo(() => ensureStartNode(props.initialGraph), [props.initialGraph]);
  const [nodes, setNodes] = useState<Node[]>(initial.nodes.map((n) => ({ ...n, type: "step" })));
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState(props.flowName);
  const [saving, setSaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [rfi, setRfi] = useState<ReactFlowInstance | null>(null);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((conn: Connection) => setEdges((eds) => addEdge({ ...conn, type: "default" }, eds)), []);

  const addNode = useCallback((kind: StepKind, position?: { x: number; y: number }) => {
    const id = nanoid(8);
    const node: Node<FlowNodeData> = {
      id,
      type: "step",
      position: position ?? { x: 350, y: 100 + nodes.length * 60 },
      data: defaultDataFor(kind),
    };
    setNodes((nds) => [...nds, node]);
    setSelectedId(id);
  }, [nodes.length]);

  const onDragStart = (e: React.DragEvent, kind: StepKind) => {
    e.dataTransfer.setData("application/chatfy-node", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/chatfy-node") as StepKind;
    if (!kind || !rfi || !wrapperRef.current) return;
    const bounds = wrapperRef.current.getBoundingClientRect();
    const position = rfi.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    addNode(kind, position);
  }, [rfi, addNode]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const selected = nodes.find((n) => n.id === selectedId) as FlowNode | undefined;

  const updateSelected = (patch: Partial<FlowNodeData>) => {
    if (!selectedId) return;
    setNodes((nds) => nds.map((n) => n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n));
  };

  const deleteSelected = () => {
    if (!selectedId || selectedId === "start") return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  };

  const onSave = async () => {
    setSaving(true);
    const fd = new FormData();
    fd.set("id", props.flowId);
    fd.set("name", name);
    fd.set("graph", JSON.stringify({ nodes, edges }));
    await props.saveAction(fd);
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/flows" className="btn btn-ghost" style={{ padding: "6px 10px" }}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" style={{ width: 280 }} />
          {props.isWelcome && <span className="pill pill-info">Boas-vindas</span>}
        </div>
        <div className="flex items-center gap-2">
          {!props.isWelcome && (
            <form action={props.setAsWelcomeAction}>
              <input type="hidden" name="id" value={props.flowId} />
              <button className="btn btn-ghost"><Star className="w-4 h-4" /> Definir como boas-vindas</button>
            </form>
          )}
          <button onClick={onSave} disabled={saving} className="btn btn-primary">
            <Save className="w-4 h-4" /> {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Palette */}
        <div className="w-56 shrink-0 p-3 space-y-2" style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
          <div className="text-[11px] uppercase tracking-wider px-2 mb-1" style={{ color: "var(--text-faint)" }}>Adicionar etapa</div>
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
            Arraste para o canvas ou clique para adicionar.
          </p>
        </div>

        {/* Canvas */}
        <div ref={wrapperRef} className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
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

        {/* Properties panel */}
        <div className="w-80 shrink-0 overflow-y-auto" style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)" }}>
          {!selected ? (
            <div className="p-5 text-sm" style={{ color: "var(--text-faint)" }}>
              Selecione uma etapa para editar suas propriedades.
            </div>
          ) : selected.id === "start" ? (
            <div className="p-5 text-sm" style={{ color: "var(--text-faint)" }}>
              Etapa <span className="text-white font-medium">Início</span>. Conecte-a à primeira mensagem que será enviada quando o usuário der /start.
            </div>
          ) : (
            <PropertiesPanel
              node={selected}
              onChange={updateSelected}
              onDelete={deleteSelected}
              allNodes={nodes as FlowNode[]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PropertiesPanel({
  node,
  onChange,
  onDelete,
  allNodes,
}: {
  node: FlowNode;
  onChange: (patch: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  allNodes: FlowNode[];
}) {
  const data = node.data;

  const addButton = () => {
    const newBtn: StepButton = { id: nanoid(8), label: "Novo botão", kind: "callback" };
    onChange({ buttons: [...(data.buttons ?? []), newBtn] });
  };

  const updateButton = (id: string, patch: Partial<StepButton>) => {
    onChange({ buttons: (data.buttons ?? []).map((b) => b.id === id ? { ...b, ...patch } : b) });
  };

  const removeButton = (id: string) => {
    onChange({ buttons: (data.buttons ?? []).filter((b) => b.id !== id) });
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold capitalize">{data.type}</div>
        <button onClick={onDelete} className="btn btn-danger text-xs" style={{ padding: "4px 8px" }}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {data.type === "delay" ? (
        <div>
          <label className="label">Esperar (segundos)</label>
          <input
            type="number"
            min={1}
            value={data.delaySeconds ?? 5}
            onChange={(e) => onChange({ delaySeconds: parseInt(e.target.value || "0") })}
            className="input"
          />
        </div>
      ) : (
        <>
          <div>
            <label className="label">{data.type === "text" ? "Mensagem" : "Legenda"}</label>
            <textarea
              value={data.content || ""}
              onChange={(e) => onChange({ content: e.target.value })}
              rows={5}
              className="input"
              placeholder={data.type === "text" ? "Digite sua mensagem (suporta HTML)…" : "Legenda opcional"}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
              Suporta HTML: <code>&lt;b&gt;, &lt;i&gt;, &lt;a href&gt;</code>
            </p>
          </div>

          {(data.type === "image" || data.type === "video" || data.type === "audio" || data.type === "document") && (
            <div>
              <label className="label">URL do arquivo</label>
              <input
                value={data.mediaUrl || ""}
                onChange={(e) => onChange({ mediaUrl: e.target.value })}
                className="input"
                placeholder={
                  data.type === "video" ? "https://exemplo.com/video.mp4"
                  : data.type === "audio" ? "https://exemplo.com/audio.mp3"
                  : data.type === "document" ? "https://exemplo.com/arquivo.pdf"
                  : "https://exemplo.com/imagem.jpg"
                }
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                {data.type === "video" && "Link DIRETO ao .mp4 (Cloudinary, S3, etc). Telegram precisa baixar o arquivo."}
                {data.type === "audio" && "Link DIRETO ao .mp3, .ogg ou .m4a."}
                {data.type === "document" && "Link DIRETO ao arquivo (.pdf, .zip, etc)."}
                {data.type === "image" && "Link DIRETO ao .jpg/.png/.webp (max 10MB)."}
              </p>
            </div>
          )}
        </>
      )}

      {data.type === "buttons" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label" style={{ marginBottom: 0 }}>Botões</label>
            <button onClick={addButton} className="btn btn-ghost text-xs" style={{ padding: "4px 10px" }}>
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
          </div>
          <div className="space-y-2">
            {(data.buttons ?? []).map((b) => (
              <div key={b.id} className="card p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={b.label}
                    onChange={(e) => updateButton(b.id, { label: e.target.value })}
                    className="input"
                    placeholder="Rótulo do botão"
                  />
                  <button onClick={() => removeButton(b.id)} className="btn btn-danger text-xs" style={{ padding: "0 8px" }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <select
                  value={b.kind}
                  onChange={(e) => updateButton(b.id, { kind: e.target.value as StepButton["kind"] })}
                  className="input"
                >
                  <option value="callback">Continua o fluxo (callback)</option>
                  <option value="url">Abre link externo</option>
                  <option value="support">Chama suporte (link Telegram)</option>
                </select>
                {(b.kind === "url" || b.kind === "support") && (
                  <input
                    value={b.value || ""}
                    onChange={(e) => updateButton(b.id, { value: e.target.value })}
                    className="input"
                    placeholder={b.kind === "support" ? "https://t.me/seu_usuario" : "https://exemplo.com"}
                  />
                )}
                {b.kind === "callback" && (
                  <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                    Conecte a saída deste botão (ponto laranja à direita) à próxima etapa no canvas.
                  </p>
                )}
              </div>
            ))}
            {(data.buttons?.length ?? 0) === 0 && (
              <p className="text-xs" style={{ color: "var(--text-faint)" }}>Nenhum botão. Clique em <b>Adicionar</b>.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FlowEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
