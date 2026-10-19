"use client";

import React from "react";
import { Database, Loader2, RefreshCw, ShieldCheck, Upload, type LucideIcon } from "lucide-react";
import { API_BASE_URL, type ConfigStatus, type AuthUser } from "../lib/api";

function canManageDocuments(user: AuthUser) {
  return user.role === "admin" || user.role === "knowledge_manager";
}

export function isConfigReady(config: ConfigStatus | null) {
  return Boolean(config?.gemini_api_key_configured && config.supabase_url_configured && config.supabase_service_role_key_configured && config.supabase_url_valid && config.jwt_secret_key_configured);
}

export function SystemStatusPanel({
  config,
  health,
  onRefresh,
  refreshing,
  user,
}: {
  config: ConfigStatus | null;
  health: string;
  onRefresh: () => void;
  refreshing: boolean;
  user: AuthUser;
}) {
  const canManage = canManageDocuments(user);

  return (
    <section className="border-b border-outline-variant/60 bg-white px-5 py-5 sm:px-8">
      <div className="mx-auto grid max-w-[1168px] gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatusCard
            icon={ShieldCheck}
            label="Role"
            status={canManage ? "ok" : "limited"}
            value={user.role}
          />
          <StatusCard
            icon={Database}
            label="Supabase"
            status={
              config?.supabase_url_configured &&
              config.supabase_service_role_key_configured &&
              config.supabase_url_valid
                ? "ok"
                : "missing"
            }
            value={config?.supabase_url_hint || "URL/service role pending"}
          />
          <StatusCard
            icon={ShieldCheck}
            label="Auth"
            status={config?.jwt_secret_key_configured ? "ok" : "missing"}
            value={config?.auth_disabled ? "Disabled" : "JWT enabled"}
          />
        </div>

        <div className="rounded border border-outline-variant/70 bg-surface-container-lowest p-4">
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton
              disabled={refreshing}
              icon={RefreshCw}
              label="Refresh"
              loading={refreshing}
              onClick={onRefresh}
            />
            <AdminButton
              disabled={!canManage}
              icon={Upload}
              label="Document processing"
              loading={false}
              onClick={() => window.location.assign("/ingestion")}
            />
          </div>

          <div className="mt-4 grid gap-3 text-[13px] leading-5 text-[#4e5966] sm:grid-cols-3">
            <Metric
              label="Backend"
              value={health === "ok" ? API_BASE_URL : "Unavailable"}
            />
            <Metric label="Documents" value="Open document library" />
            <Metric label="Processing" value="Automatic after upload" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusCard({
  icon: Icon,
  label,
  pending = false,
  status,
  value,
}: {
  icon: LucideIcon;
  label: string;
  pending?: boolean;
  status: string;
  value: string;
}) {
  const ok = status === "ok";

  return (
    <div className="rounded border border-outline-variant/70 bg-surface-container-lowest p-4">
      <div className="flex items-center gap-3">
        <span
          className={`grid h-9 w-9 place-items-center rounded ${
            ok ? "bg-[#edf8f1] text-primary" : "bg-[#fff3ef] text-[#743f2c]"
          }`}
        >
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase leading-4 text-[#7b8492]">
            {label}
          </p>
          <p className="truncate text-[15px] font-semibold leading-5 text-[#151a18]">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function AdminButton({
  disabled,
  icon: Icon,
  label,
  loading,
  onClick,
}: {
  disabled: boolean;
  icon: LucideIcon;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant bg-white px-3 text-[14px] font-semibold text-[#26384d] transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded bg-surface-container-low px-3 py-2">
      <p className="text-[12px] font-semibold uppercase text-[#7b8492]">
        {label}
      </p>
      <p className="mt-1 truncate text-[16px] font-bold text-[#151a18]">
        {value}
      </p>
    </div>
  );
}

