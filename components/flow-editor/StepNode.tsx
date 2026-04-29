"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import { MessageSquare, Image as ImageIcon, Video, Music, FileText, Clock, MousePointerClick, Play, Trash2 } from "lucide-react";
import type { FlowNodeData, StepKind } from "./types";

const META: Record<StepKind, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  start: { icon: Play, color: "#22c55e", label: "Início" },
  text: { icon: MessageSquare, color: "#3b82f6", label: "Texto" },
  image: { icon: ImageIcon, color: "#a855f7", label: "Imagem" },
  video: { icon: Video, color: "#ec4899", label: "Vídeo" },
  audio: { icon: Music, color: "#f59e0b", label: "Áudio" },
  document: { icon: FileText, color: "#06b6d4", label: "Documento" },
  delay: { icon: Clock, color: "#94a3b8", label: "Delay" },
  buttons: { icon: MousePointerClick, color: "#f97316", label: "Botões" },
};

export function StepNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const meta = META[data.type];
  const Icon = meta.icon;

  const preview = data.type === "delay"
    ? `${data.delaySeconds ?? 0}s`
    : data.type === "buttons"
    ? `${data.buttons?.length ?? 0} botão(ões)`
    : data.content
    ? data.content.length > 60 ? data.content.slice(0, 60) + "…" : data.content
    : "—";

  return (
    <div
      style={{
        width: 240,
        background: "var(--surface-2)",
        border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {data.type !== "start" && <Handle type="target" position={Position.Top} id="in" />}

      <div
        className="px-3 py-2 flex items-center gap-2 text-xs font-medium"
        style={{ background: meta.color + "22", color: meta.color, borderBottom: "1px solid var(--border)" }}
      >
        <Icon className="w-3.5 h-3.5" />
        {meta.label}
        <span className="ml-auto text-[10px] opacity-60">#{id.slice(-4)}</span>
      </div>

      <div className="px-3 py-3 text-xs" style={{ color: "var(--text-dim)" }}>
        {preview}
      </div>

      {data.mediaUrl && (
        <div className="px-3 pb-2 text-[10px] truncate" style={{ color: "var(--text-faint)" }}>
          {data.mediaUrl}
        </div>
      )}

      {data.buttons && data.buttons.length > 0 && (
        <div className="border-t" style={{ borderColor: "var(--border)" }}>
          {data.buttons.map((b, i) => (
            <div key={b.id} className="relative px-3 py-2 text-xs flex items-center justify-between" style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
              <span className="truncate">{b.label}</span>
              <span className="text-[10px] uppercase tracking-wide opacity-60">{b.kind}</span>
              {b.kind === "callback" && (
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`btn:${b.id}`}
                  style={{ top: "50%", right: -5, background: "var(--primary)" }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bottom "out" handle for chaining without buttons. Hidden when buttons exist
          since the engine waits for a click and ignores the implicit next. */}
      {data.type !== "start" && !(data.buttons && data.buttons.length > 0) && (
        <Handle type="source" position={Position.Bottom} id="out" />
      )}
    </div>
  );
}
