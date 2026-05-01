"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import { Eye, UserPlus, ClipboardCheck, DollarSign, Sparkles } from "lucide-react";
import type { FunnelNodeData, NodeKind } from "./types";

const META: Record<NodeKind, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  pageview:   { icon: Eye,            color: "#3b82f6", label: "Visita" },
  lead:       { icon: UserPlus,       color: "#f97316", label: "Lead (Telegram)" },
  registered: { icon: ClipboardCheck, color: "#a855f7", label: "Cadastrado" },
  deposited:  { icon: DollarSign,     color: "#22c55e", label: "Depositou" },
  custom:     { icon: Sparkles,       color: "#94a3b8", label: "Custom" },
};

export function FunnelStepNode({ id, data, selected }: NodeProps<FunnelNodeData>) {
  const meta = META[data.kind];
  const Icon = meta.icon;
  const count = data.count ?? 0;
  const rate = data.rate;

  return (
    <div
      style={{
        width: 200,
        background: "var(--surface-2)",
        border: `2px solid ${selected ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Top} id="in" />

      <div
        className="px-3 py-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide"
        style={{ background: meta.color + "22", color: meta.color, borderBottom: "1px solid var(--border)" }}
      >
        <Icon className="w-3.5 h-3.5" />
        {meta.label}
      </div>

      <div className="px-4 py-4">
        <div className="text-[11px] truncate mb-1" style={{ color: "var(--text-faint)" }}>{data.label}</div>
        <div className="text-3xl font-bold tabular-nums" style={{ color: "var(--text)" }}>
          {count.toLocaleString("pt-BR")}
        </div>
        {data.kind === "deposited" && (data.depositSum ?? 0) > 0 && (
          <div className="text-xs mt-1" style={{ color: "var(--success)" }}>
            R$ {(data.depositSum ?? 0).toFixed(2)}
          </div>
        )}
        {rate !== undefined && (
          <div className="text-[11px] mt-2 flex items-center gap-1" style={{ color: rate >= 50 ? "var(--success)" : rate >= 20 ? "var(--warning)" : "var(--danger)" }}>
            ↳ {rate.toFixed(1)}% conversão
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="out" />
    </div>
  );
}
