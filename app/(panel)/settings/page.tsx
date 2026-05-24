import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { User, KeyRound, Server, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const user = session ? await prisma.adminUser.findUnique({ where: { id: session.sub } }) : null;
  const appUrl = process.env.APP_URL || "(não configurado)";
  const botCount = await prisma.bot.count();
  const leadCount = await prisma.lead.count();

  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Sua conta e informações da instância.</p>
      </div>

      <div className="card p-6 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <User className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
          <h2 className="font-semibold">Conta admin</h2>
        </div>
        <Row label="E-mail" value={user?.email || session?.email || "—"} />
        <Row label="Nome" value={user?.name || "—"} />
        <Row label="Criado em" value={user?.createdAt.toLocaleDateString("pt-BR") || "—"} />
      </div>

      <div className="card p-6 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Server className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
          <h2 className="font-semibold">Instância</h2>
        </div>
        <Row label="URL pública" value={appUrl} mono />
        <Row label="Bots conectados" value={`${botCount}`} />
        <Row label="Leads totais" value={`${leadCount}`} />
      </div>

      <div className="card p-6 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <KeyRound className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
          <h2 className="font-semibold">Segurança</h2>
        </div>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          A senha do admin é definida via variáveis de ambiente (<code>ADMIN_PASSWORD</code>) e aplicada no primeiro boot.
          Pra trocar, atualize o env no Railway e rode o seed manualmente.
        </p>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-3">
          <ExternalLink className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
          <h2 className="font-semibold">Links úteis</h2>
        </div>
        <ul className="text-sm space-y-2" style={{ color: "var(--text-dim)" }}>
          <li>• <a href="https://core.telegram.org/bots/api" target="_blank" rel="noopener" style={{ color: "var(--primary)" }}>Documentação Telegram Bot API</a></li>
          <li>• <a href="https://t.me/BotFather" target="_blank" rel="noopener" style={{ color: "var(--primary)" }}>@BotFather (criar/gerenciar bots)</a></li>
        </ul>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span style={{ color: "var(--text-faint)" }}>{label}</span>
      <span className={`${mono ? "font-mono text-xs" : ""} truncate`} style={{ color: "var(--text)", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}
