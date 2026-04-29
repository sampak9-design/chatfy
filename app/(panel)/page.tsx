import { prisma } from "@/lib/db";
import Link from "next/link";
import { Users, UserCheck, UserX, UserPlus, Megaphone, Bot } from "lucide-react";

export const dynamic = "force-dynamic";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function Kpi({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: number | string; accent?: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: accent || "rgba(249,115,22,0.12)", color: accent ? "white" : "var(--primary)" }}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const bot = await prisma.bot.findFirst({ orderBy: { createdAt: "asc" } });
  const today = startOfToday();

  const [total, active, blocked, todayCount, recentLeads, recentBroadcasts] = await Promise.all([
    bot ? prisma.lead.count({ where: { botId: bot.id } }) : 0,
    bot ? prisma.lead.count({ where: { botId: bot.id, status: "active" } }) : 0,
    bot ? prisma.lead.count({ where: { botId: bot.id, status: "blocked" } }) : 0,
    bot ? prisma.lead.count({ where: { botId: bot.id, createdAt: { gte: today } } }) : 0,
    bot ? prisma.lead.findMany({ where: { botId: bot.id }, orderBy: { createdAt: "desc" }, take: 8 }) : [],
    bot ? prisma.broadcast.findMany({ where: { botId: bot.id }, orderBy: { createdAt: "desc" }, take: 5 }) : [],
  ]);

  if (!bot) {
    return (
      <div className="p-10">
        <div className="card p-10 text-center max-w-2xl mx-auto">
          <Bot className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--primary)" }} />
          <h2 className="text-xl font-semibold mb-2">Vamos começar</h2>
          <p className="mb-6" style={{ color: "var(--text-dim)" }}>Cadastre seu primeiro bot do Telegram para começar a capturar leads.</p>
          <Link href="/bot" className="btn btn-primary">Cadastrar bot</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Bot: <span className="font-medium" style={{ color: "var(--text)" }}>{bot.name}</span> {bot.username && <>· @{bot.username}</>}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Total de leads" value={total} />
        <Kpi icon={UserCheck} label="Ativos" value={active} />
        <Kpi icon={UserX} label="Bloqueados" value={blocked} />
        <Kpi icon={UserPlus} label="Entradas hoje" value={todayCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Últimos leads</h2>
            <Link href="/leads" className="text-xs" style={{ color: "var(--primary)" }}>Ver todos →</Link>
          </div>
          <div className="space-y-2">
            {recentLeads.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-faint)" }}>Nenhum lead ainda.</p>
            ) : recentLeads.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{l.firstName || l.username || l.telegramId}</div>
                  <div className="text-xs" style={{ color: "var(--text-faint)" }}>{l.username ? `@${l.username}` : `id ${l.telegramId}`}</div>
                </div>
                <span className={`pill ${l.status === "active" ? "pill-success" : l.status === "blocked" ? "pill-danger" : "pill-muted"}`}>{l.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Últimos disparos</h2>
            <Link href="/broadcasts" className="text-xs" style={{ color: "var(--primary)" }}>Ver todos →</Link>
          </div>
          <div className="space-y-2">
            {recentBroadcasts.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-faint)" }}>Nenhum disparo ainda.</p>
            ) : recentBroadcasts.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="min-w-0 flex items-center gap-2">
                  <Megaphone className="w-4 h-4" style={{ color: "var(--text-faint)" }} />
                  <span className="font-medium truncate">{b.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--text-faint)" }}>{b.sentCount}/{b.totalTargets}</span>
                  <span className={`pill ${b.status === "done" ? "pill-success" : b.status === "failed" ? "pill-danger" : b.status === "sending" ? "pill-warning" : "pill-muted"}`}>{b.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
