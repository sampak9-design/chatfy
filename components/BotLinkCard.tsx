import QRCode from "qrcode";
import { Send } from "lucide-react";
import { CopyFlowLink } from "@/components/CopyFlowLink";

/**
 * Card do bot — ocupa o lugar do "cartão" da referência, mas com o que
 * realmente se usa no dia a dia: QR Code + link público do bot pra colar
 * em anúncio, bio ou landing.
 */
export async function BotLinkCard({
  name,
  username,
  paused,
}: {
  name: string;
  username?: string | null;
  paused?: boolean;
}) {
  const link = username ? `https://t.me/${username}` : null;

  let qrSvg: string | null = null;
  if (link) {
    qrSvg = await QRCode.toString(link, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0a0b", light: "#ffffff" },
    }).catch(() => null);
  }

  return (
    <div
      className="relative overflow-hidden p-5"
      style={{
        borderRadius: 18,
        background: "linear-gradient(135deg, #1c1c20 0%, #121214 55%, #0d0d0f 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* curvas decorativas */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} preserveAspectRatio="none" viewBox="0 0 400 240">
        <path d="M260 -20 C 340 40, 360 150, 310 260" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
        <path d="M300 -20 C 390 50, 410 160, 350 270" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1.5" />
      </svg>

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4" style={{ color: "var(--primary)" }} />
          <span className="text-sm font-semibold tracking-[0.18em]">CHATFY</span>
        </div>
        <span className={`pill ${paused ? "pill-warning" : "pill-success"}`}>{paused ? "pausado" : "ativo"}</span>
      </div>

      <div className="relative mt-4 flex items-center gap-4">
        <div
          className="shrink-0 bg-white p-2"
          style={{ width: 92, height: 92, borderRadius: 12 }}
          aria-label="QR Code do bot"
        >
          {qrSvg ? (
            <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-center" style={{ color: "#71717a" }}>
              sem username
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold truncate">{name}</div>
          <div className="font-mono text-sm truncate" style={{ color: "var(--primary)" }}>
            {username ? `@${username}` : "—"}
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] mt-1" style={{ color: "var(--text-faint)" }}>
            Telegram
          </div>
        </div>
      </div>

      <div className="relative mt-4">
        {link ? (
          <CopyFlowLink url={link} />
        ) : (
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            Defina o username do bot no @BotFather pra gerar o link público.
          </p>
        )}
      </div>
    </div>
  );
}
