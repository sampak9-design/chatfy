"use client";

import { useState } from "react";
import { Copy, Check, Link as LinkIcon } from "lucide-react";

export function CopyFlowLink({ url, compact }: { url: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for older browsers / non-secure context
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (compact) {
    return (
      <button onClick={onCopy} className="btn btn-ghost text-xs" style={{ padding: "4px 10px" }} title={url}>
        {copied ? <Check className="w-3.5 h-3.5" style={{ color: "var(--success)" }} /> : <LinkIcon className="w-3.5 h-3.5" />}
        {copied ? "Copiado" : "Copiar link"}
      </button>
    );
  }

  return (
    <div className="flex gap-2 items-center w-full">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="input flex-1 font-mono text-xs"
      />
      <button onClick={onCopy} className="btn btn-primary">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
