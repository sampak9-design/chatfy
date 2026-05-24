"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BotSwitcher } from "./BotSwitcher";

interface BotOpt { id: string; name: string; username: string | null; paused: boolean }

/**
 * Responsive panel shell.
 * - Desktop: sidebar left, top bar (height 56px) with BotSwitcher right
 * - Mobile: sticky top bar with hamburger + logo; sidebar slides in as overlay
 */
export function PanelShell({
  children,
  adminEmail,
  bots,
  activeBotId,
}: {
  children: React.ReactNode;
  adminEmail?: string;
  bots: BotOpt[];
  activeBotId?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar adminEmail={adminEmail} />
      </div>

      {/* Mobile sidebar overlay */}
      {open && (
        <>
          <div className="md:hidden fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.65)" }} onClick={close} />
          <div className="md:hidden fixed top-0 left-0 bottom-0 z-50 flex">
            <Sidebar adminEmail={adminEmail} onNavigate={close} />
            <button
              onClick={close}
              className="self-start text-white p-3"
              aria-label="Fechar menu"
              style={{ background: "transparent" }}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar — mobile shows hamburger + logo; desktop shows BotSwitcher right */}
        <header
          className="sticky top-0 z-30 flex items-center px-3 md:px-6"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", height: 56 }}
        >
          <button
            onClick={() => setOpen(true)}
            className="md:hidden p-2 -ml-2"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="VSChat" style={{ height: 32 }} className="object-contain md:hidden mx-auto" />

          {/* Desktop spacer + BotSwitcher right */}
          <div className="hidden md:flex flex-1 items-center justify-end gap-3">
            <BotSwitcher bots={bots} activeId={activeBotId} />
          </div>
          {/* Mobile: empty spacer to balance the hamburger */}
          <div className="md:hidden" style={{ width: 24 }} />
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
