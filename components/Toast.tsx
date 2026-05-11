"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

/**
 * Small success toast that shows briefly when present, then fades away.
 * Use after a server action by appending ?saved=1 (or any flag) to the redirect URL
 * and rendering <SavedToast /> on the page.
 */
export function SavedToast({ message = "Salvo!" }: { message?: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg"
      style={{
        background: "rgba(34,197,94,0.15)",
        border: "1px solid rgba(34,197,94,0.4)",
        color: "#86efac",
      }}
    >
      <CheckCircle2 className="w-4 h-4" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
