import { prisma } from "@/lib/db";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Workflow, Plus, Trash2 } from "lucide-react";
import { CopyFlowLink } from "@/components/CopyFlowLink";

export const dynamic = "force-dynamic";

async function createFlow(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const bot = await prisma.bot.findFirst({ orderBy: { createdAt: "asc" } });
  if (!bot) return;

  const flow = await prisma.flow.create({
    data: {
      botId: bot.id,
      name,
      graph: { nodes: [], edges: [] },
    },
  });
  revalidatePath("/flows");
  redirect(`/flows/${flow.id}`);
}

async function deleteFlow(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  await prisma.flow.delete({ where: { id } });
  revalidatePath("/flows");
}

export default async function FlowsPage() {
  const bot = await prisma.bot.findFirst({ orderBy: { createdAt: "asc" } });
  if (!bot) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-2">Fluxos</h1>
        <p style={{ color: "var(--text-dim)" }}>Cadastre um bot primeiro em <Link href="/bot" style={{ color: "var(--primary)" }}>Bot</Link>.</p>
      </div>
    );
  }
  const flows = await prisma.flow.findMany({ where: { botId: bot.id }, orderBy: { updatedAt: "desc" } });

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fluxos</h1>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>{flows.length} fluxo(s)</p>
        </div>
      </div>

      <form action={createFlow} className="card p-4 flex gap-3">
        <input name="name" required className="input flex-1" placeholder="Nome do novo fluxo" />
        <button className="btn btn-primary"><Plus className="w-4 h-4" /> Criar fluxo</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {flows.map((f) => {
          const deepLink = bot.username
            ? `https://t.me/${bot.username}?start=f_${f.id}`
            : null;
          return (
            <div key={f.id} className="card p-5 card-hover">
              <Link href={`/flows/${f.id}`} className="block">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(249,115,22,0.12)", color: "var(--primary)" }}>
                    <Workflow className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{f.name}</div>
                    <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                      {f.id === bot.welcomeFlowId && <span className="pill pill-info mr-2">Boas-vindas</span>}
                      Atualizado {f.updatedAt.toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>
              </Link>
              <div className="flex items-center justify-between gap-2">
                {deepLink ? <CopyFlowLink url={deepLink} compact /> : <span className="text-xs" style={{ color: "var(--text-faint)" }}>username do bot indisponível</span>}
                <form action={deleteFlow}>
                  <input type="hidden" name="id" value={f.id} />
                  <button className="btn btn-danger text-xs" style={{ padding: "4px 10px" }}><Trash2 className="w-3.5 h-3.5" /></button>
                </form>
              </div>
            </div>
          );
        })}
        {flows.length === 0 && (
          <div className="card p-8 text-center md:col-span-3" style={{ color: "var(--text-dim)" }}>
            Você ainda não criou nenhum fluxo.
          </div>
        )}
      </div>
    </div>
  );
}
