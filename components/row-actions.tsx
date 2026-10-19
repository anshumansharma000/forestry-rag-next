"use client";

import { MoreHorizontal } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function RowActions({ label, actions, disabled = false }: { label: string; actions: { label: string; run: () => void }[]; disabled?: boolean }) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!position) return;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function dismiss(event: PointerEvent) {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setPosition(null); trigger.current?.focus(); }
    }
    const hide = () => setPosition(null);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [position]);
  return <>
    <button ref={trigger} aria-label={label} aria-expanded={Boolean(position)} disabled={disabled} className="grid h-11 w-11 place-items-center rounded-lg text-[#626b79] hover:bg-[#edf4ef] disabled:opacity-40" onClick={() => {
      if (position) { setPosition(null); return; }
      const bounds = trigger.current!.getBoundingClientRect();
      setPosition({ top: Math.max(8, Math.min(bounds.bottom + 6, window.innerHeight - actions.length * 44 - 24)), right: Math.max(8, window.innerWidth - bounds.right) });
    }} type="button"><MoreHorizontal className="h-5 w-5" /></button>
    {position ? createPortal(<div ref={panel} aria-label={label} className="fixed z-40 w-56 rounded-xl border border-outline-variant/70 bg-white p-1.5 shadow-lg" style={position} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null) && event.relatedTarget !== trigger.current) setPosition(null);
    }}>{actions.map(action => <button key={action.label} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-[#324d3d] hover:bg-[#edf4ef]" onClick={() => { setPosition(null); trigger.current?.focus(); action.run(); }} type="button">{action.label}</button>)}</div>, document.body) : null}
  </>;
}
