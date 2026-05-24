"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";

interface Props {
  leadId: string;
  initialTags: string[];
  saveAction: (formData: FormData) => Promise<void>;
}

const COLORS = ["#f97316", "#22c55e", "#a855f7", "#3b82f6", "#ec4899", "#eab308"];
function colorOf(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % COLORS.length;
  return COLORS[Math.abs(h)];
}

export function TagsEditor({ leadId, initialTags, saveAction }: Props) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();

  const persist = (next: string[]) => {
    setTags(next);
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("tags", next.join(","));
    startTransition(() => saveAction(fd));
  };

  const addTag = () => {
    const v = input.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 24);
    if (!v || tags.includes(v)) { setInput(""); return; }
    persist([...tags, v]);
    setInput("");
  };

  const removeTag = (t: string) => persist(tags.filter((x) => x !== t));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((t) => {
        const color = colorOf(t);
        return (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-1"
            style={{ background: color + "22", color, border: `1px solid ${color}44` }}
          >
            {t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              className="opacity-60 hover:opacity-100"
              aria-label={`Remover ${t}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        );
      })}
      <div className="inline-flex items-center gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addTag(); }
            if (e.key === "Backspace" && !input && tags.length) removeTag(tags[tags.length - 1]);
          }}
          placeholder="+ tag"
          className="text-[11px] px-2 py-1 rounded-full outline-none"
          style={{
            background: "var(--surface-2)",
            border: "1px dashed var(--border-strong)",
            color: "var(--text)",
            width: 80,
          }}
          disabled={pending}
        />
        {input && (
          <button
            type="button"
            onClick={addTag}
            className="text-[11px]"
            style={{ color: "var(--primary)" }}
            aria-label="Adicionar tag"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
