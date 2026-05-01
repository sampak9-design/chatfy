import { prisma } from "@/lib/db";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Activity, Plus, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

async function createFunnel(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const bot = await prisma.bot.findFirst({ orderBy: { createdAt: "asc" } });
  if (!bot) return;

  // Pre-seed with a basic linear funnel: Visita → Lead → Cadastro → Depósito
  const baseGraph = {
    nodes: [
      { id: "n1", type: "funnel", position: { x: 100, y: 60 }, data: { kind: "pageview", label: "Visita à landing" } },
      { id: "n2", type: "funnel", position: { x: 100, y: 240 }, data: { kind: "lead", label: "Iniciou no Telegram" } },
      { id: "n3", type: "funnel", position: { x: 100, y: 420 }, data: { kind: "registered", label: "Cadastrou na corretora" } },
      { id: "n4", type: "funnel", position: { x: 100, y: 600 }, data: { kind: "deposited", label: "Depositou" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", animated: true },
      { id: "e2", source: "n2", target: "n3", animated: true },
      { id: "e3", source: "n3", target: "n4", animated: true },
    ],
  };

  const funnel = await prisma.funnel.create({
    data: { botId: bot.id, name, graph: baseGraph },
  });
  revalidatePath("/track");
  redirect(`/track/${funnel.id}`);
}

async function deleteFunnel(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  await prisma.funnel.delete({ where: { id } });
  revalidatePath("/track");
}

export default async function TrackPage() {
  const bot = await prisma.bot.findFirst({ orderBy: { createdAt: "asc" } });
  if (!bot) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-2">Track</h1>
        <p style={{ color: "var(--text-dim)" }}>Cadastre um bot primeiro em <Link href="/bot" style={{ color: "var(--primary)" }}>Bot</Link>.</p>
      </div>
    );
  }
  const funnels = await prisma.funnel.findMany({ where: { botId: bot.id }, orderBy: { updatedAt: "desc" } });

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center gap-3">
        <Activity className="w-6 h-6" style={{ color: "var(--primary)" }} />
        <div>
          <h1 className="text-2xl font-semibold">Track</h1>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>Funis visuais ao vivo (estilo Funnelytics)</p>
        </div>
      </div>

      <form action={createFunnel} className="card p-4 flex gap-3">
        <input name="name" required className="input flex-1" placeholder="Nome do funil (ex: Apollo - Black Friday)" />
        <button className="btn btn-primary"><Plus className="w-4 h-4" /> Criar funil</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {funnels.map((f) => (
          <div key={f.id} className="card p-5 card-hover">
            <Link href={`/track/${f.id}`} className="block">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(34,197,94,0.12)", color: "var(--success)" }}>
                  <Activity className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{f.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                    Atualizado {f.updatedAt.toLocaleDateString("pt-BR")}
                  </div>
                </div>
              </div>
            </Link>
            <form action={deleteFunnel} className="flex justify-end">
              <input type="hidden" name="id" value={f.id} />
              <button className="btn btn-danger text-xs" style={{ padding: "4px 10px" }}><Trash2 className="w-3.5 h-3.5" /></button>
            </form>
          </div>
        ))}
        {funnels.length === 0 && (
          <div className="card p-8 text-center md:col-span-3" style={{ color: "var(--text-dim)" }}>
            Você ainda não criou nenhum funil. Crie um acima — ele já vem com 4 etapas pré-configuradas.
          </div>
        )}
      </div>
    </div>
  );
}
