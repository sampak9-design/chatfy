import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { tgGetMe, tgSetWebhook, tgDeleteWebhook } from "@/lib/telegram";
import { nanoid } from "nanoid";
import { Bot as BotIcon, Webhook, Trash2 } from "lucide-react";

async function createBot(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  const token = String(formData.get("token") || "").trim();
  if (!name || !token) return;

  const me = (await tgGetMe(token)) as { ok: boolean; result?: { username?: string } };
  const username = me.ok ? me.result?.username : undefined;

  const bot = await prisma.bot.create({
    data: { name, token, username, webhookSecret: nanoid(32) },
  });

  const appUrl = process.env.APP_URL;
  if (appUrl) {
    await tgSetWebhook(token, `${appUrl}/api/telegram/${bot.id}`, bot.webhookSecret);
  }
  revalidatePath("/bot");
  redirect("/bot");
}

async function setWelcome(formData: FormData) {
  "use server";
  const botId = String(formData.get("botId"));
  const flowId = String(formData.get("flowId"));
  await prisma.bot.update({
    where: { id: botId },
    data: { welcomeFlowId: flowId || null },
  });
  revalidatePath("/bot");
}

async function reregisterWebhook(formData: FormData) {
  "use server";
  const botId = String(formData.get("botId"));
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) return;
  const appUrl = process.env.APP_URL;
  if (!appUrl) return;
  await tgSetWebhook(bot.token, `${appUrl}/api/telegram/${bot.id}`, bot.webhookSecret);
  revalidatePath("/bot");
}

async function deleteBot(formData: FormData) {
  "use server";
  const botId = String(formData.get("botId"));
  const bot = await prisma.bot.findUnique({ where: { id: botId } });
  if (!bot) return;
  await tgDeleteWebhook(bot.token).catch(() => {});
  await prisma.bot.delete({ where: { id: botId } });
  revalidatePath("/bot");
  redirect("/bot");
}

export default async function BotPage() {
  const bot = await prisma.bot.findFirst({ orderBy: { createdAt: "asc" } });
  const flows = bot ? await prisma.flow.findMany({ where: { botId: bot.id }, orderBy: { name: "asc" } }) : [];
  const appUrl = process.env.APP_URL || "(defina APP_URL nas envs)";

  if (!bot) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold mb-1">Configurar bot</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-dim)" }}>Crie um bot com o @BotFather e cole o token aqui.</p>

        <form action={createBot} className="card p-6 space-y-4">
          <div>
            <label className="label">Nome do bot</label>
            <input name="name" required className="input" placeholder="Meu bot principal" />
          </div>
          <div>
            <label className="label">Token do BotFather</label>
            <input name="token" required className="input font-mono text-xs" placeholder="123456:ABC-DEF..." />
            <p className="text-xs mt-2" style={{ color: "var(--text-faint)" }}>O token nunca é exposto no frontend após salvo.</p>
          </div>
          <button type="submit" className="btn btn-primary">Cadastrar e registrar webhook</button>
        </form>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bot</h1>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Configurações e webhook.</p>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(249,115,22,0.12)", color: "var(--primary)" }}>
            <BotIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold">{bot.name}</div>
            <div className="text-xs" style={{ color: "var(--text-faint)" }}>{bot.username ? `@${bot.username}` : "—"}</div>
          </div>
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

      <div className="flex gap-3">
        <form action={reregisterWebhook}>
          <input type="hidden" name="botId" value={bot.id} />
          <button type="submit" className="btn btn-ghost"><Webhook className="w-4 h-4" /> Reregistrar webhook</button>
        </form>
        <form action={deleteBot}>
          <input type="hidden" name="botId" value={bot.id} />
          <button type="submit" className="btn btn-danger"><Trash2 className="w-4 h-4" /> Remover bot</button>
        </form>
      </div>
    </div>
  );
}
