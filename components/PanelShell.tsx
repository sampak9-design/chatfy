"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";

/**
 * Responsive wrapper for the panel pages.
 * - Desktop (md+): sidebar fixed on the left, main fills the rest.
 * - Mobile: sticky top bar with hamburger; sidebar slides in as overlay.
 */
export function PanelShell({ children, adminEmail }: { children: React.ReactNode; adminEmail?: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile top bar */}
      <header
        className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", height: 56 }}
      >
        <button onClick={() => setOpen(true)} className="p-2 -ml-2" aria-label="Abrir menu">
          <Menu className="w-5 h-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="VSChat" style={{ height: 32 }} className="object-contain" />
        <div style={{ width: 24 }} />
      </header>

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

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
