import { prisma } from "@/lib/db";
import Link from "next/link";
import { Users, UserCheck, UserX, UserPlus, Megaphone, Bot } from "lucide-react";
import { LineChart } from "@/components/charts/LineChart";
import { PieChart } from "@/components/charts/PieChart";
import { EmptyState } from "@/components/EmptyState";
import { getActiveBot } from "@/lib/active-bot";

export const dynamic = "force-dynamic";

// Todas as datas do painel são no fuso de Brasília (sem horário de verão desde 2019).
const TZ = "America/Sao_Paulo";
const BR_OFFSET = "-03:00";
const DAY_MS = 86_400_000;

/** yyyy-mm-dd de uma instância no fuso de Brasília. */
function ymdBR(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
/** Instante UTC correspondente ao início (ou fim) de um dia yyyy-mm-dd em Brasília. */
function brDate(ymdStr: string, end = false): Date {
  return new Date(`${ymdStr}T${end ? "23:59:59.999" : "00:00:00"}${BR_OFFSET}`);
}
function addDaysStr(ymdStr: string, n: number): string {
  return ymdBR(new Date(brDate(ymdStr).getTime() + n * DAY_MS));
}
function daysBetweenStr(a: string, b: string): number {
  return Math.round((brDate(b).getTime() - brDate(a).getTime()) / DAY_MS);
}
/** yyyy-mm-dd → dd/mm/yyyy para exibição. */
function br(ymdStr: string): string {
  return ymdStr.split("-").reverse().join("/");
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const bot = await getActiveBot();

  // Período selecionado (padrão: últimos 30 dias), tudo em horário de Brasília.
  const sp = await searchParams;
  const valid = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const todayStr = ymdBR(new Date());
  let toStr = valid(sp.to) ? sp.to! : todayStr;
  let fromStr = valid(sp.from) ? sp.from! : ymdBR(new Date(Date.now() - 29 * DAY_MS));
  if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];
  const rangeStart = brDate(fromStr);
  const rangeEnd = brDate(toStr, true);
  const spanDays = Math.min(366, Math.max(1, daysBetweenStr(fromStr, toStr) + 1));
  const todayBRStart = brDate(todayStr);

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
    prisma.lead.count({ where: { botId: bot.id, createdAt: { gte: todayBRStart } } }),
    prisma.lead.count({ where: { botId: bot.id, createdAt: { gte: rangeStart, lte: rangeEnd } } }),
    prisma.lead.findMany({ where: { botId: bot.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.broadcast.findMany({ where: { botId: bot.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    // Leads por dia (agrupado no fuso de Brasília) dentro do período
    prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS day,
             COUNT(*)::bigint AS count
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

  // Série por dia no período (dias em Brasília), preenchendo faltas com 0.
  const series: { x: string; y: number }[] = [];
  const byDay = new Map<string, number>();
  for (const r of leadsByDay) byDay.set(r.day, Number(r.count));
  for (let i = 0; i < spanDays; i++) {
    const key = addDaysStr(fromStr, i);
    const [, m, d] = key.split("-");
    series.push({ x: `${Number(d)}/${Number(m)}`, y: byDay.get(key) ?? 0 });
  }

  // Período de um dia só → quebra por hora (24 pontos) no fuso de Brasília.
  let chartSeries = series;
  let chartLabel = `Leads por dia · ${br(fromStr)} — ${br(toStr)}`;
  if (spanDays === 1) {
    const hourly = await prisma.$queryRaw<{ h: number; count: bigint }[]>`
      SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'America/Sao_Paulo'))::int AS h,
             COUNT(*)::bigint AS count
      FROM leads
      WHERE "botId" = ${bot.id}
        AND "createdAt" >= ${rangeStart}
        AND "createdAt" <= ${rangeEnd}
      GROUP BY h
      ORDER BY h ASC
    `;
    const byHour = new Map<number, number>();
    for (const r of hourly) byHour.set(Number(r.h), Number(r.count));
    chartSeries = [];
    for (let h = 0; h < 24; h++) {
      chartSeries.push({ x: `${String(h).padStart(2, "0")}h`, y: byHour.get(h) ?? 0 });
    }
    chartLabel = `Leads por hora · ${br(fromStr)}`;
  }

  // Atalhos de período (datas em Brasília).
  const presetHref = (days: number) => `/?from=${ymdBR(new Date(Date.now() - (days - 1) * DAY_MS))}&to=${todayStr}`;
  const yesterdayStr = ymdBR(new Date(Date.now() - DAY_MS));
  const dayHref = (s: string) => `/?from=${s}&to=${s}`;

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
            <input type="date" name="from" defaultValue={fromStr} max={todayStr} className="input" style={{ width: 150 }} />
          </div>
          <div>
            <label className="label">Até</label>
            <input type="date" name="to" defaultValue={toStr} max={todayStr} className="input" style={{ width: 150 }} />
          </div>
          <button className="btn btn-primary">Aplicar</button>
          <div className="flex gap-1 flex-wrap">
            <Link href={dayHref(todayStr)} className="btn btn-ghost" style={{ padding: "6px 10px" }}>Hoje</Link>
            <Link href={dayHref(yesterdayStr)} className="btn btn-ghost" style={{ padding: "6px 10px" }}>Ontem</Link>
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
          <LineChart data={chartSeries} label={chartLabel} />
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
