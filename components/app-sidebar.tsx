"use client";

import {
  Database,
  Files,
  FlaskConical,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import React, { useCallback, useEffect, useState, type ReactNode } from "react";
import { clearStoredAuth, getConfigStatus, getHealth, type AuthUser, type ConfigStatus } from "../lib/api";

import { SidebarTooltip } from "./sidebar-tooltip";
import { BrandLogo } from "./brand-logo";
import { AppHeader } from "./app-header";
import { isConfigReady, SystemStatusPanel } from "./system-status-panel";

const SIDEBAR_STORAGE_KEY = "aranyabodh-sidebar-collapsed";

const PAGE_TITLES: Record<string, string> = {
  "/": "Chat",
  "/documents": "Documents",
  "/ingestion": "Document processing",
  "/admin/rag-lab": "Knowledge Lab",
  "/admin/users": "Users",
  "/profile": "Profile",
};

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

  function closeSidebar() {
    setOpen(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('button[aria-label="Open sidebar"]')?.focus());
  }

  useEffect(() => {
    if (!open) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && window.matchMedia("(max-width: 1023px)").matches) {
        setOpen(false);
        document.querySelector<HTMLButtonElement>('button[aria-label="Open sidebar"]')?.focus();
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, setOpen]);

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
        onClickCapture={(event) => {
          const control = (event.target as HTMLElement).closest("a, [data-sidebar-select]");
          if (!control || !window.matchMedia("(max-width: 1023px)").matches) return;
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          setOpen(false);
          if (control.tagName === "A") window.sessionStorage.setItem("aranyabodh-focus-page", "true");
          else window.requestAnimationFrame(() => document.getElementById("app-page-title")?.focus());
        }}
        className={`fixed inset-y-0 left-0 z-40 flex w-[320px] max-w-[86vw] flex-col overflow-y-auto border-r border-outline-variant/60 bg-white transition-[width,transform] duration-200 lg:w-[var(--app-sidebar-width)] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className={`flex items-center justify-between gap-2 px-5 pb-6 pt-7 ${collapsed ? "lg:px-3" : ""}`}>
          <div className="min-w-0 flex-1">
            <a
              aria-label="Aranyabodh AI home"
              className={`flex min-w-0 items-center gap-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${collapsed ? "lg:justify-center lg:gap-0" : ""}`}
              href="/"
              onClick={() => setOpen(false)}
            >
              <BrandLogo decorative className="h-11 w-11 shrink-0" />
              <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
                <p className="truncate text-[20px] font-bold leading-6 tracking-tight text-primary">
                  Aranyabodh AI
                </p>
                <p className="mt-1 text-[12px] leading-4 text-[#626b79]">
                  Forestry knowledge assistant
                </p>
              </div>
            </a>
          </div>
          <button
            aria-label="Close sidebar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded border border-outline-variant text-[#5f6875] lg:hidden"
            onClick={closeSidebar}
            type="button"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className={`px-5 ${collapsed ? "lg:px-3" : ""}`}>
          <SidebarTooltip enabled={collapsed} label="New chat">
          {onNewChat ? (
            <button
              aria-label="New chat"
              className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-primary px-3 text-[15px] font-semibold text-white transition hover:bg-primary-container"
              data-sidebar-select
              onClick={onNewChat}
              type="button"
            >
              <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              <span className={labelClass}>New chat</span>
            </button>
          ) : (
            <a
              aria-label="New chat"
              className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-primary px-3 text-[15px] font-semibold text-white transition hover:bg-primary-container"
              href="/"
            >
              <Plus className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              <span className={labelClass}>New chat</span>
            </a>
          )}
          </SidebarTooltip>
        </div>

        <nav aria-label="Primary navigation" className={`mt-5 px-5 ${collapsed ? "lg:px-3" : ""}`}>
          <ul className="space-y-1.5">
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
          onClick={closeSidebar}
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
      <SidebarTooltip enabled={collapsed} label={label}>
      <a
        aria-current={active ? "page" : undefined}
        className={`flex min-h-11 items-center rounded-lg px-4 py-2.5 text-[15px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
          collapsed ? "gap-4 lg:justify-center lg:gap-0 lg:px-2" : "gap-4"
        } ${active ? "bg-[#eaf3ed] font-semibold text-primary" : "text-[#5c6861] hover:bg-[#f3f6f4] hover:text-primary"}`}
        href={href}
      >
        <Icon className="h-5 w-5 shrink-0" strokeWidth={2.1} />
        <span className={collapsed ? "lg:sr-only" : ""}>{label}</span>
      </a>
      </SidebarTooltip>
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [health, setHealth] = useState("unknown");
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const refreshStatus = useCallback(() => setStatusAttempt((attempt) => attempt + 1), []);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setRefreshing(true);
    void Promise.all([getHealth(), getConfigStatus()]).then(([nextHealth, nextConfig]) => {
      if (!active) return;
      setHealth(nextHealth.status);
      setConfig(nextConfig);
    }).catch(() => {
      if (active) setHealth("error");
    }).finally(() => {
      if (active) setRefreshing(false);
    });
    return () => { active = false; };
  }, [userId, statusAttempt]);

  return (
    <>
      <AppSidebar
        activePath={activePath}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        user={user}
      />
      <div className="min-h-screen transition-[padding] duration-200 lg:pl-[var(--app-sidebar-width)]">
        <AppHeader
          title={PAGE_TITLES[activePath] ?? "Knowledge Lab"}
          configReady={isConfigReady(config)}
          health={health}
          onAdminClick={() => setSettingsOpen((open) => !open)}
          onLogout={() => {
            clearStoredAuth();
            window.location.assign("/login");
          }}
          onMenuClick={() => setMobileOpen(true)}
          user={user}
        />
        {settingsOpen && user ? <SystemStatusPanel config={config} health={health} onRefresh={refreshStatus} refreshing={refreshing} user={user} /> : null}
        {children}
      </div>
    </>
  );
}
