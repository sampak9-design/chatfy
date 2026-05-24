import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, Send } from "lucide-react";
import { LocalTime } from "@/components/LocalTime";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function TelegramChannelPage() {
  const bots = await prisma.bot.findMany({
    where: { channel: "telegram" },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,158,217,0.12)", color: "#229ed9" }}>
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Telegram</h1>
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>{bots.length} bot(s) conectado(s)</p>
          </div>
        </div>
        <Link href="/channels/telegram/new" className="btn btn-primary">
          <Plus className="w-4 h-4" /> Adicionar bot
        </Link>
      </div>

      {bots.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Send}
            title="Nenhum bot conectado"
            description="Crie um bot com o @BotFather no Telegram e cole o token aqui pra começar a capturar leads."
            cta={{ label: "Adicionar bot do Telegram", href: "/channels/telegram/new" }}
          />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 720 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Nome</th>
                <th className="text-left font-medium px-4 py-3">Username</th>
                <th className="text-left font-medium px-4 py-3">ID do bot</th>
                <th className="text-left font-medium px-4 py-3">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {bots.map((b) => (
                <tr key={b.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    {b.paused ? (
                      <span className="pill pill-warning">pausado</span>
                    ) : b.active ? (
                      <span className="pill pill-success">ativo</span>
                    ) : (
                      <span className="pill pill-muted">inativo</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/channels/telegram/${b.id}`} className="font-medium hover:underline">
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-dim)" }}>{b.username ? `@${b.username}` : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-faint)" }}>{b.token.slice(0, 10)}…</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-faint)" }}>
                    <LocalTime iso={b.updatedAt.toISOString()} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
