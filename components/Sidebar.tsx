"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Workflow,
  Megaphone,
  Settings,
  LogOut,
  MessageSquare,
  Filter,
  ChevronDown,
  ChevronRight,
  Send,
  Activity,
  Layers,
  CalendarClock,
} from "lucide-react";

type IconComp = typeof LayoutDashboard;

interface Item {
  href: string;
  label: string;
  icon: IconComp;
  badge?: string;
  disabled?: boolean;
}

interface Group {
  key: string;
  label: string;
  icon: IconComp;
  children: Item[];
}

const flatItems: Item[] = [
  { href: "/", label: "Painel de Controle", icon: LayoutDashboard },
  { href: "/inbox", label: "Conversas", icon: MessageSquare },
  { href: "/leads", label: "Audiência", icon: Users },
  { href: "/flows", label: "Fluxos", icon: Workflow },
  { href: "/broadcasts", label: "Disparos", icon: Megaphone },
  { href: "/sequences", label: "Sequência de Disparos", icon: CalendarClock },
];

const groups: Group[] = [
  {
    key: "canais",
    label: "Canais",
    icon: Layers,
    children: [
      { href: "/channels/telegram", label: "Telegram", icon: Send },
      { href: "/channels/whatsapp", label: "WhatsApp", icon: MessageSquare, badge: "em breve", disabled: true },
      { href: "/channels/instagram", label: "Instagram", icon: MessageSquare, badge: "em breve", disabled: true },
    ],
  },
  {
    key: "funil",
    label: "Funil",
    icon: Filter,
    children: [
      { href: "/funnels", label: "Landings", icon: Filter },
      { href: "/track", label: "Análise visual", icon: Activity },
    ],
  },
];

const settingsItem: Item = { href: "/settings", label: "Configurações", icon: Settings };

export function Sidebar({ adminEmail, onNavigate }: { adminEmail?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  // Auto-open the group containing the current route
  const initialOpen = new Set<string>();
  for (const g of groups) {
    if (g.children.some((c) => pathname.startsWith(c.href))) initialOpen.add(g.key);
  }
  const [open, setOpen] = useState<Set<string>>(initialOpen);

  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const renderItem = (it: Item, inGroup = false) => {
    const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
    const Icon = it.icon;
    const dim = it.disabled;
    const content = (
      <>
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">{it.label}</span>
        {it.badge && (
          <span className="ml-auto text-[9px] uppercase tracking-wide pill pill-muted" style={{ padding: "1px 6px" }}>
            {it.badge}
          </span>
        )}
      </>
    );
    const baseStyle: React.CSSProperties = {
      background: active ? "var(--surface-3)" : "transparent",
      color: dim ? "var(--text-faint)" : active ? "var(--text)" : "var(--text-dim)",
      borderLeft: active ? "3px solid var(--primary)" : "3px solid transparent",
      paddingLeft: inGroup ? (active ? 33 : 36) : active ? 9 : 12,
      cursor: dim ? "not-allowed" : "pointer",
      opacity: dim ? 0.55 : 1,
    };
    if (dim) {
      return (
        <div key={it.href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm" style={baseStyle}>
          {content}
        </div>
      );
    }
    return (
      <Link
        key={it.href}
        href={it.href}
        onClick={onNavigate}
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
        style={baseStyle}
      >
        {content}
      </Link>
    );
  };

  return (
    <aside
      className="w-64 shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center justify-center overflow-hidden px-3 py-2"
        style={{ borderBottom: "1px solid var(--border)", height: 100 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="VSChat"
          className="object-contain"
          style={{ width: "100%", height: "auto", transform: "scale(1.45)", transformOrigin: "center" }}
        />
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {flatItems.map((it) => renderItem(it))}

        {groups.map((g) => {
          const isOpen = open.has(g.key);
          const groupActive = g.children.some((c) => pathname.startsWith(c.href));
          const GIcon = g.icon;
          return (
            <div key={g.key} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggle(g.key)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  color: groupActive ? "var(--text)" : "var(--text-dim)",
                  borderLeft: "3px solid transparent",
                  paddingLeft: 12,
                }}
              >
                <GIcon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left truncate">{g.label}</span>
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
              </button>
              {isOpen && g.children.map((c) => renderItem(c, true))}
            </div>
          );
        })}

        <div className="pt-2">{renderItem(settingsItem)}</div>
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
