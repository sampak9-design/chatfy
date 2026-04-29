import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Send, Save, Calendar, X } from "lucide-react";
import { getBroadcastQueue } from "@/lib/queue/broadcast-queue";
import { ButtonsEditorClient } from "@/components/BroadcastButtonsEditor";
import type { StepType, LeadStatus, LeadOrigin } from "@prisma/client";

export const dynamic = "force-dynamic";

interface ButtonItem { id: string; label: string; url: string }

async function saveDraft(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const text = String(formData.get("text") || "");
  const mediaUrl = String(formData.get("mediaUrl") || "").trim() || null;
  const mediaType = (String(formData.get("mediaType") || "") || null) as StepType | null;
  const buttonsRaw = String(formData.get("buttons") || "[]");

  let buttons: ButtonItem[] = [];
  try { buttons = JSON.parse(buttonsRaw); } catch { /* ignore */ }

  // Convert buttons to Telegram inline keyboard rows: each button on its own row, url type only.
  const inlineRows = buttons
    .filter((b) => b.label && b.url)
    .map((b) => [{ text: b.label, url: b.url }]);

  await prisma.broadcast.update({
    where: { id },
    data: {
      text: text || null,
      mediaUrl,
      mediaType: mediaUrl ? mediaType : null,
      buttons: inlineRows.length > 0 ? inlineRows : undefined,
    },
  });

  revalidatePath(`/broadcasts/${id}`);
}

async function sendBroadcast(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const status = String(formData.get("targetStatus") || "active") as LeadStatus;
  const origin = String(formData.get("targetOrigin") || "");
  const scheduledForRaw = String(formData.get("scheduledFor") || "").trim();

  const broadcast = await prisma.broadcast.findUnique({ where: { id } });
  if (!broadcast) return;
  if (broadcast.status !== "draft" && broadcast.status !== "failed" && broadcast.status !== "scheduled") return;

  // Parse schedule. Empty = send now. We treat the input as the user's local time
  // (datetime-local), which is what the browser hands us — convert to ms delay.
  let scheduledFor: Date | null = null;
  let delayMs = 0;
  if (scheduledForRaw) {
    const parsed = new Date(scheduledForRaw);
    if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now() + 5_000) {
      scheduledFor = parsed;
      delayMs = parsed.getTime() - Date.now();
    }
  }

  const where = {
    botId: broadcast.botId,
    status,
    ...(origin ? { origin: origin as LeadOrigin } : {}),
  };

  const leads = await prisma.lead.findMany({ where, select: { id: true } });
  if (leads.length === 0) {
    await prisma.broadcast.update({ where: { id }, data: { status: "done", finishedAt: new Date(), totalTargets: 0 } });
    revalidatePath(`/broadcasts/${id}`);
    return;
  }

  await prisma.broadcast.update({
    where: { id },
    data: {
      status: scheduledFor ? "scheduled" : "sending",
      scheduledFor,
      startedAt: scheduledFor ? null : new Date(),
      totalTargets: leads.length,
      sentCount: 0,
      failedCount: 0,
      blockedCount: 0,
      finishedAt: null,
      targetFilter: { status, origin: origin || undefined },
    },
  });

  const queue = getBroadcastQueue();
  await queue.addBulk(
    leads.map((l) => ({
      name: "send",
      data: { broadcastId: id, leadId: l.id },
      opts: {
        jobId: `${id}:${l.id}`,
        ...(delayMs > 0 ? { delay: delayMs } : {}),
      },
    })),
  );

  revalidatePath(`/broadcasts/${id}`);
  redirect(`/broadcasts/${id}`);
}

async function cancelSchedule(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const broadcast = await prisma.broadcast.findUnique({ where: { id } });
  if (!broadcast || broadcast.status !== "scheduled") return;

  // Remove all queued (delayed) jobs belonging to this broadcast.
  const queue = getBroadcastQueue();
  const jobs = await queue.getJobs(["delayed", "waiting"]);
  await Promise.all(
    jobs
      .filter((j) => j.data.broadcastId === id)
      .map((j) => j.remove().catch(() => {})),
  );

  await prisma.broadcast.update({
    where: { id },
    data: { status: "draft", scheduledFor: null, totalTargets: 0 },
  });
  revalidatePath(`/broadcasts/${id}`);
}

export default async function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await prisma.broadcast.findUnique({ where: { id } });
  if (!b) notFound();

  const editable = b.status === "draft" || b.status === "failed";
  const isScheduled = b.status === "scheduled";
  const buttons: ButtonItem[] = (() => {
    const raw = b.buttons as unknown as { text: string; url: string }[][] | null;
    if (!Array.isArray(raw)) return [];
    return raw.flat().map((btn, i) => ({ id: `b${i}`, label: btn.text, url: btn.url }));
  })();

  return (
    <div className="p-8 max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/broadcasts" className="btn btn-ghost" style={{ padding: "6px 10px" }}><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-2xl font-semibold">{b.name}</h1>
        <span className={`pill ${b.status === "done" ? "pill-success" : b.status === "failed" ? "pill-danger" : b.status === "sending" ? "pill-warning" : "pill-muted"}`}>{b.status}</span>
      </div>

      {isScheduled ? (
        <div className="card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(59,130,246,0.12)", color: "var(--info)" }}>
              <Calendar className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-medium">Agendado para {b.scheduledFor ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(b.scheduledFor) : "—"}</div>
              <div className="text-sm" style={{ color: "var(--text-dim)" }}>Alvo: {b.totalTargets} lead(s). O envio começa automaticamente no horário marcado.</div>
            </div>
          </div>
          <form action={cancelSchedule}>
            <input type="hidden" name="id" value={b.id} />
            <button type="submit" className="btn btn-danger"><X className="w-4 h-4" /> Cancelar agendamento</button>
          </form>
        </div>
      ) : !editable ? (
        <div className="card p-6 space-y-3">
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>Este disparo já foi enviado e não pode mais ser editado.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Alvo" value={b.totalTargets} />
            <Stat label="Enviadas" value={b.sentCount} accent="var(--success)" />
            <Stat label="Falhas" value={b.failedCount} accent="var(--danger)" />
            <Stat label="Bloqueios" value={b.blockedCount} accent="var(--warning)" />
          </div>
        </div>
      ) : (
        <>
          <form action={saveDraft} className="card p-6 space-y-4" id="draft-form">
            <input type="hidden" name="id" value={b.id} />
            <div>
              <label className="label">Mensagem</label>
              <textarea name="text" defaultValue={b.text || ""} rows={5} className="input" placeholder="Texto do disparo (suporta HTML)" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">URL de mídia (opcional)</label>
                <input name="mediaUrl" defaultValue={b.mediaUrl || ""} className="input" placeholder="https://exemplo.com/imagem.jpg" />
              </div>
              <div>
                <label className="label">Tipo de mídia</label>
                <select name="mediaType" defaultValue={b.mediaType || ""} className="input">
                  <option value="">— sem mídia —</option>
                  <option value="image">Imagem</option>
                  <option value="video">Vídeo</option>
                  <option value="audio">Áudio</option>
                  <option value="document">Documento</option>
                </select>
              </div>
            </div>

            <ButtonsEditor initial={buttons} />

            <button type="submit" className="btn btn-primary"><Save className="w-4 h-4" /> Salvar rascunho</button>
          </form>

          <form action={sendBroadcast} className="card p-6 space-y-4">
            <input type="hidden" name="id" value={b.id} />
            <h2 className="font-semibold">Enviar / agendar</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Status do lead</label>
                <select name="targetStatus" defaultValue="active" className="input">
                  <option value="active">Ativos</option>
                  <option value="blocked">Bloqueados</option>
                </select>
              </div>
              <div>
                <label className="label">Origem (opcional)</label>
                <select name="targetOrigin" defaultValue="" className="input">
                  <option value="">Todas</option>
                  <option value="start">/start</option>
                  <option value="button">Botão</option>
                  <option value="campaign">Campanha</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Agendar para (opcional)</label>
              <input
                name="scheduledFor"
                type="datetime-local"
                className="input"
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                Deixe em branco para disparar agora. Se preencher, os jobs ficam parados no Redis até o horário marcado.
              </p>
            </div>
            <button type="submit" className="btn btn-primary"><Send className="w-4 h-4" /> Disparar / Agendar</button>
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              Variáveis suportadas no texto: <code>{"{first_name}"}</code>, <code>{"{username}"}</code>, <code>{"{full_name}"}</code>, <code>{"{source}"}</code>.
              Worker respeita ~25 msg/s do Telegram.
            </p>
          </form>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="text-xl font-semibold mt-1" style={{ color: accent || "var(--text)" }}>{value}</div>
    </div>
  );
}

function ButtonsEditor({ initial }: { initial: ButtonItem[] }) {
  return (
    <div>
      <label className="label">Botões (link externo)</label>
      <ButtonsEditorClient initial={initial} />
    </div>
  );
}
