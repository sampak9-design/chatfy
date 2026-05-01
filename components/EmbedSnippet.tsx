"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

interface Landing { id: string; slug: string; name: string }

export function EmbedSnippet({ appUrl, landings }: { appUrl: string; landings: Landing[] }) {
  const [slug, setSlug] = useState(landings[0]?.slug || "");
  const [copied, setCopied] = useState<"snippet" | "button" | null>(null);

  const snippet = useMemo(() => {
    return `<!-- VSChat tracking — paste once in your <head> -->
<script>
window.vschat = (function () {
  var BASE = "${appUrl}";
  var LANDING = "${slug}";
  function ck(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):''}
  function gq(){var o={};new URL(location.href).searchParams.forEach(function(v,k){o[k]=v});return o}
  return {
    go: function () {
      var q = gq();
      var fbp = ck('_fbp');
      var fbc = ck('_fbc');
      if (!fbc && q.fbclid) fbc = 'fb.1.' + Date.now() + '.' + q.fbclid;
      var data = {
        landing: LANDING, fbp: fbp, fbc: fbc, fbclid: q.fbclid || '',
        utm_source: q.utm_source || '', utm_medium: q.utm_medium || '',
        utm_campaign: q.utm_campaign || '', utm_content: q.utm_content || '',
        utm_term: q.utm_term || '', referrer: document.referrer || ''
      };
      return fetch(BASE + '/api/track/external', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (r) { return r.json() })
        .then(function (j) { if (j && j.redirect) window.location.href = j.redirect });
    }
  };
})();
</script>`;
  }, [appUrl, slug]);

  const buttonHtml = `<button onclick="vschat.go()">Acessar bot</button>`;

  const copy = async (text: string, which: "snippet" | "button") => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  };

  if (landings.length === 0) {
    return <p className="text-sm" style={{ color: "var(--text-faint)" }}>Crie pelo menos uma landing pra gerar o snippet.</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Landing alvo</label>
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className="input" style={{ maxWidth: 360 }}>
          {landings.map((l) => <option key={l.id} value={l.slug}>{l.name} (/l/{l.slug})</option>)}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label" style={{ marginBottom: 0 }}>1. Cole no &lt;head&gt; da sua landing</label>
          <button onClick={() => copy(snippet, "snippet")} className="btn btn-ghost text-xs" style={{ padding: "4px 10px" }}>
            {copied === "snippet" ? <Check className="w-3.5 h-3.5" style={{ color: "var(--success)" }} /> : <Copy className="w-3.5 h-3.5" />}
            {copied === "snippet" ? "Copiado" : "Copiar"}
          </button>
        </div>
        <pre className="card p-4 text-[11px] overflow-x-auto" style={{ background: "var(--surface-2)", lineHeight: 1.5 }}>
          <code>{snippet}</code>
        </pre>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label" style={{ marginBottom: 0 }}>2. Use no botão de CTA da sua landing</label>
          <button onClick={() => copy(buttonHtml, "button")} className="btn btn-ghost text-xs" style={{ padding: "4px 10px" }}>
            {copied === "button" ? <Check className="w-3.5 h-3.5" style={{ color: "var(--success)" }} /> : <Copy className="w-3.5 h-3.5" />}
            {copied === "button" ? "Copiado" : "Copiar"}
          </button>
        </div>
        <pre className="card p-4 text-[11px]" style={{ background: "var(--surface-2)" }}>
          <code>{buttonHtml}</code>
        </pre>
        <p className="text-[11px] mt-2" style={{ color: "var(--text-faint)" }}>
          Pode ser <code>&lt;a&gt;</code>, <code>&lt;div&gt;</code> etc — o que importa é o <code>onclick=&quot;vschat.go()&quot;</code>.
        </p>
      </div>
    </div>
  );
}
