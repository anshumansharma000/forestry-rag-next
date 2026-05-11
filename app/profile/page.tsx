"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  ensureFreshAuth,
  formatApiError,
  loadStoredSession,
  validatePassword,
} from "../../lib/auth-client";
import {
  AuthState,
  AuthUser,
  changePassword,
  storeAuth,
  updateCurrentUser,
} from "../../lib/api";

export default function ProfilePage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [fullName, setFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  async function getToken() {
    const nextAuth = await ensureFreshAuth(auth);
    setAuth(nextAuth);
    setUser(nextAuth.user);
    return nextAuth.access_token;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const session = await loadStoredSession();
        if (!session) {
          window.location.assign("/login");
          return;
        }
        if (!cancelled) {
          setAuth(session);
          setUser(session.user);
          setFullName(session.user.full_name ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatApiError(err, "Unable to load profile."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSavingProfile(true);
    try {
      const token = await getToken();
      const updated = await updateCurrentUser(token, fullName.trim() || null);
      const nextAuth = auth ? { ...auth, user: updated } : null;
      if (nextAuth) {
        storeAuth(nextAuth);
        setAuth(nextAuth);
      }
      setUser(updated);
      setFullName(updated.full_name ?? "");
      setNotice("Profile updated.");
    } catch (err) {
      setError(formatApiError(err, "Unable to update profile."));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      setError(validation.errors.join(" "));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("Choose a new password that is different from the current password.");
      return;
    }

    setChangingPassword(true);
    try {
      const token = await getToken();
      const nextAuth = await changePassword(token, currentPassword, newPassword);
      storeAuth(nextAuth);
      setAuth(nextAuth);
      setUser(nextAuth.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Password changed.");
    } catch (err) {
      setError(formatApiError(err, "Unable to change password."));
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface px-5 py-6 text-on-surface sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col justify-between gap-4 border-b border-outline-variant pb-6 sm:flex-row sm:items-end">
          <div>
            <a
              className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#4e5966] hover:text-primary"
              href="/"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to chat
            </a>
            <h1 className="mt-3 text-[30px] font-bold leading-9 text-primary">
              User Profile
            </h1>
            <p className="mt-2 text-[14px] text-[#626b79]">
              Manage your account details and password.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded border border-[#b7d6c4] bg-[#edf8f1] px-3 py-2 text-[13px] font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" />
            {user?.role ?? "Loading"}
          </div>
        </header>

        {error ? <Banner tone="error" message={error} /> : null}
        {notice ? <Banner tone="success" message={notice} /> : null}

        {loading ? (
          <div className="mt-6 flex items-center gap-3 rounded border border-outline-variant bg-white px-4 py-4 shadow-tonal">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-[15px] font-semibold">Loading profile</span>
          </div>
        ) : (
          <section className="mt-6 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <form
              className="rounded border border-outline-variant bg-white p-5 shadow-tonal"
              onSubmit={handleProfileSubmit}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
                  <UserCircle className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-bold text-[#151a18]">
                    Account
                  </h2>
                  <p className="text-[14px] text-[#626b79]">{user?.email}</p>
                </div>
              </div>

              <TextField
                label="Full name"
                onChange={setFullName}
                value={fullName}
              />

              <div className="mt-4 grid gap-3 text-[13px] leading-5 text-[#4e5966]">
                <Metric label="Email" value={user?.email ?? "n/a"} />
                <Metric label="Role" value={user?.role ?? "n/a"} />
              </div>

              <button
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
                disabled={savingProfile}
                type="submit"
              >
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save profile
              </button>
            </form>

            <form
              className="rounded border border-outline-variant bg-white p-5 shadow-tonal"
              onSubmit={handlePasswordSubmit}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-bold text-[#151a18]">
                    Change Password
                  </h2>
                  <p className="text-[14px] text-[#626b79]">
                    Password updates apply immediately.
                  </p>
                </div>
              </div>

              <TextField
                autoComplete="current-password"
                label="Current password"
                onChange={setCurrentPassword}
                required
                type="password"
                value={currentPassword}
              />
              <TextField
                autoComplete="new-password"
                label="New password"
                onChange={setNewPassword}
                required
                type="password"
                value={newPassword}
              />
              <TextField
                autoComplete="new-password"
                label="Confirm new password"
                onChange={setConfirmPassword}
                required
                type="password"
                value={confirmPassword}
              />

              <PasswordRules password={newPassword} />

              <button
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
                disabled={changingPassword}
                type="submit"
              >
                {changingPassword ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Update password
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}

function TextField({
  autoComplete,
  label,
  onChange,
  required = false,
  type = "text",
  value,
}: {
  autoComplete?: string;
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-[13px] font-semibold uppercase text-[#626b79]">
        {label}
      </span>
      <input
        autoComplete={autoComplete}
        className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function PasswordRules({ password }: { password: string }) {
  const rules = [
    { label: "8+ characters", passed: password.length >= 8 },
    { label: "Uppercase letter", passed: /[A-Z]/.test(password) },
    { label: "Lowercase letter", passed: /[a-z]/.test(password) },
    { label: "Number", passed: /[0-9]/.test(password) },
    { label: "Special character", passed: /[^A-Za-z0-9]/.test(password) },
  ];

  return (
    <div className="mt-4 rounded border border-outline-variant/70 bg-surface-container-lowest p-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold uppercase text-[#626b79]">
        <KeyRound className="h-4 w-4" />
        Password criteria
      </div>
      <ul className="mt-3 grid gap-2 text-[13px] leading-5 text-[#4e5966] sm:grid-cols-2">
        {rules.map((rule) => (
          <li className="flex items-center gap-2" key={rule.label}>
            {rule.passed ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-[#8d5a4a]" />
            )}
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Banner({ message, tone }: { message: string; tone: "error" | "success" }) {
  const error = tone === "error";
  return (
    <div
      className={`mt-5 flex items-start gap-3 rounded border px-4 py-3 ${
        error
          ? "border-[#f0c4b6] bg-[#fff5f1] text-[#743f2c]"
          : "border-[#b7d6c4] bg-[#edf8f1] text-primary"
      }`}
    >
      {error ? (
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
      )}
      <p className="text-[14px] leading-5">{message}</p>
    </div>
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
