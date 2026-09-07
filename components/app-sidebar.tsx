"use client";

import {
  Database,
  Files,
  FlaskConical,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import React, { useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "../lib/api";

const SIDEBAR_STORAGE_KEY = "aranyabodh-sidebar-collapsed";

function canManageDocuments(user: AuthUser | null) {
  return user?.role === "admin" || user?.role === "knowledge_manager";
}

function isAdmin(user: AuthUser | null) {
  return user?.role === "admin";
}

type AppSidebarProps = {
  activePath: string;
  children?: ReactNode;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  onNewChat?: () => void;
  user: AuthUser | null;
};

export function AppSidebar({
  activePath,
  children,
  mobileOpen,
  onMobileOpenChange,
  onNewChat,
  user,
}: AppSidebarProps) {
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const open = mobileOpen ?? internalMobileOpen;
  const setOpen = onMobileOpenChange ?? setInternalMobileOpen;

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
    setPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!preferenceLoaded) return;
    document.documentElement.style.setProperty(
      "--app-sidebar-width",
      collapsed ? "88px" : "360px",
    );
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  }, [collapsed, preferenceLoaded]);

  const labelClass = collapsed ? "lg:sr-only" : "";

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[320px] max-w-[86vw] flex-col overflow-y-auto border-r border-outline-variant/60 bg-white transition-[width,transform] duration-200 lg:w-[var(--app-sidebar-width)] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className={`flex items-start justify-between px-7 pb-6 pt-7 ${collapsed ? "lg:px-4" : ""}`}>
          <div className="min-w-0">
            <a
              aria-label="Aranyabodh home"
              className={`block truncate text-[26px] font-bold leading-8 text-primary hover:text-primary-container ${labelClass}`}
              href="/"
              onClick={() => setOpen(false)}
            >
              Aranyabodh
            </a>
            {collapsed ? (
              <a
                aria-label="Aranyabodh home"
                className="hidden h-11 w-11 place-items-center rounded bg-[#edf8f1] text-xl font-bold text-primary lg:grid"
                href="/"
              >
                A
              </a>
            ) : null}
            <p className={`mt-2 text-[13px] font-medium uppercase leading-4 text-[#626b79] ${labelClass}`}>
              Forestry knowledge assistant
            </p>
          </div>
          <button
            aria-label="Close sidebar"
            className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded border border-outline-variant text-[#5f6875] lg:hidden"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className={`px-5 ${collapsed ? "lg:px-3" : ""}`}>
          {onNewChat ? (
            <button
              aria-label="New chat"
              className="flex h-12 w-full items-center justify-center gap-3 rounded bg-primary px-3 text-[16px] font-semibold text-white transition hover:bg-primary-container"
              onClick={onNewChat}
              title={collapsed ? "New chat" : undefined}
              type="button"
            >
              <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              <span className={labelClass}>New chat</span>
            </button>
          ) : (
            <a
              aria-label="New chat"
              className="flex h-12 w-full items-center justify-center gap-3 rounded bg-primary px-3 text-[16px] font-semibold text-white transition hover:bg-primary-container"
              href="/"
              title={collapsed ? "New chat" : undefined}
            >
              <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              <span className={labelClass}>New chat</span>
            </a>
          )}
        </div>

        <nav aria-label="Primary navigation" className={`mt-5 px-5 ${collapsed ? "lg:px-3" : ""}`}>
          <ul className="space-y-1">
            <SidebarLink active={activePath === "/"} collapsed={collapsed} href="/" icon={MessageSquareText} label="Chat" />
            {canManageDocuments(user) ? (
              <>
                <SidebarLink active={activePath === "/documents"} collapsed={collapsed} href="/documents" icon={Files} label="Documents" />
                <SidebarLink active={activePath === "/ingestion"} collapsed={collapsed} href="/ingestion" icon={Database} label="Document processing" />
              </>
            ) : null}
            {isAdmin(user) ? (
              <>
                <SidebarLink active={activePath.startsWith("/admin/rag-lab")} collapsed={collapsed} href="/admin/rag-lab" icon={FlaskConical} label="Knowledge Lab" />
                <SidebarLink active={activePath === "/admin/users"} collapsed={collapsed} href="/admin/users" icon={Users} label="Users" />
              </>
            ) : null}
            <SidebarLink active={activePath === "/profile"} collapsed={collapsed} href="/profile" icon={UserCircle} label="Profile" />
          </ul>
        </nav>

        <div className={`flex min-h-0 flex-1 flex-col ${collapsed ? "lg:hidden" : ""}`}>{children}</div>

      </aside>

      <button
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="fixed top-20 z-50 hidden h-8 w-8 place-items-center rounded-full border border-outline-variant bg-white text-[#4e5966] shadow-sm transition-[left] duration-200 hover:bg-surface-container-low lg:grid"
        onClick={() => setCollapsed((value) => !value)}
        style={{ left: "calc(var(--app-sidebar-width) - 16px)" }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        type="button"
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      {open ? (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-on-surface/25 lg:hidden"
          onClick={() => setOpen(false)}
          type="button"
        />
      ) : null}
    </>
  );
}

function SidebarLink({
  active,
  collapsed,
  href,
  icon: Icon,
  label,
}: {
  active: boolean;
  collapsed: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <li>
      <a
        aria-current={active ? "page" : undefined}
        className={`flex min-h-12 items-center rounded px-4 py-3 text-[16px] font-medium transition ${
          collapsed ? "gap-4 lg:justify-center lg:gap-0 lg:px-2" : "gap-4"
        } ${active ? "bg-[#e8f8ef] text-primary" : "text-[#26384d] hover:bg-surface-container-low"}`}
        href={href}
        title={collapsed ? label : undefined}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={2.1} />
        <span className={collapsed ? "lg:sr-only" : ""}>{label}</span>
      </a>
    </li>
  );
}

export function SidebarPageShell({
  activePath,
  children,
  user,
}: {
  activePath: string;
  children: ReactNode;
  user: AuthUser | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <AppSidebar
        activePath={activePath}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        user={user}
      />
      <button
        aria-label="Open sidebar"
        className="fixed left-4 top-4 z-20 grid h-11 w-11 place-items-center rounded border border-outline-variant bg-white text-[#5f6875] shadow-sm lg:hidden"
        onClick={() => setMobileOpen(true)}
        type="button"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-h-screen pt-14 transition-[padding] duration-200 lg:pl-[var(--app-sidebar-width)] lg:pt-0">
        {children}
      </div>
    </>
  );
}
