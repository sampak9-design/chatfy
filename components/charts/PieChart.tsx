/**
 * Minimal donut chart in SVG. Pass [{label, value}, ...] and it auto-colors
 * with a stable palette. Legend rendered next to it.
 */
interface Slice { label: string; value: number }

const PALETTE = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#eab308", "#06b6d4", "#94a3b8"];

interface Props {
  data: Slice[];
  size?: number;
  label?: string;
}

export function PieChart({ data, size = 160, label }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const R = size / 2;
  const Ri = R * 0.6; // inner radius for donut
  let cumulative = 0;

  return (
    <div className="w-full">
      {label && <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-faint)" }}>{label}</div>}
      <div className="flex items-center gap-5 flex-wrap">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {total === 0 ? (
            <circle cx={R} cy={R} r={R - 2} fill="rgba(255,255,255,0.04)" />
          ) : data.map((d, i) => {
            if (d.value === 0) return null;
            const startAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
            cumulative += d.value;
            const endAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
            const x1 = R + R * Math.cos(startAngle);
            const y1 = R + R * Math.sin(startAngle);
            const x2 = R + R * Math.cos(endAngle);
            const y2 = R + R * Math.sin(endAngle);
            const xi1 = R + Ri * Math.cos(endAngle);
            const yi1 = R + Ri * Math.sin(endAngle);
            const xi2 = R + Ri * Math.cos(startAngle);
            const yi2 = R + Ri * Math.sin(startAngle);
            const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
            const path = [
              `M${x1},${y1}`,
              `A${R},${R} 0 ${largeArc} 1 ${x2},${y2}`,
              `L${xi1},${yi1}`,
              `A${Ri},${Ri} 0 ${largeArc} 0 ${xi2},${yi2}`,
              "Z",
            ].join(" ");
            return <path key={i} d={path} fill={PALETTE[i % PALETTE.length]}><title>{`${d.label}: ${d.value}`}</title></path>;
          })}
          <text x={R} y={R - 2} textAnchor="middle" fontSize="18" fontWeight="600" fill="var(--text)">{total}</text>
          <text x={R} y={R + 14} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.45)">total</text>
        </svg>

        <ul className="text-xs space-y-1.5 flex-1 min-w-0">
          {data.length === 0 ? (
            <li style={{ color: "var(--text-faint)" }}>—</li>
          ) : data.map((d, i) => {
            const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0";
            return (
              <li key={i} className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, background: PALETTE[i % PALETTE.length], borderRadius: 2, flexShrink: 0 }} />
                <span className="truncate" style={{ color: "var(--text-dim)" }}>{d.label}</span>
                <span className="ml-auto tabular-nums" style={{ color: "var(--text-faint)" }}>{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
