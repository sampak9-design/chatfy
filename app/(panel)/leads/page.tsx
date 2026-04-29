import { prisma } from "@/lib/db";
import { LeadStatus, LeadOrigin } from "@prisma/client";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface SP {
  status?: string;
  origin?: string;
  source?: string;
  q?: string;
  page?: string;
}

const PAGE_SIZE = 25;

function fmt(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const bot = await prisma.bot.findFirst({ orderBy: { createdAt: "asc" } });
  if (!bot) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-2">Leads</h1>
        <p style={{ color: "var(--text-dim)" }}>Cadastre um bot primeiro em <Link href="/bot" style={{ color: "var(--primary)" }}>Bot</Link>.</p>
      </div>
    );
  }

  const page = Math.max(1, parseInt(sp.page || "1"));
  const where = {
    botId: bot.id,
    ...(sp.status && Object.values(LeadStatus).includes(sp.status as LeadStatus) ? { status: sp.status as LeadStatus } : {}),
    ...(sp.origin && Object.values(LeadOrigin).includes(sp.origin as LeadOrigin) ? { origin: sp.origin as LeadOrigin } : {}),
    ...(sp.source ? { source: sp.source } : {}),
    ...(sp.q
      ? {
          OR: [
            { firstName: { contains: sp.q, mode: "insensitive" as const } },
            { lastName: { contains: sp.q, mode: "insensitive" as const } },
            { username: { contains: sp.q, mode: "insensitive" as const } },
            { telegramId: { contains: sp.q } },
          ],
        }
      : {}),
  };

  const [total, leads, sources] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    prisma.lead.findMany({
      where: { botId: bot.id, source: { not: null } },
      distinct: ["source"],
      select: { source: true },
      take: 100,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>{total} no total</p>
        </div>
      </div>

      <form className="card p-4 grid grid-cols-1 md:grid-cols-5 gap-3" method="get">
        <input name="q" defaultValue={sp.q || ""} className="input" placeholder="Nome, username ou telegram_id" />
        <select name="status" defaultValue={sp.status || ""} className="input">
          <option value="">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="blocked">Bloqueados</option>
          <option value="unsubscribed">Cancelados</option>
        </select>
        <select name="origin" defaultValue={sp.origin || ""} className="input">
          <option value="">Toda origem</option>
          <option value="start">/start</option>
          <option value="button">Botão</option>
          <option value="campaign">Campanha</option>
        </select>
        <select name="source" defaultValue={sp.source || ""} className="input">
          <option value="">Toda fonte (?start=)</option>
          {sources.map((s) => s.source && <option key={s.source} value={s.source}>{s.source}</option>)}
        </select>
        <button className="btn btn-primary">Filtrar</button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
              <th className="text-left font-medium px-4 py-3">Nome</th>
              <th className="text-left font-medium px-4 py-3">Username</th>
              <th className="text-left font-medium px-4 py-3">Telegram ID</th>
              <th className="text-left font-medium px-4 py-3">Origem</th>
              <th className="text-left font-medium px-4 py-3">Fonte</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-left font-medium px-4 py-3">Entrou</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10" style={{ color: "var(--text-faint)" }}>Nenhum lead encontrado.</td></tr>
            ) : leads.map((l) => (
              <tr key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-4 py-3">{[l.firstName, l.lastName].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-dim)" }}>{l.username ? `@${l.username}` : "—"}</td>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-faint)" }}>{l.telegramId}</td>
                <td className="px-4 py-3"><span className="pill pill-muted">{l.origin}</span></td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-dim)" }}>{l.source || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`pill ${l.status === "active" ? "pill-success" : l.status === "blocked" ? "pill-danger" : "pill-muted"}`}>{l.status}</span>
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text-faint)" }}>{fmt(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div style={{ color: "var(--text-faint)" }}>Página {page} de {totalPages}</div>
          <div className="flex gap-2">
            {page > 1 && <Link href={`?page=${page - 1}`} className="btn btn-ghost">Anterior</Link>}
            {page < totalPages && <Link href={`?page=${page + 1}`} className="btn btn-ghost">Próxima</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
