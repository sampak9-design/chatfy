"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Workflow, Megaphone, Settings, LogOut, MessageSquare, Filter, Activity } from "lucide-react";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Conversas", icon: MessageSquare },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/flows", label: "Fluxos", icon: Workflow },
  { href: "/broadcasts", label: "Disparos", icon: Megaphone },
  { href: "/funnels", label: "Funil", icon: Filter },
  { href: "/track", label: "Track", icon: Activity },
  { href: "/bot", label: "Bot", icon: Settings },
];

export function Sidebar({ adminEmail }: { adminEmail?: string }) {
  const pathname = usePathname();
  return (
    <aside
      className="w-60 shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}
    >
      <div className="p-5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="VSChat" className="w-10 h-10 object-contain" />
        <div>
          <div className="font-semibold leading-tight">VSChat</div>
          <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>Telegram bot manager</div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map((it) => {
          const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                background: active ? "var(--surface-3)" : "transparent",
                color: active ? "var(--text)" : "var(--text-dim)",
                borderLeft: active ? "3px solid var(--primary)" : "3px solid transparent",
                paddingLeft: active ? "9px" : "12px",
              }}
            >
              <Icon className="w-4 h-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/logout" method="post" className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="px-3 py-2 mb-2">
          <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>Logado como</div>
          <div className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{adminEmail || "—"}</div>
        </div>
        <button
          type="submit"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm w-full transition-colors"
          style={{ color: "var(--text-dim)" }}
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </form>
    </aside>
  );
}
