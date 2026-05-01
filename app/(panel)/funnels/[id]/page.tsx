import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { CopyFlowLink } from "@/components/CopyFlowLink";

export const dynamic = "force-dynamic";

async function saveLanding(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const subtitle = String(formData.get("subtitle") || "").trim() || null;
  const ctaText = String(formData.get("ctaText") || "Acessar").trim();
  const flowId = String(formData.get("flowId") || "") || null;
  const brokerUrl = String(formData.get("brokerUrl") || "").trim() || null;
  const active = formData.get("active") === "on";

  await prisma.landing.update({
    where: { id },
    data: { name, title, subtitle, ctaText, flowId, brokerUrl, active },
  });
  revalidatePath(`/funnels/${id}`);
  redirect(`/funnels/${id}`);
}

export default async function LandingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const landing = await prisma.landing.findUnique({
    where: { id },
    include: { bot: true },
  });
  if (!landing) notFound();

  const flows = await prisma.flow.findMany({
    where: { botId: landing.botId },
    orderBy: { name: "asc" },
  });

  const [sessionsCount, leadCount, registeredCount, depositedCount, depositSum, recentEvents, recentSessions] = await Promise.all([
    prisma.trackingSession.count({ where: { landingId: landing.id } }),
    prisma.trackingSession.count({ where: { landingId: landing.id, leadAt: { not: null } } }),
    prisma.trackingSession.count({ where: { landingId: landing.id, registeredAt: { not: null } } }),
    prisma.trackingSession.count({ where: { landingId: landing.id, depositedAt: { not: null } } }),
    prisma.trackingSession.aggregate({
      where: { landingId: landing.id, depositValue: { not: null } },
      _sum: { depositValue: true },
    }),
    prisma.conversionEvent.findMany({
      where: { session: { landingId: landing.id } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { session: true },
    }),
    prisma.trackingSession.findMany({
      where: { landingId: landing.id },
      orderBy: { pageViewAt: "desc" },
      take: 20,
      include: { lead: true },
    }),
  ]);

  const appUrl = process.env.APP_URL || "";
  const landingUrl = appUrl ? `${appUrl}/l/${landing.slug}` : `/l/${landing.slug}`;
  const brokerUrlExample = landing.brokerUrl
    ? `${landing.brokerUrl}${landing.brokerUrl.includes("?") ? "&" : "?"}ref=<sessionId>`
    : null;

  // Funnel conversion rates
  const r1 = sessionsCount > 0 ? ((leadCount / sessionsCount) * 100).toFixed(1) : "0.0";
  const r2 = leadCount > 0 ? ((registeredCount / leadCount) * 100).toFixed(1) : "0.0";
  const r3 = registeredCount > 0 ? ((depositedCount / registeredCount) * 100).toFixed(1) : "0.0";

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/funnels" className="btn btn-ghost" style={{ padding: "6px 10px" }}><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-2xl font-semibold">{landing.name}</h1>
        {!landing.active && <span className="pill pill-muted">inativo</span>}
      </div>

      <div className="card p-5">
        <div className="label">URL pública pra colocar nos anúncios</div>
        <CopyFlowLink url={landingUrl} />
      </div>

      {/* Funnel */}
      <div className="card p-6 space-y-3">
        <h2 className="font-semibold mb-2">Funil</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <FunnelStep label="Cliques (PageView)" value={sessionsCount} />
          <FunnelStep label="Lead (Telegram)" value={leadCount} rate={`${r1}%`} />
          <FunnelStep label="Cadastrados" value={registeredCount} rate={`${r2}%`} />
          <FunnelStep label="Depositaram" value={depositedCount} rate={`${r3}%`} accent="var(--success)" />
        </div>
        <div className="text-sm pt-3" style={{ color: "var(--text-dim)" }}>
          💰 Total depositado: <span className="font-semibold" style={{ color: "var(--success)" }}>R$ {(depositSum._sum.depositValue ?? 0).toFixed(2)}</span>
        </div>
      </div>

      {/* Settings */}
      <form action={saveLanding} className="card p-6 space-y-4">
        <h2 className="font-semibold">Configuração</h2>
        <input type="hidden" name="id" value={landing.id} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Nome interno</label>
            <input name="name" defaultValue={landing.name} required className="input" />
          </div>
          <div>
            <label className="label">Slug (URL)</label>
            <input value={landing.slug} disabled className="input font-mono text-xs opacity-60" />
          </div>
        </div>
        <div>
          <label className="label">Título da página</label>
          <input name="title" defaultValue={landing.title} required className="input" />
        </div>
        <div>
          <label className="label">Subtítulo (opcional)</label>
          <textarea name="subtitle" defaultValue={landing.subtitle || ""} rows={2} className="input" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Texto do botão</label>
            <input name="ctaText" defaultValue={landing.ctaText} required className="input" />
          </div>
          <div>
            <label className="label">Fluxo a disparar (opcional)</label>
            <select name="flowId" defaultValue={landing.flowId || ""} className="input">
              <option value="">— usa o fluxo de boas-vindas do bot —</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">URL da corretora (cadastro)</label>
          <input name="brokerUrl" defaultValue={landing.brokerUrl || ""} className="input" placeholder="https://corretora.com/register" />
          {brokerUrlExample && (
            <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
              Você pode passar o link assim: <code>{brokerUrlExample}</code> e a corretora envia o <code>ref</code> de volta no postback.
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={landing.active} />
          Landing ativa
        </label>
        <button type="submit" className="btn btn-primary"><Save className="w-4 h-4" /> Salvar</button>
      </form>

      {/* Recent sessions */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 font-semibold" style={{ borderBottom: "1px solid var(--border)" }}>Últimas sessões</div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
              <th className="text-left font-medium px-4 py-2">Quando</th>
              <th className="text-left font-medium px-4 py-2">Origem</th>
              <th className="text-left font-medium px-4 py-2">Lead</th>
              <th className="text-left font-medium px-4 py-2">Cadastro</th>
              <th className="text-right font-medium px-4 py-2">Depósito</th>
            </tr>
          </thead>
          <tbody>
            {recentSessions.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6" style={{ color: "var(--text-faint)" }}>Nenhuma sessão ainda.</td></tr>
            ) : recentSessions.map((s) => (
              <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--text-faint)" }}>{s.pageViewAt.toLocaleString("pt-BR")}</td>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--text-dim)" }}>
                  {[s.utmSource, s.utmCampaign].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-2">
                  {s.lead ? `${s.lead.firstName ?? ""} ${s.lead.username ? `@${s.lead.username}` : ""}` : <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--text-dim)" }}>{s.brokerEmail || "—"}</td>
                <td className="px-4 py-2 text-right" style={{ color: s.depositValue ? "var(--success)" : "var(--text-faint)" }}>
                  {s.depositValue ? `R$ ${s.depositValue.toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent CAPI events */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 font-semibold" style={{ borderBottom: "1px solid var(--border)" }}>Eventos CAPI recentes</div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
              <th className="text-left font-medium px-4 py-2">Quando</th>
              <th className="text-left font-medium px-4 py-2">Evento</th>
              <th className="text-right font-medium px-4 py-2">Valor</th>
              <th className="text-left font-medium px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {recentEvents.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-6" style={{ color: "var(--text-faint)" }}>Nenhum evento ainda.</td></tr>
            ) : recentEvents.map((e) => (
              <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-4 py-2 text-xs" style={{ color: "var(--text-faint)" }}>{e.createdAt.toLocaleString("pt-BR")}</td>
                <td className="px-4 py-2"><span className="pill pill-info">{e.type}</span></td>
                <td className="px-4 py-2 text-right">{e.value ? `${e.currency || "BRL"} ${e.value.toFixed(2)}` : "—"}</td>
                <td className="px-4 py-2">
                  <span className={`pill ${e.ok ? "pill-success" : "pill-danger"}`}>{e.ok ? "ok" : "falhou"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FunnelStep({ label, value, rate, accent }: { label: string; value: number; rate?: string; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="text-2xl font-semibold mt-1" style={{ color: accent || "var(--text)" }}>{value}</div>
      {rate !== undefined && <div className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>{rate} vs. etapa anterior</div>}
    </div>
  );
}
