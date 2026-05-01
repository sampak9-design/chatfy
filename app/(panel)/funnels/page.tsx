import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Plus, Trash2, Filter as FunnelIcon, Settings as SettingsIcon } from "lucide-react";
import { CopyFlowLink } from "@/components/CopyFlowLink";
import { EmbedSnippet } from "@/components/EmbedSnippet";
import { nanoid } from "nanoid";

export const dynamic = "force-dynamic";

async function saveMetaConfig(formData: FormData) {
  "use server";
  const botId = String(formData.get("botId"));
  const metaPixelId = String(formData.get("metaPixelId") || "").trim() || null;
  const metaAccessToken = String(formData.get("metaAccessToken") || "").trim() || null;
  const metaTestCode = String(formData.get("metaTestCode") || "").trim() || null;

  await prisma.bot.update({
    where: { id: botId },
    data: { metaPixelId, metaAccessToken, metaTestCode },
  });
  revalidatePath("/funnels");
}

async function regeneratePostbackSecret(formData: FormData) {
  "use server";
  const botId = String(formData.get("botId"));
  await prisma.bot.update({
    where: { id: botId },
    data: { postbackSecret: nanoid(32) },
  });
  revalidatePath("/funnels");
}

async function createLanding(formData: FormData) {
  "use server";
  const botId = String(formData.get("botId"));
  const siteUrlRaw = String(formData.get("siteUrl") || "").trim();
  const customName = String(formData.get("name") || "").trim();
  if (!siteUrlRaw && !customName) return;

  // Try to parse as URL — accept both with and without protocol.
  let siteUrl: string | null = null;
  let host = "";
  try {
    const u = new URL(siteUrlRaw.startsWith("http") ? siteUrlRaw : `https://${siteUrlRaw}`);
    siteUrl = u.toString().replace(/\/$/, "");
    host = u.host;
  } catch {
    siteUrl = null;
    host = siteUrlRaw;
  }

  const name = customName || host || "Nova landing";
  // Slug = host with dots and slashes turned into dashes; if no host, fallback to a sanitized name.
  let slug = (host || name)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  if (!slug) slug = `l-${Date.now().toString(36)}`;

  // Ensure uniqueness within the bot — append -2, -3 if needed.
  let finalSlug = slug;
  let i = 2;
  while (await prisma.landing.findFirst({ where: { botId, slug: finalSlug }, select: { id: true } })) {
    finalSlug = `${slug}-${i++}`;
    if (i > 50) break;
  }

  const landing = await prisma.landing.create({
    data: { botId, slug: finalSlug, name, title: name, siteUrl },
  });
  revalidatePath("/funnels");
  redirect(`/funnels/${landing.id}`);
}

async function deleteLanding(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  await prisma.landing.delete({ where: { id } });
  revalidatePath("/funnels");
}

export default async function FunnelsPage() {
  const bot = await prisma.bot.findFirst({ orderBy: { createdAt: "asc" } });
  if (!bot) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold mb-2">Funil</h1>
        <p style={{ color: "var(--text-dim)" }}>Cadastre um bot primeiro em <Link href="/bot" style={{ color: "var(--primary)" }}>Bot</Link>.</p>
      </div>
    );
  }
  if (!bot.postbackSecret) {
    await prisma.bot.update({ where: { id: bot.id }, data: { postbackSecret: nanoid(32) } });
    bot.postbackSecret = "(reload)";
  }

  const [landings, eventCount, sessionStats] = await Promise.all([
    prisma.landing.findMany({ where: { botId: bot.id }, orderBy: { createdAt: "desc" } }),
    prisma.conversionEvent.count({ where: { botId: bot.id } }),
    prisma.trackingSession.aggregate({
      where: { botId: bot.id },
      _count: true,
    }),
  ]);

  const appUrl = process.env.APP_URL || "https://YOUR-APP.up.railway.app";
  const postbackBase = `${appUrl}/api/track`;

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <FunnelIcon className="w-6 h-6" style={{ color: "var(--primary)" }} />
        <h1 className="text-2xl font-semibold">Funil &amp; Tracking</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Sessões totais</div>
          <div className="text-2xl font-semibold mt-1">{sessionStats._count}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Eventos CAPI enviados</div>
          <div className="text-2xl font-semibold mt-1">{eventCount}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Landings ativas</div>
          <div className="text-2xl font-semibold mt-1">{landings.filter((l) => l.active).length}</div>
        </div>
      </div>

      {/* Meta config */}
      <form action={saveMetaConfig} className="card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <SettingsIcon className="w-4 h-4" style={{ color: "var(--text-dim)" }} />
          <h2 className="font-semibold">Configuração Meta (Facebook Ads)</h2>
        </div>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Pegue no <strong>Business Manager</strong> → Eventos → Configurações → Conversions API. Sem essas credenciais o tracking funciona localmente, só não envia eventos pro Meta.
        </p>
        <input type="hidden" name="botId" value={bot.id} />
        <div>
          <label className="label">Pixel ID</label>
          <input name="metaPixelId" defaultValue={bot.metaPixelId || ""} className="input font-mono text-xs" placeholder="123456789012345" />
        </div>
        <div>
          <label className="label">Conversions API Access Token</label>
          <input name="metaAccessToken" defaultValue={bot.metaAccessToken || ""} className="input font-mono text-xs" placeholder="EAA..." />
        </div>
        <div>
          <label className="label">Test Event Code (opcional, p/ debug)</label>
          <input name="metaTestCode" defaultValue={bot.metaTestCode || ""} className="input font-mono text-xs" placeholder="TEST12345" />
        </div>
        <button type="submit" className="btn btn-primary">Salvar</button>
      </form>

      {/* Embed snippet for external landings */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold">Sua landing externa? Cole este snippet</h2>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Se você já tem uma landing page sua (em qualquer site/hospedagem), use este snippet em vez de criar uma landing aqui. Ele lê os cookies _fbp/_fbc, captura UTMs e fbclid, e redireciona pro bot quando o usuário clica no CTA.
        </p>
        <EmbedSnippet appUrl={appUrl} landings={landings.map((l) => ({ id: l.id, slug: l.slug, name: l.name }))} />
      </div>

      {/* Postback URLs */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold">URLs de postback (corretora)</h2>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Configure essas URLs na sua corretora pra receber notificações de cadastro e depósito. O <code>{"<sessionId>"}</code> é o <code>?ref=</code> que você passa no link de cadastro.
        </p>

        <div>
          <div className="label">Cadastro (CompleteRegistration)</div>
          <CopyFlowLink url={`${postbackBase}/registered?secret=${bot.postbackSecret}&ref=<sessionId>&email=<email>&broker_user_id=<id>`} />
        </div>
        <div>
          <div className="label">Depósito (Purchase)</div>
          <CopyFlowLink url={`${postbackBase}/deposit?secret=${bot.postbackSecret}&ref=<sessionId>&value=<valor>&currency=BRL&email=<email>`} />
        </div>

        <form action={regeneratePostbackSecret}>
          <input type="hidden" name="botId" value={bot.id} />
          <button type="submit" className="btn btn-ghost text-xs">Regenerar secret</button>
        </form>
      </div>

      {/* Landings */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold">Landings</h2>
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Cada landing tem uma URL pública (<code>/l/&lt;slug&gt;</code>) que você cola no anúncio do Facebook. Quando o lead clica e entra no Telegram, o funil é rastreado automaticamente.
        </p>

        <form action={createLanding} className="space-y-3">
          <input type="hidden" name="botId" value={bot.id} />
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3">
            <input
              name="siteUrl"
              required
              className="input"
              placeholder="URL da sua landing (ex: pg.apollooficial.com)"
            />
            <input name="name" className="input" placeholder="Apelido (opcional)" />
            <button className="btn btn-primary"><Plus className="w-4 h-4" /> Adicionar</button>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            Cole sua URL existente (com ou sem <code>https://</code>) — nome e slug são gerados automaticamente. Se ainda não tem landing, deixa só com apelido (ex: &quot;Black Friday&quot;) e use a URL <code>/l/&lt;slug&gt;</code> que aparecer.
          </p>
        </form>

        <div className="space-y-2">
          {landings.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <Link href={`/funnels/${l.id}`} className="flex-1 min-w-0">
                <div className="font-medium truncate">{l.name}</div>
                <div className="text-xs flex items-center gap-1 flex-wrap" style={{ color: "var(--text-faint)" }}>
                  <ExternalLink className="w-3 h-3" />
                  {l.siteUrl ? <span className="truncate">{l.siteUrl}</span> : <span>/l/{l.slug}</span>}
                  <span className="opacity-50">· slug: <code>{l.slug}</code></span>
                  {!l.active && <span className="pill pill-muted ml-2">inativo</span>}
                </div>
              </Link>
              <CopyFlowLink url={l.siteUrl || `${appUrl}/l/${l.slug}`} compact />
              <form action={deleteLanding}>
                <input type="hidden" name="id" value={l.id} />
                <button className="btn btn-danger text-xs" style={{ padding: "4px 10px" }}><Trash2 className="w-3.5 h-3.5" /></button>
              </form>
            </div>
          ))}
          {landings.length === 0 && (
            <p className="text-sm text-center py-6" style={{ color: "var(--text-faint)" }}>Nenhuma landing ainda. Crie a primeira acima.</p>
          )}
        </div>
      </div>
    </div>
  );
}
