import { getSession, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { User, KeyRound, Server, ExternalLink, Users, Plus } from "lucide-react";
import { ConfirmDelete } from "@/components/ConfirmDelete";

export const dynamic = "force-dynamic";

async function createAccount(formData: FormData) {
  "use server";
  if (!(await isSuperAdmin())) return;
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim() || null;
  if (!email || password.length < 6) return;

  const exists = await prisma.adminUser.findUnique({ where: { email }, select: { id: true } });
  if (exists) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.create({ data: { email, passwordHash, name, isSuperAdmin: false } });
  revalidatePath("/settings");
}

async function deleteAccount(formData: FormData) {
  "use server";
  if (!(await isSuperAdmin())) return;
  const session = await getSession();
  const id = String(formData.get("id"));
  if (!id || id === session?.sub) return; // never delete yourself
  const target = await prisma.adminUser.findUnique({ where: { id }, select: { isSuperAdmin: true } });
  if (!target || target.isSuperAdmin) return; // never delete a super-admin
  // Bots (and everything under them) cascade-delete via the ownerId relation.
  await prisma.adminUser.delete({ where: { id } });
  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const session = await getSession();
  const user = session ? await prisma.adminUser.findUnique({ where: { id: session.sub } }) : null;
  const superAdmin = !!user?.isSuperAdmin;
  const ownerId = session?.sub;
  const appUrl = process.env.APP_URL || "(não configurado)";

  const [botCount, leadCount, accounts] = await Promise.all([
    prisma.bot.count({ where: { ownerId } }),
    prisma.lead.count({ where: { bot: { ownerId } } }),
    superAdmin
      ? prisma.adminUser.findMany({
          orderBy: { createdAt: "asc" },
          select: { id: true, email: true, name: true, isSuperAdmin: true, createdAt: true, _count: { select: { bots: true } } },
        })
      : Promise.resolve([]),
  ]);

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
          {superAdmin && <span className="pill pill-info ml-auto">super-admin</span>}
        </div>
        <Row label="E-mail" value={user?.email || session?.email || "—"} />
        <Row label="Nome" value={user?.name || "—"} />
        <Row label="Criado em" value={user?.createdAt.toLocaleDateString("pt-BR") || "—"} />
      </div>

      {superAdmin && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
            <h2 className="font-semibold">Contas</h2>
          </div>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Crie uma conta separada pra cada projeto. Cada conta só enxerga os próprios bots, fluxos, leads e funis.
          </p>

          <form action={createAccount} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input name="email" type="email" required className="input" placeholder="projeto2@email.com" />
            <input name="name" className="input" placeholder="Nome (opcional)" />
            <input name="password" type="password" required minLength={6} className="input" placeholder="Senha (mín. 6)" />
            <div className="sm:col-span-3">
              <button type="submit" className="btn btn-primary"><Plus className="w-4 h-4" /> Criar conta</button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
                  <th className="text-left font-medium px-4 py-2">E-mail</th>
                  <th className="text-left font-medium px-4 py-2">Nome</th>
                  <th className="text-right font-medium px-4 py-2">Bots</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-4 py-2">
                      {a.email}
                      {a.isSuperAdmin && <span className="pill pill-info ml-2">super</span>}
                      {a.id === session?.sub && <span className="pill pill-muted ml-2">você</span>}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-dim)" }}>{a.name || "—"}</td>
                    <td className="px-4 py-2 text-right">{a._count.bots}</td>
                    <td className="px-4 py-2 text-right">
                      {!a.isSuperAdmin && a.id !== session?.sub && (
                        <ConfirmDelete
                          title={`Excluir conta "${a.email}"?`}
                          description="Todos os bots, fluxos, leads e funis dessa conta serão apagados permanentemente. Não pode ser desfeito."
                          formAction={deleteAccount}
                          hiddenFields={{ id: a.id }}
                          trigger={<>Excluir</>}
                          triggerClassName="btn btn-danger"
                          triggerStyle={{ padding: "4px 10px" }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
          A senha do super-admin é definida via variáveis de ambiente (<code>ADMIN_PASSWORD</code>) e aplicada no primeiro boot.
          As demais contas são criadas aqui em cima com senha própria.
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
