"use client";

import { AlertCircle, ChevronDown, LogOut, Menu, Settings, UserCircle } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { AuthUser } from "../lib/api";

export function AppHeader({
  title,
  configReady,
  health,
  onAdminClick,
  onLogout,
  onMenuClick,
  user,
}: {
  title: string;
  configReady: boolean;
  health: string;
  onAdminClick: () => void;
  onLogout: () => void;
  onMenuClick: () => void;
  user: AuthUser | null;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const displayName = user?.full_name?.trim() || user?.email || "Account";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const status = health === "unknown" ? "Checking connection" : health !== "ok" ? "Connection issue" : !configReady ? "Needs setup" : "Connected";
  const connected = status === "Connected";
  const checking = status === "Checking connection";

  useEffect(() => {
    if (window.sessionStorage.getItem("aranyabodh-focus-page") === "true") {
      window.sessionStorage.removeItem("aranyabodh-focus-page");
      document.getElementById("app-page-title")?.focus();
    }
  }, []);

  useEffect(() => {
    if (!accountOpen) return;
    function dismiss(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [accountOpen]);

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-3 border-b border-outline-variant/60 bg-white px-5 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button aria-label="Open sidebar" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#626b79] transition hover:bg-surface-container-low lg:hidden" onClick={onMenuClick} type="button">
          <Menu className="h-5 w-5" />
        </button>
        <h1 id="app-page-title" tabIndex={-1} className="truncate text-[20px] font-semibold tracking-tight text-[#202c26] focus:outline-none">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        <span role="status" aria-label={status} title={status} className={`inline-flex items-center gap-2 text-[13px] ${connected || checking ? "text-[#626b79]" : "rounded-full bg-[#fff3ef] px-2.5 py-1.5 font-medium text-[#743f2c]"}`}>
          {connected || checking ? <span aria-hidden="true" className={`h-2 w-2 rounded-full ${connected ? "bg-[#38835a]" : "bg-[#9ba39e]"}`} /> : <AlertCircle aria-hidden="true" className="h-4 w-4" />}
          <span className={connected || checking ? "hidden sm:inline" : ""}>{status}</span>
        </span>
        <div ref={accountRef} className="relative" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAccountOpen(false);
        }}>
          <button ref={triggerRef} disabled={!user} aria-label="Account" aria-expanded={accountOpen} aria-controls="account-panel" className="flex min-h-11 items-center gap-2 rounded-full p-1.5 text-[#626b79] transition hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" onClick={() => setAccountOpen((open) => !open)} type="button">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-[#edf4ef] text-xs font-bold text-primary">{initials}</span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${accountOpen ? "rotate-180" : ""}`} />
          </button>
          {accountOpen && user ? (
            <div id="account-panel" aria-label="Account options" className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-40px)] rounded-xl border border-outline-variant/70 bg-white p-1.5 shadow-lg">
              <div className="border-b border-outline-variant/60 px-3 py-3">
                <p className="truncate text-sm font-semibold text-[#202c26]">{displayName}</p>
                <p className="mt-1 truncate text-xs text-[#626b79]">{user.email}</p>
              </div>
              <a href="/profile" className="mt-1 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-[#4e5966] hover:bg-surface-container-low"><UserCircle className="h-4 w-4" />Profile</a>
              <button onClick={() => { setAccountOpen(false); triggerRef.current?.focus(); onAdminClick(); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-[#4e5966] hover:bg-surface-container-low" type="button"><Settings className="h-4 w-4" />System settings</button>
              <div className="mt-1 border-t border-outline-variant/60 pt-1">
                <button onClick={() => { setAccountOpen(false); onLogout(); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-[#743f2c] hover:bg-[#fff3ef]" type="button"><LogOut className="h-4 w-4" />Sign out</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
