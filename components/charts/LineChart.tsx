/**
 * Minimal SVG line chart. No external dependency — keeps the bundle small.
 * Takes a series of {x: label, y: number} and renders a sparkline-style
 * line + area + dots + axis labels.
 */
interface Point { x: string; y: number }

interface Props {
  data: Point[];
  height?: number;
  color?: string;
  label?: string;
}

export function LineChart({ data, height = 180, color = "#f97316", label }: Props) {
  const W = 800; // viewport width — scales with the SVG container
  const H = height;
  const PAD = { left: 32, right: 16, top: 16, bottom: 28 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxY = Math.max(1, ...data.map((d) => d.y));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const pts = data.map((d, i) => {
    const x = PAD.left + i * stepX;
    const y = PAD.top + innerH - (d.y / maxY) * innerH;
    return { x, y, label: d.x, value: d.y };
  });

  const linePath = pts.length
    ? pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
    : "";
  const areaPath = pts.length
    ? `${linePath} L${pts[pts.length - 1].x},${PAD.top + innerH} L${pts[0].x},${PAD.top + innerH} Z`
    : "";

  // y-axis ticks (4 marks)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(maxY * p));

  return (
    <div className="w-full" style={{ overflow: "hidden" }}>
      {label && <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-faint)" }}>{label}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
        <defs>
          <linearGradient id={`lc-grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* horizontal grid lines */}
        {ticks.map((t, i) => {
          const y = PAD.top + innerH - (t / Math.max(1, maxY)) * innerH;
          return (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.35)">{t}</text>
            </g>
          );
        })}

        {/* area */}
        {areaPath && <path d={areaPath} fill={`url(#lc-grad-${color.replace("#", "")})`} />}
        {/* line */}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {/* dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill={color}>
            <title>{`${p.label}: ${p.value}`}</title>
          </circle>
        ))}

        {/* x-axis labels — show every Nth to avoid crowding */}
        {pts.map((p, i) => {
          const every = Math.max(1, Math.ceil(pts.length / 8));
          if (i % every !== 0 && i !== pts.length - 1) return null;
          return (
            <text key={i} x={p.x} y={H - 8} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.45)">
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
