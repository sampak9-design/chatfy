import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";
import { tgSend } from "@/lib/telegram";
import { renderTemplate } from "@/lib/template";

export const dynamic = "force-dynamic";

interface SP {
  lead?: string;
  q?: string;
}

function fmtRel(d: Date) {
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
}

function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);
}

async function sendReply(formData: FormData) {
  "use server";
  const leadId = String(formData.get("leadId"));
  const text = String(formData.get("text") || "").trim();
  if (!text) return;

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { bot: true } });
  if (!lead) return;
  if (lead.status !== "active") return;

  const rendered = renderTemplate(text, lead);
  const result = await tgSend(lead.bot.token, {
    chatId: lead.telegramId,
    text: rendered,
  });

  if (!result.ok && result.blocked) {
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "blocked" } });
  }

  if (result.ok) {
    await prisma.message.create({
      data: {
        botId: lead.botId,
        leadId: lead.id,
        direction: "out",
        kind: "text",
        text: rendered ?? text,
        fromAdmin: true,
      },
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastInteraction: new Date() },
    });
  }

  revalidatePath(`/inbox`);
  redirect(`/inbox?lead=${leadId}`);
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const bot = await prisma.bot.findFirst({ orderBy: { createdAt: "asc" } });
  if (!bot) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-2">Conversas</h1>
        <p style={{ color: "var(--text-dim)" }}>Cadastre um bot primeiro em <Link href="/bot" style={{ color: "var(--primary)" }}>Bot</Link>.</p>
      </div>
    );
  }

  const leads = await prisma.lead.findMany({
    where: {
      botId: bot.id,
      ...(sp.q
        ? {
            OR: [
              { firstName: { contains: sp.q, mode: "insensitive" as const } },
              { lastName: { contains: sp.q, mode: "insensitive" as const } },
              { username: { contains: sp.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { lastInteraction: "desc" },
    take: 80,
    include: {
      messages: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  const activeLeadId = sp.lead || leads[0]?.id;
  const activeLead = activeLeadId
    ? await prisma.lead.findUnique({ where: { id: activeLeadId } })
    : null;
  const messages = activeLead
    ? await prisma.message.findMany({
        where: { leadId: activeLead.id },
        orderBy: { createdAt: "asc" },
        take: 200,
      })
    : [];

  return (
    <div className="flex h-screen min-h-0">
      {/* Conversation list */}
      <div className="w-80 shrink-0 flex flex-col" style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}>
        <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4" style={{ color: "var(--primary)" }} />
            <h1 className="font-semibold">Conversas</h1>
            <span className="ml-auto text-xs" style={{ color: "var(--text-faint)" }}>{leads.length}</span>
          </div>
          <form method="get">
            <input
              name="q"
              defaultValue={sp.q || ""}
              className="input"
              placeholder="Buscar por nome..."
              style={{ padding: "8px 12px", fontSize: 13 }}
            />
          </form>
        </div>
        <div className="flex-1 overflow-y-auto">
          {leads.length === 0 ? (
            <div className="p-6 text-sm text-center" style={{ color: "var(--text-faint)" }}>Nenhuma conversa ainda.</div>
          ) : leads.map((l) => {
            const last = l.messages[0];
            const isActive = l.id === activeLeadId;
            const name = [l.firstName, l.lastName].filter(Boolean).join(" ") || l.username || `id ${l.telegramId}`;
            return (
              <Link
                key={l.id}
                href={`/inbox?lead=${l.id}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
                className="block px-4 py-3"
                style={{
                  background: isActive ? "var(--surface-3)" : "transparent",
                  borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent",
                  borderBottom: "1px solid var(--border)",
                  paddingLeft: isActive ? 13 : 16,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
                    style={{ background: "var(--surface-3)", color: "var(--text-dim)" }}
                  >
                    {(name[0] || "?").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm truncate flex-1">{name}</div>
                      <div className="text-[10px] shrink-0" style={{ color: "var(--text-faint)" }}>{fmtRel(l.lastInteraction)}</div>
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-faint)" }}>
                      {last
                        ? `${last.direction === "out" ? "↗ " : ""}${last.text || `[${last.kind}]`}`
                        : <em>sem mensagens</em>}
                    </div>
                  </div>
                  {l.status === "blocked" && <span className="pill pill-danger text-[9px]" style={{ padding: "1px 6px" }}>blk</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Conversation view */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeLead ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--text-faint)" }}>
            Selecione uma conversa à esquerda.
          </div>
        ) : (
          <>
            <header className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                style={{ background: "var(--surface-3)", color: "var(--text-dim)" }}
              >
                {((activeLead.firstName || activeLead.username || "?")[0] || "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">
                  {[activeLead.firstName, activeLead.lastName].filter(Boolean).join(" ") || activeLead.username || `id ${activeLead.telegramId}`}
                </div>
                <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                  {activeLead.username ? `@${activeLead.username} · ` : ""}id {activeLead.telegramId}
                  {activeLead.source && ` · fonte: ${activeLead.source}`}
                </div>
              </div>
              <span className={`pill ${activeLead.status === "active" ? "pill-success" : activeLead.status === "blocked" ? "pill-danger" : "pill-muted"}`}>{activeLead.status}</span>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-3" style={{ background: "var(--bg)" }}>
              {messages.length === 0 ? (
                <div className="text-center text-sm py-8" style={{ color: "var(--text-faint)" }}>
                  Nenhuma mensagem trocada ainda.
                </div>
              ) : messages.map((m) => {
                const isOut = m.direction === "out";
                return (
                  <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[70%] rounded-2xl px-4 py-2"
                      style={{
                        background: isOut
                          ? (m.fromAdmin ? "var(--primary)" : "var(--surface-3)")
                          : "var(--surface-2)",
                        color: isOut && m.fromAdmin ? "white" : "var(--text)",
                        borderTopRightRadius: isOut ? 4 : 16,
                        borderTopLeftRadius: isOut ? 16 : 4,
                      }}
                    >
                      {m.kind !== "text" && (
                        <div className="text-[11px] uppercase tracking-wide opacity-70 mb-1">[{m.kind}]</div>
                      )}
                      {m.mediaUrl && (
                        <div className="text-[10px] opacity-60 mb-1 truncate" style={{ maxWidth: 280 }}>{m.mediaUrl}</div>
                      )}
                      {m.text && <div className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: m.text }} />}
                      <div className="text-[10px] opacity-60 mt-1 text-right">
                        {fmtTime(m.createdAt)}
                        {isOut && m.fromAdmin && " · admin"}
                        {isOut && !m.fromAdmin && " · bot"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <form action={sendReply} className="p-4 flex gap-2" style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
              <input type="hidden" name="leadId" value={activeLead.id} />
              <input
                name="text"
                className="input flex-1"
                placeholder={activeLead.status === "blocked" ? "Lead bloqueou o bot — não dá pra responder" : "Digite sua resposta..."}
                disabled={activeLead.status !== "active"}
                autoComplete="off"
              />
              <button type="submit" className="btn btn-primary" disabled={activeLead.status !== "active"}>
                <Send className="w-4 h-4" /> Enviar
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
