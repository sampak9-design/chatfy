"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Send, Plus } from "lucide-react";
import Link from "next/link";

interface BotOpt { id: string; name: string; username: string | null; paused: boolean }

interface Props {
  bots: BotOpt[];
  activeId?: string;
}

export function BotSwitcher({ bots, activeId }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = bots.find((b) => b.id === activeId) || bots[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!active) {
    return (
      <Link href="/channels/telegram/new" className="btn btn-ghost text-xs" style={{ padding: "6px 10px" }}>
        <Plus className="w-3.5 h-3.5" /> Conectar bot
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "rgba(34,158,217,0.18)", color: "#229ed9" }}>
          <Send className="w-3 h-3" />
        </div>
        <span className="font-medium truncate max-w-[140px]" style={{ color: "var(--text)" }}>{active.name}</span>
        {active.paused && <span className="pill pill-warning text-[9px]" style={{ padding: "1px 6px" }}>pausado</span>}
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 right-0 min-w-[240px] rounded-lg overflow-hidden z-50"
          style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
        >
          <div className="text-[10px] uppercase tracking-wide px-3 pt-2 pb-1" style={{ color: "var(--text-faint)" }}>Selecionar bot</div>
          {bots.map((b) => (
            <form key={b.id} method="post" action="/api/active-bot">
              <input type="hidden" name="botId" value={b.id} />
              <button
                type="submit"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                style={{
                  background: b.id === active.id ? "var(--surface-3)" : "transparent",
                  color: "var(--text)",
                }}
              >
                <Send className="w-3.5 h-3.5" style={{ color: "#229ed9" }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{b.name}</div>
                  <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>{b.username ? `@${b.username}` : "—"}</div>
                </div>
                {b.paused && <span className="pill pill-warning text-[9px]" style={{ padding: "1px 6px" }}>pausado</span>}
              </button>
            </form>
          ))}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            <Link
              href="/channels/telegram/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm"
              style={{ color: "var(--primary)" }}
            >
              <Plus className="w-3.5 h-3.5" /> Conectar novo bot
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
