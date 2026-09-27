/**
 * Barra segmentada + legenda, no estilo "Smart Spending Limits" do PLATINUM.
 * Usada no painel pra mostrar a divisão das origens dos leads.
 */
export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function SegmentedBar({ segments }: { segments: Segment[] }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {segments.map((s, i) => (
          <div
            key={i}
            className="h-2 rounded-full"
            style={{
              background: s.color,
              flexGrow: Math.max(0.15, s.value / total),
              flexBasis: 0,
              minWidth: 8,
            }}
            title={`${s.label}: ${Math.round((s.value / total) * 100)}%`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="truncate" style={{ color: "var(--text-dim)" }}>
              {s.label} ({Math.round((s.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
