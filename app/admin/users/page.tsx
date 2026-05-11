"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdminUser,
  ApiError,
  AuthState,
  Role,
  createUser,
  getCurrentUser,
  listUsers,
  readStoredAuth,
  refreshAuth,
  resetUserPassword,
  storeAuth,
  updateUser,
} from "../../../lib/api";

const roles: Role[] = ["viewer", "officer", "knowledge_manager", "admin"];

type UserDraft = {
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};

function userToDraft(user: AdminUser): UserDraft {
  return {
    email: user.email,
    full_name: user.full_name ?? "",
    role: user.role,
    is_active: user.is_active,
  };
}

function formatError(err: unknown) {
  if (err instanceof ApiError) {
    return err.message;
  }
  return err instanceof Error ? err.message : "Unexpected error.";
}

function isNearExpiry(auth: AuthState) {
  return new Date(auth.expires_at).getTime() - Date.now() < 60_000;
}

export default function AdminUsersPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    email: "",
    full_name: "",
    password: "",
    role: "viewer" as Role,
    must_change_password: true,
  });

  const currentUser = auth?.user ?? null;
  const canManage = currentUser?.role === "admin";

  const userCountLabel = useMemo(() => {
    if (users.length === 1) {
      return "1 user";
    }
    return `${users.length} users`;
  }, [users.length]);

  async function ensureToken() {
    const current = auth ?? readStoredAuth();
    if (!current) {
      throw new Error("Please sign in as an admin.");
    }

    if (!isNearExpiry(current)) {
      return current.access_token;
    }

    const refreshed = await refreshAuth(current.refresh_token);
    setAuth(refreshed);
    storeAuth(refreshed);
    return refreshed.access_token;
  }

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const stored = readStoredAuth();
      if (!stored) {
        window.location.assign("/login");
        return;
      }

      const activeAuth = isNearExpiry(stored)
        ? await refreshAuth(stored.refresh_token)
        : stored;
      const me = await getCurrentUser(activeAuth.access_token);
      const nextAuth = { ...activeAuth, user: me };
      setAuth(nextAuth);
      storeAuth(nextAuth);

      if (me.role !== "admin") {
        setError("Admin role is required to manage users.");
        return;
      }

      const data = await listUsers(activeAuth.access_token, 100);
      setUsers(data.users);
      setDrafts(
        Object.fromEntries(
          data.users.map((item) => [item.id, userToDraft(item)]),
        ),
      );
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const token = await ensureToken();
      await createUser(token, {
        email: newUser.email.trim(),
        password: newUser.password,
        role: newUser.role,
        full_name: newUser.full_name.trim() || null,
        must_change_password: newUser.must_change_password,
      });
      setNewUser({
        email: "",
        full_name: "",
        password: "",
        role: "viewer",
        must_change_password: true,
      });
      setNotice("User created.");
      await load();
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function handleSave(user: AdminUser) {
    const draft = drafts[user.id];
    if (!draft) {
      return;
    }

    setError(null);
    setNotice(null);
    setSavingUserId(user.id);
    try {
      const token = await ensureToken();
      await updateUser(token, user.id, {
        email: draft.email.trim(),
        full_name: draft.full_name.trim() || null,
        role: draft.role,
        is_active: draft.is_active,
      });
      setNotice("User updated.");
      await load();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSavingUserId(null);
    }
  }

  async function handleResetPassword(user: AdminUser) {
    const newPassword = window.prompt(`New password for ${user.email}`);
    if (!newPassword) {
      return;
    }

    setError(null);
    setNotice(null);
    setResettingUserId(user.id);
    try {
      const token = await ensureToken();
      await resetUserPassword(token, user.id, newPassword, true);
      setNotice("Password reset. User must change it at next sign-in.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setResettingUserId(null);
    }
  }

  return (
    <main className="min-h-screen bg-surface px-5 py-6 text-on-surface sm:px-8">
      <div className="mx-auto max-w-6xl">
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
              User Management
            </h1>
            <p className="mt-2 text-[14px] text-[#626b79]">
              Create accounts, assign roles, disable access, and reset pilot
              passwords.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded border border-[#b7d6c4] bg-[#edf8f1] px-3 py-2 text-[13px] font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" />
            {currentUser?.email ?? "Admin"}
          </div>
        </header>

        {error ? (
          <div className="mt-5 flex items-start gap-3 rounded border border-[#f0c4b6] bg-[#fff5f1] px-4 py-3 text-[#743f2c]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-[14px] leading-5">{error}</p>
          </div>
        ) : null}

        {notice ? (
          <div className="mt-5 flex items-start gap-3 rounded border border-[#b7d6c4] bg-[#edf8f1] px-4 py-3 text-primary">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-[14px] leading-5">{notice}</p>
          </div>
        ) : null}

        <section className="mt-6 grid gap-5 lg:grid-cols-[0.85fr_1.4fr]">
          <form
            className="rounded border border-outline-variant bg-white p-5 shadow-tonal"
            onSubmit={handleCreateUser}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
                <Plus className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-[19px] font-bold text-[#151a18]">
                  Create User
                </h2>
                <p className="text-[14px] text-[#626b79]">Admin only</p>
              </div>
            </div>

            <TextField
              label="Email"
              onChange={(value) =>
                setNewUser((current) => ({ ...current, email: value }))
              }
              required
              type="email"
              value={newUser.email}
            />
            <TextField
              label="Full name"
              onChange={(value) =>
                setNewUser((current) => ({ ...current, full_name: value }))
              }
              value={newUser.full_name}
            />
            <TextField
              label="Initial password"
              minLength={8}
              onChange={(value) =>
                setNewUser((current) => ({ ...current, password: value }))
              }
              required
              type="password"
              value={newUser.password}
            />

            <label className="mt-4 block">
              <span className="text-[13px] font-semibold uppercase text-[#626b79]">
                Role
              </span>
              <select
                className="mt-2 h-11 w-full rounded border border-outline-variant bg-white px-3 text-[15px]"
                onChange={(event) =>
                  setNewUser((current) => ({
                    ...current,
                    role: event.target.value as Role,
                  }))
                }
                value={newUser.role}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-[#26384d]">
              <input
                checked={newUser.must_change_password}
                onChange={(event) =>
                  setNewUser((current) => ({
                    ...current,
                    must_change_password: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Require password change
            </label>

            <button
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!canManage || loading}
              type="submit"
            >
              <Plus className="h-4 w-4" />
              Create account
            </button>
          </form>

          <section className="rounded border border-outline-variant bg-white p-5 shadow-tonal">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
                  <UserCog className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-bold text-[#151a18]">
                    Users
                  </h2>
                  <p className="text-[14px] text-[#626b79]">
                    {loading ? "Loading" : userCountLabel}
                  </p>
                </div>
              </div>
              <button
                className="inline-flex h-10 items-center gap-2 rounded border border-outline-variant bg-white px-3 text-[14px] font-semibold text-[#26384d] hover:bg-surface-container-low disabled:opacity-60"
                disabled={loading}
                onClick={() => void load()}
                type="button"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </button>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
                <thead>
                  <tr className="text-[12px] uppercase text-[#7b8492]">
                    <th className="border-b border-outline-variant px-3 py-2">
                      Email
                    </th>
                    <th className="border-b border-outline-variant px-3 py-2">
                      Name
                    </th>
                    <th className="border-b border-outline-variant px-3 py-2">
                      Role
                    </th>
                    <th className="border-b border-outline-variant px-3 py-2">
                      Active
                    </th>
                    <th className="border-b border-outline-variant px-3 py-2">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const draft = drafts[user.id] ?? userToDraft(user);
                    const saving = savingUserId === user.id;
                    const resetting = resettingUserId === user.id;

                    return (
                      <tr key={user.id}>
                        <td className="border-b border-outline-variant/60 px-3 py-3">
                          <input
                            className="h-10 w-full rounded border border-outline-variant px-2 text-[14px]"
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [user.id]: {
                                  ...draft,
                                  email: event.target.value,
                                },
                              }))
                            }
                            value={draft.email}
                          />
                        </td>
                        <td className="border-b border-outline-variant/60 px-3 py-3">
                          <input
                            className="h-10 w-full rounded border border-outline-variant px-2 text-[14px]"
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [user.id]: {
                                  ...draft,
                                  full_name: event.target.value,
                                },
                              }))
                            }
                            value={draft.full_name}
                          />
                        </td>
                        <td className="border-b border-outline-variant/60 px-3 py-3">
                          <select
                            className="h-10 w-full rounded border border-outline-variant bg-white px-2 text-[14px]"
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [user.id]: {
                                  ...draft,
                                  role: event.target.value as Role,
                                },
                              }))
                            }
                            value={draft.role}
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="border-b border-outline-variant/60 px-3 py-3">
                          <input
                            checked={draft.is_active}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [user.id]: {
                                  ...draft,
                                  is_active: event.target.checked,
                                },
                              }))
                            }
                            type="checkbox"
                          />
                        </td>
                        <td className="border-b border-outline-variant/60 px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              className="grid h-10 w-10 place-items-center rounded border border-outline-variant text-[#26384d] hover:bg-surface-container-low disabled:opacity-60"
                              disabled={!canManage || saving}
                              onClick={() => void handleSave(user)}
                              title="Save user"
                              type="button"
                            >
                              {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              className="grid h-10 w-10 place-items-center rounded border border-outline-variant text-[#26384d] hover:bg-surface-container-low disabled:opacity-60"
                              disabled={!canManage || resetting}
                              onClick={() => void handleResetPassword(user)}
                              title="Reset password"
                              type="button"
                            >
                              {resetting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <KeyRound className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function TextField({
  label,
  minLength,
  onChange,
  required = false,
  type = "text",
  value,
}: {
  label: string;
  minLength?: number;
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
        className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
        minLength={minLength}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}
