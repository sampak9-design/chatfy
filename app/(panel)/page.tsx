import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import {
  Users, Bot, Search, SlidersHorizontal, Upload, Download, Plus,
  Settings2, BarChart3, MoreHorizontal, ArrowUpRight, ArrowDownLeft,
  History, CalendarClock, ChevronRight, Activity, AlertTriangle,
} from "lucide-react";
import { BarChart } from "@/components/charts/BarChart";
import { SegmentedBar } from "@/components/SegmentedBar";
import { BotLinkCard } from "@/components/BotLinkCard";
import { EmptyState } from "@/components/EmptyState";
import { LocalTime } from "@/components/LocalTime";
import { getActiveBot } from "@/lib/active-bot";
import { getSystemHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

// Todas as datas do painel são no fuso de Brasília (sem horário de verão desde 2019).
const TZ = "America/Sao_Paulo";
const BR_OFFSET = "-03:00";
const DAY_MS = 86_400_000;

function ymdBR(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function brDate(ymdStr: string, end = false): Date {
  return new Date(`${ymdStr}T${end ? "23:59:59.999" : "00:00:00"}${BR_OFFSET}`);
}
function addDaysStr(ymdStr: string, n: number): string {
  return ymdBR(new Date(brDate(ymdStr).getTime() + n * DAY_MS));
}
function daysBetweenStr(a: string, b: string): number {
  return Math.round((brDate(b).getTime() - brDate(a).getTime()) / DAY_MS);
}
function br(ymdStr: string): string {
  return ymdStr.split("-").reverse().join("/");
}

const AVATAR_COLORS = ["#f97316", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#06b6d4", "#eab308"];

type Metric = "entradas" | "ativos" | "bloqueados";
const METRICS: { key: Metric; label: string }[] = [
  { key: "entradas", label: "Entradas" },
  { key: "ativos", label: "Ativos" },
  { key: "bloqueados", label: "Bloqueados" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; metric?: string }>;
}) {
  const bot = await getActiveBot();

  const sp = await searchParams;
  const valid = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const todayStr = ymdBR(new Date());
  let toStr = valid(sp.to) ? sp.to! : todayStr;
  let fromStr = valid(sp.from) ? sp.from! : ymdBR(new Date(Date.now() - 29 * DAY_MS));
  if (fromStr > toStr) [fromStr, toStr] = [toStr, fromStr];
  const rangeStart = brDate(fromStr);
  const rangeEnd = brDate(toStr, true);
  const spanDays = Math.min(366, Math.max(1, daysBetweenStr(fromStr, toStr) + 1));

  const metric: Metric = METRICS.some((m) => m.key === sp.metric) ? (sp.metric as Metric) : "entradas";
  const metricWhere =
    metric === "ativos" ? { status: "active" as const } : metric === "bloqueados" ? { status: "blocked" as const } : {};
  const metricSql =
    metric === "ativos" ? Prisma.sql`AND status = 'active'`
    : metric === "bloqueados" ? Prisma.sql`AND status = 'blocked'`
    : Prisma.empty;

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

  // Período anterior (mesmo tamanho) pra calcular a variação
  const prevEnd = new Date(rangeStart.getTime() - 1);
  const prevStart = new Date(rangeStart.getTime() - spanDays * DAY_MS);

  const [total, active, blocked, periodCount, prevCount, recentLeads, leadsByDay, originAgg, sequences, health] =
    await Promise.all([
      prisma.lead.count({ where: { botId: bot.id } }),
      prisma.lead.count({ where: { botId: bot.id, status: "active" } }),
      prisma.lead.count({ where: { botId: bot.id, status: "blocked" } }),
      prisma.lead.count({ where: { botId: bot.id, ...metricWhere, createdAt: { gte: rangeStart, lte: rangeEnd } } }),
      prisma.lead.count({ where: { botId: bot.id, ...metricWhere, createdAt: { gte: prevStart, lte: prevEnd } } }),
      prisma.lead.findMany({ where: { botId: bot.id }, orderBy: { createdAt: "desc" }, take: 6 }),
      prisma.$queryRaw<{ day: string; count: bigint }[]>`
        SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS day,
               COUNT(*)::bigint AS count
        FROM leads
        WHERE "botId" = ${bot.id}
          AND "createdAt" >= ${rangeStart}
          AND "createdAt" <= ${rangeEnd}
          ${metricSql}
        GROUP BY day
        ORDER BY day ASC
      `,
      prisma.lead.groupBy({
        by: ["source"],
        where: { botId: bot.id },
        _count: { _all: true },
        orderBy: { _count: { source: "desc" } },
        take: 5,
      }),
      prisma.sequence.findMany({
        where: { botId: bot.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { _count: { select: { steps: true, deliveries: true } } },
      }),
      getSystemHealth(),
    ]);

  // Série do gráfico
  const series: { x: string; y: number }[] = [];
  const byDay = new Map<string, number>();
  for (const r of leadsByDay) byDay.set(r.day, Number(r.count));
  for (let i = 0; i < spanDays; i++) {
    const key = addDaysStr(fromStr, i);
    const [, m, d] = key.split("-");
    series.push({ x: `${Number(d)}/${Number(m)}`, y: byDay.get(key) ?? 0 });
  }

  let chartSeries = series;
  let periodLabel = `${br(fromStr)} — ${br(toStr)}`;
  if (spanDays === 1) {
    const hourly = await prisma.$queryRaw<{ h: number; count: bigint }[]>`
      SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'America/Sao_Paulo'))::int AS h,
             COUNT(*)::bigint AS count
      FROM leads
      WHERE "botId" = ${bot.id}
        AND "createdAt" >= ${rangeStart}
        AND "createdAt" <= ${rangeEnd}
        ${metricSql}
      GROUP BY h
      ORDER BY h ASC
    `;
    const byHour = new Map<number, number>();
    for (const r of hourly) byHour.set(Number(r.h), Number(r.count));
    chartSeries = Array.from({ length: 24 }, (_, h) => ({
      x: `${String(h).padStart(2, "0")}h`,
      y: byHour.get(h) ?? 0,
    }));
    periodLabel = br(fromStr);
  }

  // Atalhos de período preservando a métrica
  const qp = (from: string, to: string) => `/?from=${from}&to=${to}${metric !== "entradas" ? `&metric=${metric}` : ""}`;
  const presetHref = (days: number) => qp(ymdBR(new Date(Date.now() - (days - 1) * DAY_MS)), todayStr);
  const dayHref = (s: string) => qp(s, s);
  const metricHref = (m: Metric) => `/?from=${fromStr}&to=${toStr}${m !== "entradas" ? `&metric=${m}` : ""}`;
  const yesterdayStr = ymdBR(new Date(Date.now() - DAY_MS));

  const delta = prevCount > 0 ? Math.round(((periodCount - prevCount) / prevCount) * 100) : periodCount > 0 ? 100 : 0;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  const segColors = ["#f97316", "#fb923c", "#fdba74", "#a8a29e", "rgba(255,255,255,0.22)"];
  const segments = originAgg.map((o, i) => ({
    label: o.source || "direto",
    value: o._count._all,
    color: segColors[i] ?? "rgba(255,255,255,0.22)",
  }));

  return (
    <div className="p-4 md:p-6 space-y-5">
      <h1 className="text-2xl font-semibold">Painel de Controle</h1>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_370px] gap-5">
        {/* ───────────── COLUNA ESQUERDA ───────────── */}
        <div className="space-y-5 min-w-0">
          {/* Ações */}
          <div className="flex items-center gap-3 flex-wrap">
            <Link href={`/channels/telegram/${bot.id}`} className="btn btn-ghost">
              <Settings2 className="w-4 h-4" /> Gerenciar bot
            </Link>
            <Link href="/leads" className="btn btn-ghost">
              <Upload className="w-4 h-4" /> Ver audiência
            </Link>
            <Link href="/broadcasts" className="btn btn-primary">
              <Plus className="w-4 h-4" /> Novo disparo
            </Link>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Kpi label="Total de leads" value={total} badge={`+${periodCount}`} />
            <Kpi label="Leads ativos" value={active} badge={`${pct(active)}%`} />
            <Kpi label="Bloqueados" value={blocked} badge={`${pct(blocked)}%`} tone="danger" />
          </div>

          {/* Gráfico */}
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm" style={{ color: "var(--text-dim)" }}>Entrada de leads</div>
                <div className="text-3xl font-semibold mt-1">{periodCount.toLocaleString("pt-BR")}</div>
              </div>
              <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: "var(--surface-2)" }}>
                <Preset href={dayHref(todayStr)} label="Hoje" />
                <Preset href={dayHref(yesterdayStr)} label="Ontem" />
                <Preset href={presetHref(7)} label="7d" />
                <Preset href={presetHref(30)} label="30d" />
                <Preset href={presetHref(90)} label="90d" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
              <div className="flex items-center gap-2">
                {METRICS.map((m) => (
                  <Link
                    key={m.key}
                    href={metricHref(m.key)}
                    className="px-4 py-2 rounded-xl text-sm transition-colors"
                    style={{
                      background: metric === m.key ? "var(--surface-3)" : "transparent",
                      color: metric === m.key ? "var(--text)" : "var(--text-dim)",
                      border: `1px solid ${metric === m.key ? "var(--border-strong)" : "transparent"}`,
                    }}
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "var(--text-faint)" }}>{periodLabel}</span>
                <IconBubble><BarChart3 className="w-4 h-4" /></IconBubble>
                <IconBubble><MoreHorizontal className="w-4 h-4" /></IconBubble>
              </div>
            </div>

            <div className="mt-2">
              <BarChart data={chartSeries} height={280} />
            </div>
          </div>

          {/* Tabela */}
          <div className="card overflow-hidden">
            <div className="p-4 flex items-center gap-3 flex-wrap">
              <form action="/leads" className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }} />
                <input name="q" placeholder="Buscar lead…" className="input" style={{ paddingLeft: 36 }} />
              </form>
              <button className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}>
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <Link href="/leads" className="btn btn-ghost"><Download className="w-4 h-4" /> Ver todos</Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
                    <th className="text-left font-medium px-4 py-3">Telegram ID</th>
                    <th className="text-left font-medium px-4 py-3">Lead</th>
                    <th className="text-left font-medium px-4 py-3">Origem</th>
                    <th className="text-left font-medium px-4 py-3">Entrada</th>
                    <th className="text-left font-medium px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLeads.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10" style={{ color: "var(--text-faint)" }}>Nenhum lead ainda.</td></tr>
                  ) : recentLeads.map((l, i) => {
                    const nome = l.firstName || l.username || l.telegramId;
                    const cor = AVATAR_COLORS[i % AVATAR_COLORS.length];
                    return (
                      <tr key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-dim)" }}>{l.telegramId}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                              style={{ background: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}>
                              {nome.slice(0, 1).toUpperCase()}
                            </span>
                            <span className="truncate">{nome}{l.username ? <span style={{ color: "var(--text-faint)" }}> @{l.username}</span> : null}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--text-dim)" }}>{l.source || "direto"}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--text-faint)" }}>
                          <LocalTime iso={l.createdAt.toISOString()} />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`pill ${l.status === "active" ? "pill-success" : l.status === "blocked" ? "pill-danger" : "pill-muted"}`}>
                            {l.status === "active" ? "Ativo" : l.status === "blocked" ? "Bloqueado" : "Saiu"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ───────────── COLUNA DIREITA ───────────── */}
        <div className="space-y-5 min-w-0">
          <form action="/inbox" className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }} />
            <input name="q" placeholder="Buscar conversa…" className="input" style={{ paddingLeft: 36 }} />
          </form>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl p-1 flex-1" style={{ background: "var(--surface-2)" }}>
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm flex-1 justify-center"
                style={{ background: "var(--surface-3)", color: "var(--text)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
                Telegram
              </span>
              <span className="px-3 py-1.5 rounded-lg text-sm flex-1 text-center" style={{ color: "var(--text-faint)" }}>
                WhatsApp
              </span>
            </div>
            <Link href="/channels/telegram/new" className="btn btn-primary shrink-0">
              <Plus className="w-4 h-4" /> Bot
            </Link>
          </div>

          <BotLinkCard name={bot.name} username={bot.username} paused={bot.paused} />

          {/* Quick Action */}
          <div>
            <h2 className="font-semibold mb-3">Ações rápidas</h2>
            <div className="flex items-center gap-2">
              <QuickAction href="/flows" icon={<Plus className="w-4 h-4" />} label="Fluxo" />
              <QuickAction href="/broadcasts" icon={<ArrowUpRight className="w-4 h-4" />} label="Disparo" />
              <QuickAction href="/sequences" icon={<ArrowDownLeft className="w-4 h-4" />} label="Sequência" />
              <Link href="/inbox" className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}>
                <History className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Origem dos leads */}
          <div className="card p-5 space-y-4">
            <div>
              <h2 className="font-semibold">Origem dos leads</h2>
              <div className="mt-1">
                <span className="text-2xl font-semibold">{total.toLocaleString("pt-BR")}</span>
                <span className="text-sm ml-2" style={{ color: "var(--text-dim)" }}>leads no total</span>
              </div>
            </div>
            {segments.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-faint)" }}>Sem dados de origem ainda.</p>
            ) : (
              <>
                <div className="text-sm" style={{ color: "var(--text-dim)" }}>Principais fontes</div>
                <SegmentedBar segments={segments} />
              </>
            )}
          </div>

          {/* Sequências */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Sequências</h2>
              <Link href="/sequences" className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}>
                <Plus className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-2">
              {sequences.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-faint)" }}>Nenhuma sequência criada.</p>
              ) : sequences.map((s) => (
                <Link key={s.id} href={`/sequences/${s.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                  style={{ background: "var(--surface-2)" }}>
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(249,115,22,0.12)", color: "var(--primary)" }}>
                    <CalendarClock className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {s._count.steps} dia(s) · {s._count.deliveries} entrega(s)
                    </div>
                  </div>
                  <span className={`pill ${s.active ? "pill-success" : "pill-muted"}`}>{s.active ? "ativa" : "pausada"}</span>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-faint)" }} />
                </Link>
              ))}
            </div>

            <Link href="/sequences" className="btn btn-ghost w-full mt-3">Ver todas</Link>
          </div>

          {/* Saúde do sistema */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
                <h2 className="font-semibold">Saúde do sistema</h2>
              </div>
              <span className={`pill ${health.workerOnline ? "pill-success" : "pill-danger"}`}>
                {health.ok ? (health.workerOnline ? "online" : "offline") : "sem redis"}
              </span>
            </div>

            <HealthRow label="Worker" value={health.workerOnline ? `${health.workers} ativo(s)` : "parado"} bad={!health.workerOnline} />
            <HealthRow
              label="Último ciclo"
              value={health.lastTickAt ? <LocalTime iso={health.lastTickAt.toISOString()} /> : "—"}
              bad={!health.lastTickAt}
            />
            <HealthRow label="Agendamentos" value={`${health.scheduled}`} />
            <HealthRow label="Falhas" value={`${health.failed}`} bad={health.failed > 0} />

            {!health.workerOnline && (
              <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.10)" }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#fca5a5" }} />
                <span>
                  O worker não está rodando — as sequências não avançam e os delays de fluxo não disparam.
                  Suba o serviço <code>npm run worker</code> no Railway.
                </span>
              </div>
            )}

            <div className="pt-1 text-xs flex items-center justify-between" style={{ color: "var(--text-faint)" }}>
              <span>Variação no período</span>
              <span style={{ color: delta >= 0 ? "var(--success)" : "var(--danger)" }}>
                {delta >= 0 ? "+" : ""}{delta}% vs. anterior ({prevCount.toLocaleString("pt-BR")})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, badge, tone }: { label: string; value: number; badge: string; tone?: "danger" }) {
  return (
    <div className="card p-5">
      <div className="text-sm" style={{ color: "var(--text-dim)" }}>{label}</div>
      <div className="flex items-center justify-between gap-3 mt-2">
        <div className="text-2xl font-semibold">{value.toLocaleString("pt-BR")}</div>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
          style={
            tone === "danger"
              ? { background: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.28)" }
              : { background: "rgba(234,179,8,0.12)", color: "#fde047", border: "1px solid rgba(234,179,8,0.28)" }
          }
        >
          {badge}
        </span>
      </div>
    </div>
  );
}

function HealthRow({ label, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: "var(--text-faint)" }}>{label}</span>
      <span style={{ color: bad ? "#fca5a5" : "var(--text)" }}>{value}</span>
    </div>
  );
}

function Preset({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="px-3 py-1.5 rounded-lg text-xs transition-colors" style={{ color: "var(--text-dim)" }}>
      {label}
    </Link>
  );
}

function IconBubble({ children }: { children: React.ReactNode }) {
  return (
    <span className="w-9 h-9 rounded-full flex items-center justify-center"
      style={{ border: "1px solid var(--border)", color: "var(--text-dim)" }}>
      {children}
    </span>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm transition-colors"
      style={{ border: "1px solid var(--border)", color: "var(--text)" }}>
      {icon} {label}
    </Link>
  );
}
