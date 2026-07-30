import { prisma } from "@/lib/db";
import Link from "next/link";
import { Users, UserCheck, UserX, UserPlus, Megaphone, Bot } from "lucide-react";
import { LineChart } from "@/components/charts/LineChart";
import { PieChart } from "@/components/charts/PieChart";
import { EmptyState } from "@/components/EmptyState";
import { getActiveBot } from "@/lib/active-bot";

export const dynamic = "force-dynamic";

/** yyyy-mm-dd from a Date using local parts (stable for <input type=date>). */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function daysBetween(a: Date, b: Date) { return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000); }

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const bot = await getActiveBot();
  const today = startOfDay(new Date());

  // Selected date range (defaults to the last 30 days). Parsed from ?from=&to=.
  const sp = await searchParams;
  const parse = (s?: string) => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  };
  let toDate = parse(sp.to) ?? new Date();
  let fromDate = parse(sp.from) ?? (() => { const d = new Date(toDate); d.setDate(d.getDate() - 29); return d; })();
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  const rangeStart = startOfDay(fromDate);
  const rangeEnd = endOfDay(toDate);
  const spanDays = Math.min(366, Math.max(1, daysBetween(rangeStart, rangeEnd) + 1));

  if (!bot) {
    return (
      <div className="p-4 md:p-10">
        <div className="card p-6 md:p-10 max-w-2xl mx-auto">
          <EmptyState
            icon={Bot}
            title="Vamos começar"
            description="Cadastre seu primeiro bot do Telegram para começar a capturar leads."
            cta={{ label: "Cadastrar bot", href: "/channels/telegram/new" }}
          />
        </div>
      </div>
    );
  }

  const [total, active, blocked, todayCount, periodCount, recentLeads, recentBroadcasts, leadsByDay, originAgg] = await Promise.all([
    prisma.lead.count({ where: { botId: bot.id } }),
    prisma.lead.count({ where: { botId: bot.id, status: "active" } }),
    prisma.lead.count({ where: { botId: bot.id, status: "blocked" } }),
    prisma.lead.count({ where: { botId: bot.id, createdAt: { gte: today } } }),
    prisma.lead.count({ where: { botId: bot.id, createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.lead.findMany({ where: { botId: bot.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.broadcast.findMany({ where: { botId: bot.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    // Leads per day within the selected range
    prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM leads
      WHERE "botId" = ${bot.id}
        AND "createdAt" >= ${rangeStart}
        AND "createdAt" <= ${rangeEnd}
      GROUP BY day
      ORDER BY day ASC
    `,
    // Group by source (or "(direto)" if null)
    prisma.lead.groupBy({
      by: ["source"],
      where: { botId: bot.id },
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
      take: 8,
    }),
  ]);

  // Build the per-day series across the range, filling missing days with 0.
  const series: { x: string; y: number }[] = [];
  const byDay = new Map<string, number>();
  for (const r of leadsByDay) {
    byDay.set(ymd(new Date(r.day)), Number(r.count));
  }
  for (let i = 0; i < spanDays; i++) {
    const d = new Date(rangeStart); d.setDate(d.getDate() + i);
    series.push({ x: `${d.getDate()}/${d.getMonth() + 1}`, y: byDay.get(ymd(d)) ?? 0 });
  }

  // Quick-range presets (href back to this page).
  const presetHref = (days: number) => {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - (days - 1));
    return `/?from=${ymd(from)}&to=${ymd(to)}`;
  };
  const rangeLabel = `${ymd(rangeStart).split("-").reverse().join("/")} — ${ymd(rangeEnd).split("-").reverse().join("/")}`;

  const originSlices = originAgg.map((o) => ({
    label: o.source || "(direto)",
    value: o._count._all,
  }));

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Painel de Controle</h1>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Bot: <span className="font-medium" style={{ color: "var(--text)" }}>{bot.name}</span>
            {bot.username && <> · @{bot.username}</>}
          </p>
        </div>

        {/* Filtro de datas */}
        <form method="get" className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="label">De</label>
            <input type="date" name="from" defaultValue={ymd(rangeStart)} max={ymd(new Date())} className="input" style={{ width: 150 }} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" name="to" defaultValue={ymd(rangeEnd)} max={ymd(new Date())} className="input" style={{ width: 150 }} />
          </div>
          <button className="btn btn-primary">Aplicar</button>
          <div className="flex gap-1">
            <Link href={presetHref(7)} className="btn btn-ghost" style={{ padding: "6px 10px" }}>7d</Link>
            <Link href={presetHref(30)} className="btn btn-ghost" style={{ padding: "6px 10px" }}>30d</Link>
            <Link href={presetHref(90)} className="btn btn-ghost" style={{ padding: "6px 10px" }}>90d</Link>
          </div>
        </form>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Total de leads" value={total} />
        <Kpi icon={UserCheck} label="Ativos" value={active} />
        <Kpi icon={UserX} label="Bloqueados" value={blocked} />
        <Kpi icon={UserPlus} label="Entradas no período" value={periodCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <LineChart data={series} label={`Leads por dia · ${rangeLabel}`} />
        </div>
        <div className="card p-5">
          <PieChart data={originSlices} label="Origem (fonte)" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Últimos leads</h2>
            <Link href="/leads" className="text-xs" style={{ color: "var(--primary)" }}>Ver todos →</Link>
          </div>
          <div className="space-y-2">
            {recentLeads.length === 0 ? (
              <EmptyState icon={Users} title="Sem leads ainda" description="Compartilhe o link do bot para começar." small />
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
              <EmptyState icon={Megaphone} title="Sem disparos ainda" description="Crie sua primeira campanha." cta={{ label: "Criar disparo", href: "/broadcasts" }} small />
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
