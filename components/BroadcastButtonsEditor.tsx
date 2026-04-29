"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";

interface ButtonItem { id: string; label: string; url: string }

export function ButtonsEditorClient({ initial }: { initial: ButtonItem[] }) {
  const [items, setItems] = useState<ButtonItem[]>(initial);

  const add = () => setItems((s) => [...s, { id: nanoid(6), label: "", url: "" }]);
  const update = (id: string, patch: Partial<ButtonItem>) => setItems((s) => s.map((b) => b.id === id ? { ...b, ...patch } : b));
  const remove = (id: string) => setItems((s) => s.filter((b) => b.id !== id));

  return (
    <div className="space-y-2">
      <input type="hidden" name="buttons" value={JSON.stringify(items)} form="draft-form" />
      {items.map((b) => (
        <div key={b.id} className="flex gap-2">
          <input
            value={b.label}
            onChange={(e) => update(b.id, { label: e.target.value })}
            className="input flex-1"
            placeholder="Rótulo"
          />
          <input
            value={b.url}
            onChange={(e) => update(b.id, { url: e.target.value })}
            className="input flex-[2]"
            placeholder="https://exemplo.com"
          />
          <button type="button" onClick={() => remove(b.id)} className="btn btn-danger" style={{ padding: "0 10px" }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="btn btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Adicionar botão</button>
    </div>
  );
}
