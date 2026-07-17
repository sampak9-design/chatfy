import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Workflow, PauseCircle, PlayCircle, CheckCircle2 } from "lucide-react";
import { ownsSequence } from "@/lib/active-bot";
import { requireOwnerId } from "@/lib/auth";
import { LocalTime } from "@/components/LocalTime";
import { ConfirmDelete } from "@/components/ConfirmDelete";

export const dynamic = "force-dynamic";

async function addStep(formData: FormData) {
  "use server";
  const sequenceId = String(formData.get("sequenceId"));
  if (!(await ownsSequence(sequenceId))) return;
  const day = Math.max(1, parseInt(String(formData.get("day") || "1")) || 1);
  const flowId = String(formData.get("flowId") || "");
  if (!flowId) return;
  // Guard: the flow must belong to the same bot as the sequence.
  const seq = await prisma.sequence.findUnique({ where: { id: sequenceId }, select: { botId: true } });
  const flow = await prisma.flow.findFirst({ where: { id: flowId, botId: seq?.botId }, select: { id: true } });
  if (!flow) return;
  await prisma.sequenceStep.upsert({
    where: { sequenceId_day: { sequenceId, day } },
    create: { sequenceId, day, flowId },
    update: { flowId },
  });
  revalidatePath(`/sequences/${sequenceId}`);
}

async function deleteStep(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const step = await prisma.sequenceStep.findUnique({ where: { id }, select: { sequenceId: true } });
  if (!step || !(await ownsSequence(step.sequenceId))) return;
  await prisma.sequenceStep.delete({ where: { id } });
  revalidatePath(`/sequences/${step.sequenceId}`);
}

async function toggleActive(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  if (!(await ownsSequence(id))) return;
  const seq = await prisma.sequence.findUnique({ where: { id }, select: { active: true } });
  if (!seq) return;
  await prisma.sequence.update({ where: { id }, data: { active: !seq.active } });
  revalidatePath(`/sequences/${id}`);
}

export default async function SequenceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOwnerId();
  if (!(await ownsSequence(id))) notFound();

  const seq = await prisma.sequence.findUnique({
    where: { id },
    include: {
      bot: true,
      steps: { include: { flow: true }, orderBy: { day: "asc" } },
    },
  });
  if (!seq) notFound();

  const [flows, sentCount, recent] = await Promise.all([
    prisma.flow.findMany({ where: { botId: seq.botId }, orderBy: { name: "asc" } }),
    prisma.sequenceDelivery.count({ where: { sequenceId: id, status: "sent" } }),
    prisma.sequenceDelivery.findMany({
      where: { sequenceId: id, status: "sent" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { lead: true, step: true },
    }),
  ]);

  const nextDay = (seq.steps.at(-1)?.day ?? 0) + 1;

  return (
    <div className="p-4 md:p-8 max-w-4xl space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/sequences" className="btn btn-ghost" style={{ padding: "6px 10px" }}><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-2xl font-semibold flex-1 min-w-0 truncate">{seq.name}</h1>
        {seq.active ? <span className="pill pill-success">ativa</span> : <span className="pill pill-muted">pausada</span>}
        <form action={toggleActive}>
          <input type="hidden" name="id" value={seq.id} />
          <button className="btn btn-ghost">
            {seq.active ? <><PauseCircle className="w-4 h-4" /> Pausar</> : <><PlayCircle className="w-4 h-4" /> Ativar</>}
          </button>
        </form>
      </div>

      {flows.length === 0 && (
        <div className="card p-4 text-sm" style={{ color: "var(--text-dim)" }}>
          Você ainda não tem fluxos neste bot. Crie os fluxos de cada dia em <Link href="/flows" style={{ color: "var(--primary)" }}>Fluxos</Link> e volte aqui pra montá-los na sequência.
        </div>
      )}

      {/* Add / edit a day */}
      <form action={addStep} className="card p-5 space-y-3">
        <h2 className="font-semibold">Adicionar dia</h2>
        <input type="hidden" name="sequenceId" value={seq.id} />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Dia</label>
            <input type="number" name="day" min={1} defaultValue={nextDay} className="input" style={{ width: 90 }} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="label">Fluxo a enviar nesse dia</label>
            <select name="flowId" required className="input" defaultValue="">
              <option value="" disabled>— escolha um fluxo —</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary"><Plus className="w-4 h-4" /> Salvar dia</button>
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          Dia 1 = na entrada (/start). Dia 2 = 24h depois. Dia 3 = +24h… Se salvar um dia que já existe, ele é substituído.
        </p>
      </form>

      {/* Steps list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 font-semibold" style={{ borderBottom: "1px solid var(--border)" }}>
          Jornada ({seq.steps.length} dia{seq.steps.length === 1 ? "" : "s"})
        </div>
        {seq.steps.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-faint)" }}>
            Nenhum dia ainda. Adicione o Dia 1 acima.
          </div>
        ) : (
          <ul>
            {seq.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-4 px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="w-14 shrink-0">
                  <span className="pill pill-info">Dia {step.day}</span>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0" style={{ color: "var(--text)" }}>
                  <Workflow className="w-4 h-4 shrink-0" style={{ color: "var(--text-dim)" }} />
                  <Link href={`/flows/${step.flowId}`} className="truncate hover:underline">{step.flow.name}</Link>
                </div>
                <ConfirmDelete
                  title={`Remover o Dia ${step.day}?`}
                  description="O dia sai da sequência. Entregas já feitas continuam no histórico."
                  formAction={deleteStep}
                  hiddenFields={{ id: step.id }}
                  trigger={<Trash2 className="w-4 h-4" />}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Who received */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 font-semibold flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <CheckCircle2 className="w-4 h-4" style={{ color: "var(--success)" }} />
          Quem recebeu
          <span className="ml-auto text-sm font-normal" style={{ color: "var(--text-dim)" }}>{sentCount} envio(s)</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
              <th className="text-left font-medium px-4 py-2">Lead</th>
              <th className="text-left font-medium px-4 py-2">Dia</th>
              <th className="text-left font-medium px-4 py-2">Quando</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-6" style={{ color: "var(--text-faint)" }}>Nenhum envio ainda.</td></tr>
            ) : recent.map((d) => (
              <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-4 py-2">
                  {`${d.lead.firstName ?? ""} ${d.lead.username ? `@${d.lead.username}` : ""}`.trim() || d.lead.telegramId}
                </td>
                <td className="px-4 py-2"><span className="pill pill-info">Dia {d.step.day}</span></td>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--text-faint)" }}><LocalTime iso={d.createdAt.toISOString()} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
