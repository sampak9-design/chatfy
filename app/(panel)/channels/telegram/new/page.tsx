import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { tgGetMe, tgSetWebhook } from "@/lib/telegram";
import { nanoid } from "nanoid";
import { setActiveBot } from "@/lib/active-bot";

export const dynamic = "force-dynamic";

async function createBot(formData: FormData) {
  "use server";
  const name = String(formData.get("name") || "").trim();
  const token = String(formData.get("token") || "").trim();
  if (!name || !token) return;

  const me = (await tgGetMe(token)) as { ok: boolean; result?: { username?: string } };
  const username = me.ok ? me.result?.username : undefined;

  const bot = await prisma.bot.create({
    data: { name, token, username, channel: "telegram", webhookSecret: nanoid(32) },
  });

  const appUrl = process.env.APP_URL;
  if (appUrl) {
    await tgSetWebhook(token, `${appUrl}/api/telegram/${bot.id}`, bot.webhookSecret);
  }
  await setActiveBot(bot.id);
  revalidatePath("/channels/telegram");
  redirect(`/channels/telegram/${bot.id}`);
}

export default function NewBotPage() {
  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/channels/telegram" className="btn btn-ghost" style={{ padding: "6px 10px" }}><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-2xl font-semibold">Conectar novo bot Telegram</h1>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--text-dim)" }}>
        Crie um bot com o <a href="https://t.me/BotFather" target="_blank" rel="noopener" style={{ color: "var(--primary)" }}>@BotFather</a> e cole o token aqui.
      </p>

      <form action={createBot} className="card p-6 space-y-4">
        <div>
          <label className="label">Nome do bot (interno)</label>
          <input name="name" required className="input" placeholder="Meu bot principal" />
        </div>
        <div>
          <label className="label">Token do BotFather</label>
          <input name="token" required className="input font-mono text-xs" placeholder="123456:ABC-DEF..." />
          <p className="text-xs mt-2" style={{ color: "var(--text-faint)" }}>O token nunca é exposto no frontend após salvo.</p>
        </div>
        <button type="submit" className="btn btn-primary">Conectar bot</button>
      </form>
    </div>
  );
}
