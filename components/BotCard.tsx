import { Send, Wifi } from "lucide-react";

/**
 * "Cartão" do bot — mesmo tratamento visual do cartão de crédito do PLATINUM,
 * mas exibindo os dados do bot ativo.
 */
export function BotCard({
  name,
  username,
  since,
  paused,
}: {
  name: string;
  username?: string | null;
  since?: Date | null;
  paused?: boolean;
}) {
  const sinceLabel = since
    ? `${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getFullYear()).slice(2)}`
    : "—";

  return (
    <div
      className="relative overflow-hidden p-5"
      style={{
        borderRadius: 18,
        background: "linear-gradient(135deg, #1c1c20 0%, #121214 55%, #0d0d0f 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        minHeight: 200,
      }}
    >
      {/* curvas decorativas */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} preserveAspectRatio="none" viewBox="0 0 400 220">
        <path d="M250 -20 C 330 40, 350 140, 300 240" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
        <path d="M290 -20 C 380 50, 400 150, 340 250" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1.5" />
      </svg>

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4" style={{ color: "var(--primary)" }} />
          <span className="text-sm font-semibold tracking-[0.18em]">CHATFY</span>
        </div>
        <Wifi className="w-4 h-4 rotate-90" style={{ color: "var(--text-faint)" }} />
      </div>

      {/* chip */}
      <div
        className="relative mt-5"
        style={{
          width: 42,
          height: 30,
          borderRadius: 7,
          background: "linear-gradient(135deg, #fde68a 0%, #d4a017 50%, #b8860b 100%)",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div style={{ width: 24, height: 16, border: "1px solid rgba(0,0,0,0.35)", borderRadius: 3 }} />
        </div>
      </div>

      <div className="relative mt-5 font-mono text-xl tracking-[0.12em] truncate">
        {username ? `@${username}` : "sem username"}
      </div>

      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            ▸ Ativo desde
          </div>
          <div className="text-xs font-mono">{sinceLabel}</div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-sm font-medium truncate">{name}</div>
          <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: paused ? "var(--warning)" : "var(--text-dim)" }}>
            {paused ? "Pausado" : "Telegram"}
          </div>
        </div>
      </div>
    </div>
  );
}
