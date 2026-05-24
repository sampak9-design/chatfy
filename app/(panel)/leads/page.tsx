import { prisma } from "@/lib/db";
import { LeadStatus, LeadOrigin } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { LocalTime } from "@/components/LocalTime";
import { TagsEditor } from "@/components/TagsEditor";
import { EmptyState } from "@/components/EmptyState";
import { getActiveBot } from "@/lib/active-bot";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

async function saveTags(formData: FormData) {
  "use server";
  const leadId = String(formData.get("leadId"));
  const raw = String(formData.get("tags") || "");
  const tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
  await prisma.lead.update({ where: { id: leadId }, data: { tags } });
  revalidatePath("/leads");
}

interface SP {
  status?: string;
  origin?: string;
  source?: string;
  tag?: string;
  q?: string;
  page?: string;
}

const PAGE_SIZE = 25;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const bot = await getActiveBot();
  if (!bot) {
    return (
      <div className="p-4 md:p-8">
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
    ...(sp.tag ? { tags: { has: sp.tag } } : {}),
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

  const [total, leads, sources, tagAgg] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    prisma.lead.findMany({
      where: { botId: bot.id, source: { not: null } },
      distinct: ["source"],
      select: { source: true },
      take: 100,
    }),
    prisma.lead.findMany({
      where: { botId: bot.id },
      select: { tags: true },
      take: 5000,
    }),
  ]);
  const allTags = Array.from(new Set(tagAgg.flatMap((l) => l.tags))).sort();

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>{total} no total</p>
        </div>
      </div>

      <form className="card p-4 grid grid-cols-1 md:grid-cols-6 gap-3" method="get">
        <input name="q" defaultValue={sp.q || ""} className="input md:col-span-2" placeholder="Nome, username ou telegram_id" />
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
          <option value="">Toda fonte</option>
          {sources.map((s) => s.source && <option key={s.source} value={s.source}>{s.source}</option>)}
        </select>
        <select name="tag" defaultValue={sp.tag || ""} className="input">
          <option value="">Toda tag</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="btn btn-primary md:col-span-6">Filtrar</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 720 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
              <th className="text-left font-medium px-4 py-3">Nome</th>
              <th className="text-left font-medium px-4 py-3">Username</th>
              <th className="text-left font-medium px-4 py-3">Telegram ID</th>
              <th className="text-left font-medium px-4 py-3">Origem</th>
              <th className="text-left font-medium px-4 py-3">Fonte</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-left font-medium px-4 py-3">Tags</th>
              <th className="text-left font-medium px-4 py-3">Entrou</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={8} className="p-0">
                <EmptyState
                  icon={Users}
                  title="Nenhum lead encontrado"
                  description="Compartilhe o link do seu bot pra começar a captar."
                  small
                />
              </td></tr>
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
                <td className="px-4 py-3" style={{ minWidth: 200 }}>
                  <TagsEditor leadId={l.id} initialTags={l.tags} saveAction={saveTags} />
                </td>
                <td className="px-4 py-3" style={{ color: "var(--text-faint)" }}><LocalTime iso={l.createdAt.toISOString()} /></td>
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
