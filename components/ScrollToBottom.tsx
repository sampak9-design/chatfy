"use client";

import { useEffect, useRef } from "react";

/**
 * Renders an empty <div> that, on mount, scrolls its scrollable ancestor to the bottom.
 * Drop it as the last child inside the messages list.
 *
 * Re-fires whenever `dep` changes (use the active conversation id) so switching
 * between conversations also jumps to the bottom.
 */
export function ScrollToBottom({ dep }: { dep?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Walk up to the nearest scrollable ancestor and scroll it to the bottom.
    let node: HTMLElement | null = el.parentElement;
    while (node) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        node.scrollTop = node.scrollHeight;
        return;
      }
      node = node.parentElement;
    }
    // Fallback: just scroll the element into view
    el.scrollIntoView({ block: "end" });
  }, [dep]);

  return <div ref={ref} aria-hidden style={{ height: 0 }} />;
}
