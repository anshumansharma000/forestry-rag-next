"use client";

import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Save,
  UserCircle,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { PasswordInput } from "../../components/password-input";
import { SidebarPageShell } from "../../components/app-sidebar";
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

function titleCaseRole(role: string) {
  return role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ProfilePage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [fullName, setFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedbackSection, setFeedbackSection] = useState<"profile" | "password">("profile");
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
    setFeedbackSection("profile");
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
    setFeedbackSection("password");
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
    <SidebarPageShell activePath="/profile" user={user}>
    <main className="min-h-[calc(100vh-72px)] bg-surface px-5 py-6 text-on-surface sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-sm leading-6 text-[#626b79]">Manage your personal details and password.</p>

        {loading ? (
          <div className="mt-6 flex items-center gap-3 rounded border border-outline-variant bg-white px-4 py-4 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-[15px] font-semibold">Loading profile</span>
          </div>
        ) : (
          <section className="mt-6 grid gap-6">
            <form
              className="rounded-2xl border border-outline-variant/60 bg-white p-5 shadow-sm"
              onSubmit={handleProfileSubmit}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
                  <UserCircle className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-bold text-[#151a18]">
                    Personal details
                  </h2>
                  <p className="text-[14px] text-[#626b79]">Choose how your name appears in the app.</p>
                </div>
              </div>

              {feedbackSection === "profile" && error ? <Banner tone="error" message={error} /> : null}
              {feedbackSection === "profile" && notice ? <Banner tone="success" message={notice} /> : null}
              <TextField
                label="Full name"
                onChange={setFullName}
                value={fullName}
              />

              <dl className="mt-5 grid gap-4 border-t border-outline-variant/50 pt-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-[#7b8492]">Email</dt><dd className="mt-1 break-all font-medium text-[#324d3d]">{user?.email ?? "—"}</dd></div>
                <div><dt className="text-xs text-[#7b8492]">Role</dt><dd className="mt-1 font-medium text-[#324d3d]">{user ? titleCaseRole(user.role) : "—"}</dd></div>
              </dl>

              <button
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
                disabled={savingProfile || fullName.trim() === (user?.full_name ?? "").trim()}
                type="submit"
              >
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
              </button>
            </form>

            <form
              className="rounded-2xl border border-outline-variant/60 bg-white p-5 shadow-sm"
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

              {feedbackSection === "password" && error ? <Banner tone="error" message={error} /> : null}
              {feedbackSection === "password" && notice ? <Banner tone="success" message={notice} /> : null}
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
              {newPassword ? <PasswordRules password={newPassword} /> : null}
              <TextField
                autoComplete="new-password"
                label="Confirm new password"
                onChange={setConfirmPassword}
                required
                type="password"
                value={confirmPassword}
              />


              {confirmPassword && confirmPassword !== newPassword ? <p role="status" className="mt-2 text-sm text-[#9b4c34]">Passwords do not match yet.</p> : null}
              <button
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
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
    </SidebarPageShell>
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
      <span className="text-[13px] font-medium text-[#626b79]">
        {label}
      </span>
      {type === "password" ? (
        <PasswordInput
          autoComplete={autoComplete}
          className="h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
          onChange={(event) => onChange(event.target.value)}
          required={required}
          value={value}
        />
      ) : (
        <input
          autoComplete={autoComplete}
          className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
          onChange={(event) => onChange(event.target.value)}
          required={required}
          type={type}
          value={value}
        />
      )}
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
      <div className="flex items-center gap-2 text-[13px] font-medium text-[#626b79]">
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
