import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Webhook, Trash2, Send, PauseCircle, PlayCircle } from "lucide-react";
import { tgSetWebhook, tgDeleteWebhook } from "@/lib/telegram";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { getOwnedBot } from "@/lib/active-bot";

export const dynamic = "force-dynamic";

async function setWelcome(formData: FormData) {
  "use server";
  const botId = String(formData.get("botId"));
  const flowId = String(formData.get("flowId"));
  const bot = await getOwnedBot(botId);
  if (!bot) return;
  await prisma.bot.update({
    where: { id: botId },
    data: { welcomeFlowId: flowId || null },
  });
  revalidatePath(`/channels/telegram/${botId}`);
  redirect(`/channels/telegram/${botId}?saved=1`);
}

async function reregisterWebhook(formData: FormData) {
  "use server";
  const botId = String(formData.get("botId"));
  const bot = await getOwnedBot(botId);
  if (!bot) return;
  const appUrl = process.env.APP_URL;
  if (!appUrl) return;
  await tgSetWebhook(bot.token, `${appUrl}/api/telegram/${bot.id}`, bot.webhookSecret);
  revalidatePath(`/channels/telegram/${botId}`);
}

async function togglePause(formData: FormData) {
  "use server";
  const botId = String(formData.get("botId"));
  const bot = await getOwnedBot(botId);
  if (!bot) return;
  await prisma.bot.update({ where: { id: botId }, data: { paused: !bot.paused } });
  revalidatePath(`/channels/telegram/${botId}`);
}

async function deleteBot(formData: FormData) {
  "use server";
  const botId = String(formData.get("id"));
  const bot = await getOwnedBot(botId);
  if (!bot) return;
  await tgDeleteWebhook(bot.token).catch(() => {});
  await prisma.bot.delete({ where: { id: botId } });
  revalidatePath("/channels/telegram");
  redirect("/channels/telegram");
}

export default async function BotEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bot = await getOwnedBot(id);
  if (!bot) notFound();
  const flows = await prisma.flow.findMany({ where: { botId: bot.id }, orderBy: { name: "asc" } });
  const appUrl = process.env.APP_URL || "(defina APP_URL nas envs)";

  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/channels/telegram" className="btn btn-ghost" style={{ padding: "6px 10px" }}><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-2xl font-semibold flex-1 min-w-0 truncate">{bot.name}</h1>
        <form action={togglePause}>
          <input type="hidden" name="botId" value={bot.id} />
          <button type="submit" className="btn btn-ghost">
            {bot.paused ? <><PlayCircle className="w-4 h-4" /> Retomar</> : <><PauseCircle className="w-4 h-4" /> Pausar</>}
          </button>
        </form>
        <ConfirmDelete
          title={`Excluir bot "${bot.name}"?`}
          description="O webhook do Telegram será removido e todos os leads, fluxos e disparos vinculados a esse bot serão apagados. Não pode ser desfeito."
          formAction={deleteBot}
          hiddenFields={{ id: bot.id }}
          trigger={<><Trash2 className="w-4 h-4" /> Excluir</>}
          triggerClassName="btn btn-danger"
          triggerStyle={{}}
        />
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,158,217,0.12)", color: "#229ed9" }}>
            <Send className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold">{bot.name}</div>
            <div className="text-xs" style={{ color: "var(--text-faint)" }}>{bot.username ? `@${bot.username}` : "—"}</div>
          </div>
          {bot.paused && <span className="pill pill-warning ml-auto">pausado</span>}
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <div className="label">Token</div>
            <div className="font-mono text-xs px-3 py-2 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
              ••••••••••••••••••••{bot.token.slice(-6)}
            </div>
          </div>
          <div>
            <div className="label">Webhook URL</div>
            <div className="font-mono text-xs px-3 py-2 rounded-lg break-all" style={{ background: "var(--surface-2)" }}>
              {appUrl}/api/telegram/{bot.id}
            </div>
          </div>
        </div>
      </div>

      <form action={setWelcome} className="card p-6 space-y-4">
        <h2 className="font-semibold">Fluxo de boas-vindas</h2>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>Disparado automaticamente quando alguém envia /start.</p>
        <input type="hidden" name="botId" value={bot.id} />
        <select name="flowId" defaultValue={bot.welcomeFlowId || ""} className="input">
          <option value="">— sem fluxo —</option>
          {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button type="submit" className="btn btn-primary">Salvar</button>
      </form>

      <form action={reregisterWebhook}>
        <input type="hidden" name="botId" value={bot.id} />
        <button type="submit" className="btn btn-ghost"><Webhook className="w-4 h-4" /> Reregistrar webhook</button>
      </form>
    </div>
  );
}
