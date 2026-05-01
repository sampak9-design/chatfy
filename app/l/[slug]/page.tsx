import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface SP {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const landing = await prisma.landing.findFirst({ where: { slug, active: true } });
  return {
    title: landing?.title || "Landing",
    description: landing?.subtitle || undefined,
  };
}

export default async function LandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const landing = await prisma.landing.findFirst({ where: { slug, active: true } });
  if (!landing) notFound();

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div
        className="card"
        style={{
          maxWidth: 480,
          width: "100%",
          padding: "40px 32px",
          textAlign: "center",
          background: "var(--surface)",
        }}
      >
        <h1 style={{ fontSize: 28, lineHeight: 1.2, marginBottom: 12 }}>{landing.title}</h1>
        {landing.subtitle && (
          <p style={{ color: "var(--text-dim)", fontSize: 15, lineHeight: 1.5, marginBottom: 28 }}>
            {landing.subtitle}
          </p>
        )}
        <form action="/api/track/init" method="post">
          <input type="hidden" name="landingId" value={landing.id} />
          <input type="hidden" name="utm_source" value={sp.utm_source || ""} />
          <input type="hidden" name="utm_medium" value={sp.utm_medium || ""} />
          <input type="hidden" name="utm_campaign" value={sp.utm_campaign || ""} />
          <input type="hidden" name="utm_content" value={sp.utm_content || ""} />
          <input type="hidden" name="utm_term" value={sp.utm_term || ""} />
          <input type="hidden" name="fbclid" value={sp.fbclid || ""} />
          <input type="hidden" name="fbp" id="lp-fbp" value="" />
          <input type="hidden" name="fbc" id="lp-fbc" value="" />
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "16px 24px", fontSize: 16, fontWeight: 600 }}
          >
            {landing.ctaText}
          </button>
        </form>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 20 }}>
          Ao continuar você será redirecionado para o nosso bot no Telegram.
        </p>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              function getCookie(name){
                var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
                return m ? decodeURIComponent(m[1]) : '';
              }
              var fbp = getCookie('_fbp');
              var fbc = getCookie('_fbc');
              if (!fbc) {
                var fbclid = new URL(location.href).searchParams.get('fbclid');
                if (fbclid) fbc = 'fb.1.' + Date.now() + '.' + fbclid;
              }
              var fbpInput = document.getElementById('lp-fbp');
              var fbcInput = document.getElementById('lp-fbc');
              if (fbpInput && fbp) fbpInput.value = fbp;
              if (fbcInput && fbc) fbcInput.value = fbc;
            })();
          `,
        }}
      />
    </div>
  );
}
