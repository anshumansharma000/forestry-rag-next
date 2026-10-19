"use client";

import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  UserCog,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { SidePanel } from "../../../components/side-panel";
import { RowActions } from "../../../components/row-actions";
import { PasswordInput } from "../../../components/password-input";
import { SidebarPageShell } from "../../../components/app-sidebar";
import { validatePassword } from "../../../lib/auth-client";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rowFeedback, setRowFeedback] = useState<Record<string, { tone: "success" | "error"; message: string }>>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetValidation, setResetValidation] = useState<string | null>(null);
  const resetCloseRef = useRef<HTMLButtonElement>(null);
  const [newUser, setNewUser] = useState({
    email: "",
    full_name: "",
    password: "",
    role: "viewer" as Role,
    must_change_password: true,
  });

  const currentUser = auth?.user ?? null;
  const canManage = currentUser?.role === "admin";

  const filteredUsers = useMemo(() => users.filter(user => {
    const search = userSearch.trim().toLowerCase();
    return (!search || `${user.email} ${user.full_name ?? ""}`.toLowerCase().includes(search)) && (!roleFilter || user.role === roleFilter) && (!statusFilter || user.is_active === (statusFilter === "active"));
  }), [users, userSearch, roleFilter, statusFilter]);
  const editDraft = editUser ? drafts[editUser.id] ?? userToDraft(editUser) : null;

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

  useEffect(() => {
    if (!resetUser) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    resetCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setResetUser(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [resetUser]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (creating) return;
    setCreating(true);
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
      setCreateOpen(false);
      setNotice("User created.");
      await load();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setCreating(false);
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
      setRowFeedback(current => ({ ...current, [user.id]: { tone: "success", message: "Changes saved." } }));
      setEditUser(null);
      await load();
    } catch (err) {
      setRowFeedback(current => ({ ...current, [user.id]: { tone: "error", message: formatError(err) } }));
    } finally {
      setSavingUserId(null);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetUser) return;
    const validation = validatePassword(resetPassword);
    if (!validation.valid) {
      setResetValidation(validation.errors.join(" "));
      return;
    }
    if (resetPassword !== resetConfirmation) {
      setResetValidation("Passwords do not match.");
      return;
    }

    setError(null);
    setNotice(null);
    setResetValidation(null);
    setResettingUserId(resetUser.id);
    try {
      const token = await ensureToken();
      await resetUserPassword(token, resetUser.id, resetPassword, true);
      setRowFeedback(current => ({ ...current, [resetUser.id]: { tone: "success", message: "Password reset. A new password is required at next sign-in." } }));
      setResetUser(null);
      setResetPassword("");
      setResetConfirmation("");
    } catch (err) {
      setResetValidation(formatError(err));
    } finally {
      setResettingUserId(null);
    }
  }

  return (
    <SidebarPageShell activePath="/admin/users" user={currentUser}>
    <main className="min-h-[calc(100vh-72px)] bg-surface px-5 py-6 text-on-surface sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-6 text-[#626b79]">Manage accounts, roles, and access.</p>
          <button className="primary-button" disabled={!canManage || loading} onClick={() => { setError(null); setCreateOpen(true); }} type="button"><Plus className="h-4 w-4" />Add user</button>
        </div>

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

        <section className="mt-6">


          <section className="rounded-2xl border border-outline-variant/60 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
                  <UserCog className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-bold text-[#151a18]">
                    Accounts
                  </h2>
                  <p className="text-[14px] text-[#626b79]">
                    {loading ? "Loading" : `${filteredUsers.length} of ${users.length} loaded users`}
                  </p>
                </div>
              </div>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-outline-variant/70 bg-white px-3 text-[14px] font-semibold text-[#26384d] hover:bg-surface-container-low disabled:opacity-60"
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

            <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_160px]">
              <input className="field" type="search" aria-label="Search loaded users" placeholder="Search by name or email" value={userSearch} onChange={event => setUserSearch(event.target.value)} />
              <select aria-label="Filter users by role" className="field" value={roleFilter} onChange={event => setRoleFilter(event.target.value)}><option value="">All roles</option>{roles.map(role => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select>
              <select aria-label="Filter users by status" className="field" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select>
            </div>
            {!loading && !filteredUsers.length ? <p className="mt-5 rounded-xl bg-[#f6f8f6] p-5 text-sm text-[#626b79]">{users.length ? "No users match these filters." : "No users are available."}</p> : null}
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
                  {filteredUsers.map((user) => {
                    return (
                      <tr key={user.id}>
                        <td className="border-b border-outline-variant/50 px-3 py-4 text-sm">
                          <span className="font-medium text-[#25392d]">{user.email}</span>
                          {rowFeedback[user.id] ? <p role="status" className={`mt-1 text-xs ${rowFeedback[user.id].tone === "error" ? "text-[#9b4c34]" : "text-primary"}`}>{rowFeedback[user.id].message}</p> : null}
                        </td>
                        <td className="border-b border-outline-variant/50 px-3 py-4 text-sm text-[#626b79]">{user.full_name || "—"}</td>
                        <td className="border-b border-outline-variant/50 px-3 py-4"><span className="rounded-full bg-[#f0f4f1] px-2.5 py-1 text-xs capitalize text-[#44584b]">{user.role.replaceAll("_", " ")}</span></td>
                        <td className="border-b border-outline-variant/50 px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${user.is_active ? "bg-[#edf6ef] text-primary" : "bg-[#f1f1f1] text-[#626b79]"}`}>{user.is_active ? "Active" : "Disabled"}</span></td>
                        <td className="border-b border-outline-variant/50 px-3 py-4">
                          <RowActions label={`Actions for ${user.email}`} disabled={!canManage || savingUserId === user.id || resettingUserId === user.id} actions={[
                            { label: "Edit account and role", run: () => { setDrafts(current => ({ ...current, [user.id]: userToDraft(user) })); setEditUser(user); } },
                            { label: user.is_active ? "Disable access…" : "Enable access…", run: () => { setDrafts(current => ({ ...current, [user.id]: { ...userToDraft(user), is_active: !user.is_active } })); setEditUser(user); } },
                            { label: "Reset password…", run: () => { setResetUser(user); setResetPassword(""); setResetConfirmation(""); setResetValidation(null); } },
                          ]} />
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
      {createOpen ? <SidePanel title="Add user" busy={creating} onClose={() => setCreateOpen(false)}>
          <form
            className="space-y-1"
            onSubmit={handleCreateUser}
          >
            <p className="text-sm leading-6 text-[#626b79]">Create a department account and choose its initial role.</p>
            {error ? <p role="alert" className="mt-4 rounded-lg bg-[#fff3ef] p-3 text-sm text-[#743f2c]">{error}</p> : null}
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
              <span className="text-[13px] font-medium text-[#626b79]">
                Role
              </span>
              <select
                className="mt-2 h-11 w-full rounded-lg border border-outline-variant/70 bg-white px-3 text-[15px]"
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
                    {role.replaceAll("_", " ")}
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
              Require a new password at first sign-in
            </label>

            <button
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!canManage || creating}
              type="submit"
            >
              <Plus className="h-4 w-4" />
              {creating ? "Creating…" : "Create account"}
            </button>
          </form>
      </SidePanel> : null}
      {editUser && editDraft ? <SidePanel title="Edit user" busy={savingUserId === editUser.id} onClose={() => setEditUser(null)}>
        <p className="text-sm text-[#626b79]">{editUser.email}</p>
        <form onSubmit={event => { event.preventDefault(); void handleSave(editUser); }}>
          {rowFeedback[editUser.id]?.tone === "error" ? <p role="alert" className="mt-4 rounded-lg bg-[#fff3ef] p-3 text-sm text-[#743f2c]">{rowFeedback[editUser.id].message}</p> : null}
          <TextField label="Email" type="email" required value={editDraft.email} onChange={email => setDrafts(current => ({ ...current, [editUser.id]: { ...editDraft, email } }))} />
          <TextField label="Full name" value={editDraft.full_name} onChange={full_name => setDrafts(current => ({ ...current, [editUser.id]: { ...editDraft, full_name } }))} />
          <label className="mt-4 block text-sm font-medium">Role<select className="field mt-2" value={editDraft.role} onChange={event => setDrafts(current => ({ ...current, [editUser.id]: { ...editDraft, role: event.target.value as Role } }))}>{roles.map(role => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></label>
          <label className="mt-5 flex min-h-11 items-center gap-3 text-sm"><input className="h-4 w-4 accent-primary" type="checkbox" checked={editDraft.is_active} onChange={event => setDrafts(current => ({ ...current, [editUser.id]: { ...editDraft, is_active: event.target.checked } }))} />Account enabled</label>
          {!editDraft.is_active ? <p className="mt-2 rounded-lg bg-[#fff3ef] p-3 text-sm text-[#743f2c]">Saving will disable sign-in for this account.</p> : null}
          <button className="primary-button mt-6 w-full" disabled={savingUserId === editUser.id} type="submit">{savingUserId === editUser.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save changes</button>
        </form>
      </SidePanel> : null}
      {resetUser ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setResetUser(null);
          }}
          role="presentation"
        >
          <form
            aria-labelledby="reset-password-title"
            aria-modal="true"
            className="w-full max-w-md rounded bg-white p-6 shadow-xl"
            onSubmit={handleResetPassword}
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-primary" id="reset-password-title">Reset password</h2>
                <p className="mt-1 text-sm text-[#626b79]">{resetUser.email}</p>
              </div>
              <button aria-label="Close password reset" className="grid h-11 w-11 place-items-center rounded hover:bg-surface-container-low" onClick={() => setResetUser(null)} ref={resetCloseRef} type="button"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-4 text-sm leading-5 text-[#4e5966]">The user will be required to choose another password at their next sign-in.</p>
            {resetValidation ? <p className="mt-4 rounded border border-[#f0c4b6] bg-[#fff5f1] p-3 text-sm text-[#743f2c]" role="alert">{resetValidation}</p> : null}
            <TextField label="Temporary password" minLength={8} onChange={setResetPassword} required type="password" value={resetPassword} />
            <TextField label="Confirm temporary password" minLength={8} onChange={setResetConfirmation} required type="password" value={resetConfirmation} />
            <div className="mt-6 flex justify-end gap-3">
              <button className="secondary-button" onClick={() => setResetUser(null)} type="button">Cancel</button>
              <button className="primary-button" disabled={resettingUserId === resetUser.id} type="submit">{resettingUserId === resetUser.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Reset password</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
    </SidebarPageShell>
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
      <span className="text-[13px] font-medium text-[#626b79]">
        {label}
      </span>
      {type === "password" ? (
        <PasswordInput
          className="h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
          minLength={minLength}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          value={value}
        />
      ) : (
        <input
          className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
          minLength={minLength}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          type={type}
          value={value}
        />
      )}
    </label>
  );
}
