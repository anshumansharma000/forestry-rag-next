"use client";

import { X } from "lucide-react";
import React, { useEffect, useId, useRef, type ReactNode } from "react";

export function SidePanel({ title, onClose, children, busy = false, centered = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean; centered?: boolean }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  const locked = useRef(busy);
  close.current = onClose;
  locked.current = busy;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !locked.current) close.current();
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <div className={`fixed inset-0 z-50 flex bg-black/30 ${centered ? "items-center justify-center p-4" : "justify-end"}`} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`flex w-full flex-col bg-white shadow-xl ${centered ? "max-h-[85vh] max-w-xl rounded-2xl" : "h-full max-w-lg"}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/60 px-6 py-4">
          <h2 id={titleId} className="text-xl font-semibold text-primary">{title}</h2>
          <button ref={closeButton} aria-label={`Close ${title.toLowerCase()}`} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-surface-container-low disabled:opacity-50" disabled={busy} onClick={onClose} type="button"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
