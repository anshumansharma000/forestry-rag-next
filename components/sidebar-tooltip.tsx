"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function SidebarTooltip({ label, enabled, children }: { label: string; enabled: boolean; children: ReactNode }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!position) return;
    const dismiss = () => setPosition(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [position]);
  function show(event: React.SyntheticEvent<HTMLDivElement>) {
    if (!enabled || !window.matchMedia("(min-width: 1024px)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setPosition({ top: bounds.top + bounds.height / 2, left: bounds.right + 12 });
  }
  return (
    <div onMouseEnter={show} onMouseLeave={() => setPosition(null)} onFocus={show} onBlur={() => setPosition(null)}>
      {children}
      {enabled && position ? createPortal(
        <span aria-hidden="true" className="pointer-events-none fixed z-[60] -translate-y-1/2 rounded-lg bg-[#20372a] px-3 py-2 text-sm font-medium text-white shadow-lg" style={position}>{label}</span>,
        document.body,
      ) : null}
    </div>
  );
}
