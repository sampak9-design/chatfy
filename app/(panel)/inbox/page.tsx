import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Send, ArrowLeft } from "lucide-react";
import { tgSend } from "@/lib/telegram";
import { renderTemplate } from "@/lib/template";
import { ScrollToBottom } from "@/components/ScrollToBottom";
import { LocalTime } from "@/components/LocalTime";

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
      <div className="p-4 md:p-8">
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

  // On mobile we show EITHER the list OR the chat based on the URL `?lead=` param.
  // On desktop both panes are always visible.
  const showListClass = sp.lead ? "hidden md:flex" : "flex";
  const showChatClass = sp.lead ? "flex" : "hidden md:flex";

  return (
    <div className="flex min-h-0 h-[calc(100vh-56px)] md:h-screen">
      {/* Conversation list */}
      <div
        className={`w-full md:w-80 shrink-0 ${showListClass} flex-col`}
        style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}
      >
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
      <div className={`flex-1 ${showChatClass} flex-col min-w-0`}>
        {!activeLead ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--text-faint)" }}>
            Selecione uma conversa à esquerda.
          </div>
        ) : (
          <>
            <header className="px-4 md:px-6 py-3 md:py-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
              <Link
                href={`/inbox${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ""}`}
                className="md:hidden p-1 -ml-1"
                aria-label="Voltar"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
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

            <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-3" style={{ background: "var(--bg)" }}>
              {messages.length === 0 ? (
                <div className="text-center text-sm py-8" style={{ color: "var(--text-faint)" }}>
                  Nenhuma mensagem trocada ainda.
                </div>
              ) : messages.map((m) => {
                const isOut = m.direction === "out";
                // Outgoing media uses the public URL we sent. Incoming media is proxied through
                // /api/tg-file/<botId>/<fileId> (auth-protected) to resolve Telegram file_ids.
                const src = m.mediaUrl
                  ? m.mediaUrl
                  : m.fileId
                    ? `/api/tg-file/${bot.id}/${m.fileId}`
                    : null;
                // Inline keyboard rows we sent to Telegram: [[ {text, url|callback_data}, ...], ...]
                const buttonRows = Array.isArray(m.buttons)
                  ? (m.buttons as { text: string; url?: string; callback_data?: string }[][])
                  : null;
                return (
                  <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[70%] rounded-2xl px-3 py-2 space-y-2"
                      style={{
                        background: isOut
                          ? (m.fromAdmin ? "var(--primary)" : "var(--surface-3)")
                          : "var(--surface-2)",
                        color: isOut && m.fromAdmin ? "white" : "var(--text)",
                        borderTopRightRadius: isOut ? 4 : 16,
                        borderTopLeftRadius: isOut ? 16 : 4,
                      }}
                    >
                      {src && m.kind === "image" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="" className="rounded-lg" style={{ maxWidth: 320, maxHeight: 240, objectFit: "cover" }} />
                      )}
                      {src && m.kind === "video" && (
                        <video src={src} controls className="rounded-lg" style={{ maxWidth: 320, maxHeight: 240 }} />
                      )}
                      {src && m.kind === "audio" && (
                        <audio src={src} controls style={{ width: 280 }} />
                      )}
                      {src && m.kind === "document" && (
                        <a href={src} target="_blank" rel="noopener" className="flex items-center gap-2 text-sm underline">
                          📎 Baixar documento
                        </a>
                      )}
                      {src && m.kind === "sticker" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt="sticker" style={{ width: 120, height: 120, objectFit: "contain" }} />
                      )}
                      {!src && (m.kind === "other" || (m.kind !== "text" && !m.fileId && !m.mediaUrl)) && (
                        <div className="text-[11px] uppercase tracking-wide opacity-70">[{m.kind}]</div>
                      )}
                      {m.text && (
                        <div className="text-sm whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: m.text }} />
                      )}
                      {buttonRows && buttonRows.length > 0 && (
                        <div className="space-y-1 pt-1" style={{ marginTop: 6 }}>
                          {buttonRows.map((row, ri) => (
                            <div key={ri} className="flex gap-1">
                              {row.map((b, bi) => (
                                b.url ? (
                                  <a
                                    key={bi}
                                    href={b.url}
                                    target="_blank"
                                    rel="noopener"
                                    className="flex-1 text-center px-2 py-1.5 rounded text-xs underline"
                                    style={{ background: "rgba(0,0,0,0.25)", color: isOut && m.fromAdmin ? "white" : "var(--text)" }}
                                  >
                                    🔗 {b.text}
                                  </a>
                                ) : (
                                  <span
                                    key={bi}
                                    className="flex-1 text-center px-2 py-1.5 rounded text-xs"
                                    style={{ background: "rgba(0,0,0,0.25)", color: isOut && m.fromAdmin ? "rgba(255,255,255,0.85)" : "var(--text-dim)" }}
                                    title="Botão de callback (continua o fluxo)"
                                  >
                                    ⏭ {b.text}
                                  </span>
                                )
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] opacity-60 text-right">
                        <LocalTime iso={m.createdAt.toISOString()} variant="timeOnly" />
                        {isOut && m.fromAdmin && " · admin"}
                        {isOut && !m.fromAdmin && " · bot"}
                      </div>
                    </div>
                  </div>
                );
              })}
              <ScrollToBottom dep={activeLead.id} />
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
