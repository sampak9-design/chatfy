import { prisma } from "@/lib/db";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { getActiveBot, ownsSequence } from "@/lib/active-bot";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDelete } from "@/components/ConfirmDelete";

export const dynamic = "force-dynamic";

async function createSequence(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const bot = await getActiveBot();
  if (!bot) return;
  const seq = await prisma.sequence.create({ data: { botId: bot.id, name } });
  revalidatePath("/sequences");
  redirect(`/sequences/${seq.id}`);
}

async function deleteSequence(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  if (!(await ownsSequence(id))) return;
  await prisma.sequence.delete({ where: { id } });
  revalidatePath("/sequences");
}

export default async function SequencesPage() {
  const bot = await getActiveBot();
  if (!bot) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-semibold mb-2">Sequência de Disparos</h1>
        <p style={{ color: "var(--text-dim)" }}>Cadastre um bot primeiro em <Link href="/channels/telegram" style={{ color: "var(--primary)" }}>Canais</Link>.</p>
      </div>
    );
  }

  const sequences = await prisma.sequence.findMany({
    where: { botId: bot.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { steps: true, deliveries: true } } },
  });

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Sequência de Disparos</h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Funil por dia, individual pra cada lead. O Dia 1 começa quando a pessoa dá /start; os próximos avançam de 24 em 24h. Quem já entrou antes pega o dia que corresponde ao tempo dele.
        </p>
      </div>

      <form action={createSequence} className="card p-4 flex gap-3">
        <input name="name" required className="input flex-1" placeholder="Nome da sequência (ex.: Onboarding 60 dias)" />
        <button className="btn btn-primary"><Plus className="w-4 h-4" /> Criar</button>
      </form>

      <div className="space-y-3">
        {sequences.map((s) => (
          <div key={s.id} className="card p-5 card-hover flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(249,115,22,0.12)", color: "var(--primary)" }}>
              <CalendarClock className="w-5 h-5" />
            </div>
            <Link href={`/sequences/${s.id}`} className="flex-1 min-w-0">
              <div className="font-medium truncate flex items-center gap-2">
                {s.name}
                {s.active ? <span className="pill pill-success">ativa</span> : <span className="pill pill-muted">pausada</span>}
              </div>
              <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                {s._count.steps} dia(s) · {s._count.deliveries} entrega(s)
              </div>
            </Link>
            <ConfirmDelete
              title={`Excluir sequência "${s.name}"?`}
              description="A sequência e o histórico de entregas serão apagados. Os fluxos usados nela continuam existindo."
              formAction={deleteSequence}
              hiddenFields={{ id: s.id }}
              trigger={<Trash2 className="w-4 h-4" />}
            />
          </div>
        ))}
        {sequences.length === 0 && (
          <div className="card">
            <EmptyState
              icon={CalendarClock}
              title="Nenhuma sequência criada"
              description="Crie uma sequência acima e depois adicione os dias, cada um apontando pra um fluxo que você montou no editor."
              small
            />
          </div>
        )}
      </div>
    </div>
  );
}
