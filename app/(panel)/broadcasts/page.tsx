import { prisma } from "@/lib/db";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Megaphone, Plus, Trash2, StopCircle } from "lucide-react";
import { requestCancel } from "@/lib/broadcast-runner";
import { LocalTime } from "@/components/LocalTime";
import { getActiveBot } from "@/lib/active-bot";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDelete } from "@/components/ConfirmDelete";

export const dynamic = "force-dynamic";

async function deleteBroadcastFromList(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  requestCancel(id);
  await prisma.broadcast.delete({ where: { id } });
  revalidatePath("/broadcasts");
}

async function stopFromList(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const b = await prisma.broadcast.findUnique({ where: { id } });
  if (!b || (b.status !== "sending" && b.status !== "scheduled")) return;
  requestCancel(id);
  await prisma.broadcast.update({
    where: { id },
    data: { status: "done", finishedAt: new Date() },
  });
  revalidatePath("/broadcasts");
}

async function createDraft(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const bot = await getActiveBot();
  if (!bot) return;
  const b = await prisma.broadcast.create({
    data: { botId: bot.id, name, status: "draft" },
  });
  revalidatePath("/broadcasts");
  redirect(`/broadcasts/${b.id}`);
}

export default async function BroadcastsPage() {
  const bot = await getActiveBot();
  if (!bot) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-semibold mb-2">Disparos</h1>
        <p style={{ color: "var(--text-dim)" }}>Cadastre um bot primeiro em <Link href="/bot" style={{ color: "var(--primary)" }}>Bot</Link>.</p>
      </div>
    );
  }
  const list = await prisma.broadcast.findMany({ where: { botId: bot.id }, orderBy: { createdAt: "desc" } });

  return (
    <div className="p-4 md:p-8 space-y-5">
      <h1 className="text-2xl font-semibold">Disparos</h1>

      <form action={createDraft} className="card p-4 flex gap-3">
        <input name="name" required className="input flex-1" placeholder="Nome do disparo (interno)" />
        <button className="btn btn-primary"><Plus className="w-4 h-4" /> Novo disparo</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 720 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
              <th className="text-left font-medium px-4 py-3">Nome</th>
              <th className="text-left font-medium px-4 py-3">Status</th>
              <th className="text-right font-medium px-4 py-3">Alvo</th>
              <th className="text-right font-medium px-4 py-3">Enviadas</th>
              <th className="text-right font-medium px-4 py-3">Falhas</th>
              <th className="text-right font-medium px-4 py-3">Bloqueios</th>
              <th className="text-left font-medium px-4 py-3">Agendado</th>
              <th className="text-left font-medium px-4 py-3">Criado</th>
              <th className="text-right font-medium px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={9} className="p-0">
                <EmptyState
                  icon={Megaphone}
                  title="Nenhum disparo ainda"
                  description="Crie acima sua primeira campanha de envio em massa."
                  small
                />
              </td></tr>
            ) : list.map((b) => (
              <tr key={b.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-4 py-3">
                  <Link href={`/broadcasts/${b.id}`} className="flex items-center gap-2 hover:underline">
                    <Megaphone className="w-4 h-4" style={{ color: "var(--text-faint)" }} />
                    {b.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`pill ${b.status === "done" ? "pill-success" : b.status === "failed" ? "pill-danger" : b.status === "sending" ? "pill-warning" : b.status === "scheduled" ? "pill-info" : "pill-muted"}`}>{b.status}</span>
                </td>
                <td className="px-4 py-3 text-right">{b.totalTargets}</td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--success)" }}>{b.sentCount}</td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--danger)" }}>{b.failedCount}</td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--warning)" }}>{b.blockedCount}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-dim)" }}>{b.scheduledFor ? <LocalTime iso={b.scheduledFor.toISOString()} /> : "—"}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-faint)" }}><LocalTime iso={b.createdAt.toISOString()} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {(b.status === "sending" || b.status === "scheduled") && (
                      <form action={stopFromList}>
                        <input type="hidden" name="id" value={b.id} />
                        <button type="submit" className="btn btn-ghost text-xs" style={{ padding: "4px 8px", color: "var(--warning)" }} title="Parar envio">
                          <StopCircle className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    )}
                    <ConfirmDelete
                      title={`Excluir disparo "${b.name}"?`}
                      description="Vai apagar o disparo e todos os logs. Não pode ser desfeito."
                      formAction={deleteBroadcastFromList}
                      hiddenFields={{ id: b.id }}
                      trigger={<Trash2 className="w-3.5 h-3.5" />}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
