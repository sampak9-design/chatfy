/**
 * Bar chart no estilo PLATINUM: barras escuras arredondadas, a maior destacada
 * em laranja com gradiente, ponto no topo e balão com o valor.
 * SVG puro — sem dependência externa.
 */
interface Point { x: string; y: number }

interface Props {
  data: Point[];
  height?: number;
  showXLabels?: boolean;
}

export function BarChart({ data, height = 280, showXLabels = true }: Props) {
  const W = 900;
  const H = height;
  const PAD = { left: 44, right: 14, top: 52, bottom: showXLabels ? 28 : 14 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const rawMax = Math.max(1, ...data.map((d) => d.y));
  // Escala "redonda" pro eixo (5, 10, 15...)
  const step = Math.max(1, Math.ceil(rawMax / 4));
  const maxY = step * 4;

  const n = Math.max(1, data.length);
  const slot = innerW / n;
  const bw = Math.max(6, Math.min(46, slot * 0.52));
  const radius = Math.min(bw / 2, 10);

  // Índice da maior barra (a destacada)
  let hi = 0;
  for (let i = 1; i < data.length; i++) if (data[i].y > data[hi].y) hi = i;

  const barPath = (x: number, y: number, w: number, h: number, r: number) => {
    const rr = Math.min(r, h);
    return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
  };

  const bars = data.map((d, i) => {
    const x = PAD.left + slot * i + (slot - bw) / 2;
    const h = d.y > 0 ? Math.max(8, (d.y / maxY) * innerH) : 4;
    const y = PAD.top + innerH - h;
    return { x, y, h, value: d.y, label: d.x, zero: d.y === 0 };
  });

  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  const top = bars[hi];
  const tipText = String(data[hi]?.y ?? 0);
  const tipW = Math.max(52, tipText.length * 11 + 26);
  const tipH = 30;
  const tipX = Math.min(Math.max(top ? top.x + bw / 2 - tipW / 2 : 0, PAD.left), W - PAD.right - tipW);
  const tipY = 6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }}>
      <defs>
        <linearGradient id="bc-hi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fdba74" />
          <stop offset="35%" stopColor="#fb8a3c" />
          <stop offset="100%" stopColor="#ea6a0a" />
        </linearGradient>
        <filter id="bc-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="10" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* grade + eixo Y */}
      {ticks.map((t, i) => {
        const y = PAD.top + innerH - (t / maxY) * innerH;
        return (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
            <text x={PAD.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="rgba(255,255,255,0.32)">
              {t}
            </text>
          </g>
        );
      })}

      {/* barras */}
      {bars.map((b, i) => (
        <g key={i}>
          {i === hi && b.value > 0 ? (
            <>
              <path d={barPath(b.x, b.y, bw, b.h, radius)} fill="url(#bc-hi)" filter="url(#bc-glow)" opacity="0.55" />
              <path d={barPath(b.x, b.y, bw, b.h, radius)} fill="url(#bc-hi)" />
              <circle cx={b.x + bw / 2} cy={b.y + 6} r="4" fill="#fff" />
              <line x1={b.x + bw / 2} x2={b.x + bw / 2} y1={tipY + tipH} y2={b.y + 4} stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
            </>
          ) : (
            <path
              d={barPath(b.x, b.y, bw, b.h, radius)}
              fill={b.zero ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.09)"}
            />
          )}
          <title>{`${b.label}: ${b.value}`}</title>
        </g>
      ))}

      {/* balão do valor destacado */}
      {top && data[hi]?.y > 0 && (
        <g>
          <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="9" fill="#000" stroke="rgba(255,255,255,0.14)" />
          <text x={tipX + tipW / 2} y={tipY + 20} textAnchor="middle" fontSize="14" fontWeight="600" fill="#fff">
            {tipText}
          </text>
        </g>
      )}

      {/* rótulos do eixo X */}
      {showXLabels &&
        bars.map((b, i) => {
          const every = Math.max(1, Math.ceil(bars.length / 10));
          if (i % every !== 0 && i !== bars.length - 1) return null;
          return (
            <text key={i} x={b.x + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)">
              {b.label}
            </text>
          );
        })}
    </svg>
  );
}
