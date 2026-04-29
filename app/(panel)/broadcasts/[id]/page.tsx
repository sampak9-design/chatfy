import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Send, Save } from "lucide-react";
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

  const broadcast = await prisma.broadcast.findUnique({ where: { id } });
  if (!broadcast) return;
  if (broadcast.status !== "draft" && broadcast.status !== "failed") return; // safety

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
      status: "sending",
      startedAt: new Date(),
      totalTargets: leads.length,
      sentCount: 0,
      failedCount: 0,
      blockedCount: 0,
      targetFilter: { status, origin: origin || undefined },
    },
  });

  const queue = getBroadcastQueue();
  await queue.addBulk(
    leads.map((l) => ({
      name: "send",
      data: { broadcastId: id, leadId: l.id },
      opts: { jobId: `${id}:${l.id}` }, // dedup key
    })),
  );

  revalidatePath(`/broadcasts/${id}`);
  redirect(`/broadcasts/${id}`);
}

export default async function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await prisma.broadcast.findUnique({ where: { id } });
  if (!b) notFound();

  const editable = b.status === "draft" || b.status === "failed";
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

      {!editable ? (
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
            <h2 className="font-semibold">Enviar agora</h2>
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
            <button type="submit" className="btn btn-primary"><Send className="w-4 h-4" /> Disparar</button>
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              Os jobs vão para a fila Redis e o worker envia respeitando o limite do Telegram (~25/s).
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
