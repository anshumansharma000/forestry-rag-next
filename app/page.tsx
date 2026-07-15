"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  FileText,
  KeyRound,
  Loader2,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  UserCircle,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  formatApiError,
  isTokenNearExpiry,
  validatePassword,
} from "../lib/auth-client";
import {
  API_BASE_URL,
  ApiError,
  AuthState,
  AuthUser,
  ChatMessage,
  ChatSession,
  ConfigStatus,
  Source,
  askSession,
  changePassword,
  clearStoredAuth,
  createSession,
  deleteMessage,
  deleteSession,
  getConfigStatus,
  getCurrentUser,
  getHealth,
  getMessages,
  listSessions,
  login,
  readStoredAuth,
  refreshAuth,
  storeAuth,
} from "../lib/api";

type PendingState = {
  auth: boolean;
  config: boolean;
  sessions: boolean;
  messages: boolean;
  send: boolean;
};

const emptyPending: PendingState = {
  auth: true,
  config: false,
  sessions: false,
  messages: false,
  send: false,
};

const DEFAULT_TOP_K = 5;

function nowIso() {
  return new Date().toISOString();
}

function isAdminUser(user: AuthUser | null) {
  return user?.role === "admin";
}

function canManageDocuments(user: AuthUser | null) {
  return user?.role === "admin" || user?.role === "knowledge_manager";
}

function formatWhen(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function pageRange(source: Source) {
  if (source.page_start == null && source.page_end == null) {
    return "No page";
  }
  if (source.page_start === source.page_end || source.page_end == null) {
    return `Page ${source.page_start}`;
  }
  return `Pages ${source.page_start}-${source.page_end}`;
}

function evidenceRoleLabel(source: Source) {
  return source.evidence_role === "neighbor" ? "Nearby context" : "Matched";
}

function messageAbstained(message: ChatMessage) {
  return message.metadata?.abstained === true;
}

function messageConfidence(message: ChatMessage) {
  const confidence = message.metadata?.retrieval_confidence;
  return typeof confidence === "number" ? confidence : null;
}

function readChatIdFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  return new URL(window.location.href).searchParams.get("chat");
}

function writeChatIdToUrl(sessionId: string | null, replace = false) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (sessionId) {
    url.searchParams.set("chat", sessionId);
  } else {
    url.searchParams.delete("chat");
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (nextUrl === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    return;
  }

  if (replace) {
    window.history.replaceState(null, "", nextUrl);
  } else {
    window.history.pushState(null, "", nextUrl);
  }
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export default function Home() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pending, setPending] = useState<PendingState>(emptyPending);
  const [error, setError] = useState<string | null>(null);

  const setPendingKey = useCallback(
    (key: keyof PendingState, value: boolean) => {
      setPending((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const replaceAuth = useCallback((nextAuth: AuthState | null) => {
    setAuth(nextAuth);
    setUser(nextAuth?.user ?? null);
    if (nextAuth) {
      storeAuth(nextAuth);
    } else {
      clearStoredAuth();
    }
  }, []);

  const ensureAuth = useCallback(async () => {
    if (!auth) {
      throw new Error("Please sign in again.");
    }

    if (!isTokenNearExpiry(auth)) {
      return auth.access_token;
    }

    const refreshed = await refreshAuth(auth.refresh_token);
    replaceAuth(refreshed);
    return refreshed.access_token;
  }, [auth, replaceAuth]);

  const logout = useCallback(() => {
    replaceAuth(null);
    setError(null);
  }, [replaceAuth]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const stored = readStoredAuth();
      if (!stored) {
        setPendingKey("auth", false);
        return;
      }

      try {
        const activeAuth = isTokenNearExpiry(stored)
          ? await refreshAuth(stored.refresh_token)
          : stored;
        const me = await getCurrentUser(activeAuth.access_token);
        if (!cancelled) {
          replaceAuth({ ...activeAuth, user: me });
        }
      } catch {
        if (!cancelled) {
          replaceAuth(null);
        }
      } finally {
        if (!cancelled) {
          setPendingKey("auth", false);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [replaceAuth, setPendingKey]);

  async function handleLogin(email: string, password: string) {
    setError(null);
    setPendingKey("auth", true);
    try {
      replaceAuth(await login(email, password));
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setPendingKey("auth", false);
    }
  }

  async function handlePasswordChange(
    currentPassword: string,
    newPassword: string,
  ) {
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      setError(validation.errors.join(" "));
      return;
    }

    const token = await ensureAuth();
    setError(null);
    setPendingKey("auth", true);
    try {
      replaceAuth(await changePassword(token, currentPassword, newPassword));
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setPendingKey("auth", false);
    }
  }

  if (pending.auth && !auth) {
    return <LoadingScreen />;
  }

  if (!auth || !user) {
    return (
      <LoginPage
        error={error}
        loading={pending.auth}
        onLogin={(email, password) => void handleLogin(email, password)}
      />
    );
  }

  if (user.must_change_password) {
    return (
      <PasswordChangePage
        error={error}
        loading={pending.auth}
        onChange={(currentPassword, newPassword) =>
          void handlePasswordChange(currentPassword, newPassword)
        }
        onLogout={logout}
        user={user}
      />
    );
  }

  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <RagAssistant
        ensureAuth={ensureAuth}
        logout={logout}
        onAuthExpired={logout}
        setGlobalError={setError}
        user={user}
      />
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface text-on-surface">
      <div className="flex items-center gap-3 rounded border border-outline-variant bg-white px-5 py-4 shadow-tonal">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-[15px] font-semibold">Loading session</span>
      </div>
    </main>
  );
}

function LoginPage({
  error,
  loading,
  onLogin,
}: {
  error: string | null;
  loading: boolean;
  onLogin: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLogin(email.trim(), password);
  }

  return (
    <main className="grid min-h-screen bg-surface px-5 py-8 text-on-surface lg:grid-cols-[1fr_440px] lg:px-0 lg:py-0">
      <section className="hidden min-h-screen items-center bg-primary px-12 text-white lg:flex">
        <div className="max-w-2xl">
          <div className="grid h-16 w-16 place-items-center rounded-lg bg-white/10">
            <ShieldCheck className="h-9 w-9" />
          </div>
          <h1 className="mt-8 text-[42px] font-bold leading-[1.12]">
            Aranyabodh
          </h1>
          <p className="mt-5 max-w-xl text-[18px] leading-7 text-white/78">
            Query indexed department documents, preserve cited source context,
            and manage pilot access through role-based accounts.
          </p>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-[440px] items-center lg:px-10">
        <form
          className="w-full rounded border border-outline-variant bg-white p-6 shadow-tonal"
          onSubmit={handleSubmit}
        >
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-[24px] font-bold text-primary">Sign in</h2>
              <p className="text-[14px] text-[#626b79]">{API_BASE_URL}</p>
            </div>
          </div>

          {error ? <FormError message={error} /> : null}

          <label className="mt-6 block">
            <span className="text-[13px] font-semibold uppercase text-[#626b79]">
              Email
            </span>
            <input
              autoComplete="email"
              className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="mt-4 block">
            <span className="text-[13px] font-semibold uppercase text-[#626b79]">
              Password
            </span>
            <input
              autoComplete="current-password"
              className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <button
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-[15px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

function PasswordChangePage({
  error,
  loading,
  onChange,
  onLogout,
  user,
}: {
  error: string | null;
  loading: boolean;
  onChange: (currentPassword: string, newPassword: string) => void;
  onLogout: () => void;
  user: AuthUser;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      setValidationError(validation.errors.join(" "));
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError("New password and confirmation do not match.");
      return;
    }
    setValidationError(null);
    onChange(currentPassword, newPassword);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-surface px-5 py-8 text-on-surface">
      <form
        className="w-full max-w-[460px] rounded border border-outline-variant bg-white p-6 shadow-tonal"
        onSubmit={handleSubmit}
      >
        <h1 className="text-[24px] font-bold text-primary">Change password</h1>
        <p className="mt-2 text-[14px] leading-5 text-[#626b79]">
          {user.email} must set a new password before continuing.
        </p>

        {validationError ? <FormError message={validationError} /> : null}
        {error ? <FormError message={error} /> : null}

        <label className="mt-6 block">
          <span className="text-[13px] font-semibold uppercase text-[#626b79]">
            Current password
          </span>
          <input
            autoComplete="current-password"
            className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            type="password"
            value={currentPassword}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-[13px] font-semibold uppercase text-[#626b79]">
            New password
          </span>
          <input
            autoComplete="new-password"
            className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
            minLength={8}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            type="password"
            value={newPassword}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-[13px] font-semibold uppercase text-[#626b79]">
            Confirm new password
          </span>
          <input
            autoComplete="new-password"
            className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </label>

        <PasswordRules password={newPassword} />

        <div className="mt-6 flex gap-3">
          <button
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded bg-primary px-4 text-[15px] font-semibold text-white disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Update password
          </button>
          <button
            className="h-11 rounded border border-outline-variant bg-white px-4 text-[15px] font-semibold text-[#26384d]"
            onClick={onLogout}
            type="button"
          >
            Sign out
          </button>
        </div>
      </form>
    </main>
  );
}

function RagAssistant({
  ensureAuth,
  logout,
  onAuthExpired,
  setGlobalError,
  user,
}: {
  ensureAuth: () => Promise<string>;
  logout: () => void;
  onAuthExpired: () => void;
  setGlobalError: (message: string | null) => void;
  user: AuthUser;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [health, setHealth] = useState<string>("unknown");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingState>({
    ...emptyPending,
    auth: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [topK, setTopK] = useState(DEFAULT_TOP_K);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  );
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(
    null,
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  const setPendingKey = useCallback(
    (key: keyof PendingState, value: boolean) => {
      setPending((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) {
        onAuthExpired();
        return;
      }
      const message = err instanceof Error ? err.message : fallback;
      setError(message);
      setGlobalError(message);
    },
    [onAuthExpired, setGlobalError],
  );

  const loadConfig = useCallback(async () => {
    setPendingKey("config", true);
    try {
      const [healthResponse, configResponse] = await Promise.all([
        getHealth(),
        getConfigStatus(),
      ]);
      setHealth(healthResponse.status);
      setConfig(configResponse);
    } catch (err) {
      setHealth("error");
      handleError(err, "Unable to load backend status.");
    } finally {
      setPendingKey("config", false);
    }
  }, [handleError, setPendingKey]);

  const loadSessions = useCallback(async () => {
    setPendingKey("sessions", true);
    try {
      const token = await ensureAuth();
      const data = await listSessions(token);
      setSessions(data.sessions);
      setActiveSessionId((current) => {
        if (!current) {
          return null;
        }

        const sessionExists = data.sessions.some((item) => item.id === current);
        if (!sessionExists) {
          writeChatIdToUrl(null, true);
          return null;
        }

        return current;
      });
    } catch (err) {
      handleError(err, "Unable to load sessions.");
    } finally {
      setPendingKey("sessions", false);
    }
  }, [ensureAuth, handleError, setPendingKey]);

  const loadMessages = useCallback(
    async (sessionId: string) => {
      setPendingKey("messages", true);
      try {
        const token = await ensureAuth();
        const data = await getMessages(token, sessionId);
        setMessages(data.messages);
      } catch (err) {
        handleError(err, "Unable to load messages.");
      } finally {
        setPendingKey("messages", false);
      }
    },
    [ensureAuth, handleError, setPendingKey],
  );

  useEffect(() => {
    void loadConfig();
    void loadSessions();
  }, [loadConfig, loadSessions]);

  useEffect(() => {
    const applyUrlSession = () => {
      setActiveSessionId(readChatIdFromUrl());
      setSearchQuery(null);
    };

    applyUrlSession();
    window.addEventListener("popstate", applyUrlSession);
    return () => {
      window.removeEventListener("popstate", applyUrlSession);
    };
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      void loadMessages(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending.send]);

  async function createChatSession(title?: string) {
    const token = await ensureAuth();
    const session = await createSession(token, title);
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    writeChatIdToUrl(session.id);
    return session;
  }

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || pending.send) {
      return;
    }

    setError(null);
    setGlobalError(null);
    setSearchQuery(null);
    setPendingKey("send", true);

    const optimisticMessage: ChatMessage = {
      id: `pending-${Date.now()}`,
      session_id: activeSessionId ?? "pending-session",
      role: "user",
      content: message,
      sources: [],
      metadata: { pending: true },
      created_at: nowIso(),
    };

    setMessages((current) => [...current, optimisticMessage]);

    try {
      const session =
        activeSessionId == null
          ? await createChatSession(message.slice(0, 80))
          : sessions.find((item) => item.id === activeSessionId);
      if (!session) {
        throw new Error("Unable to resolve chat session.");
      }

      const token = await ensureAuth();
      const response = await askSession(token, session.id, message, topK);
      setSearchQuery(response.search_query ?? null);
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticMessage.id),
        response.user_message,
        {
          ...response.assistant_message,
          metadata: {
            ...response.assistant_message.metadata,
            retrieval_confidence: response.confidence,
            abstained: response.abstained,
          },
          sources:
            response.sources?.length > 0
              ? response.sources
              : response.assistant_message.sources,
        },
      ]);
      setActiveSessionId(response.session_id);
      writeChatIdToUrl(response.session_id, true);
      void loadSessions();
    } catch (err) {
      setMessages((current) =>
        current.filter((item) => item.id !== optimisticMessage.id),
      );
      handleError(err, "Unable to send message.");
    } finally {
      setPendingKey("send", false);
    }
  }

  async function removeSession(sessionId: string) {
    if (deletingSessionId) {
      return;
    }

    const session = sessions.find((item) => item.id === sessionId);
    const confirmed = window.confirm(
      `Delete "${session?.title || "Untitled session"}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingSessionId(sessionId);
    try {
      const token = await ensureAuth();
      await deleteSession(token, sessionId);
      const remaining = sessions.filter((item) => item.id !== sessionId);
      setSessions(remaining);
      if (sessionId === activeSessionId) {
        setActiveSessionId(null);
        setMessages([]);
        writeChatIdToUrl(null);
      }
    } catch (err) {
      handleError(err, "Unable to delete chat session.");
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function removeUserMessage(message: ChatMessage) {
    if (deletingMessageId || message.metadata?.pending === true) {
      return;
    }

    if (!window.confirm("Delete this user message?")) {
      return;
    }

    setDeletingMessageId(message.id);
    try {
      const token = await ensureAuth();
      await deleteMessage(token, message.session_id, message.id);
      setMessages((current) =>
        current.filter((item) => item.id !== message.id),
      );
    } catch (err) {
      handleError(err, "Unable to delete chat message.");
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function retryUserMessage(message: ChatMessage) {
    if (pending.send || message.metadata?.pending === true) {
      return;
    }

    setRetryingMessageId(message.id);
    try {
      await sendMessage(message.content);
    } finally {
      setRetryingMessageId(null);
    }
  }

  const configReady = Boolean(
    config?.gemini_api_key_configured &&
    config?.supabase_url_configured &&
    config?.supabase_service_role_key_configured &&
    config?.supabase_url_valid &&
    config?.jwt_secret_key_configured,
  );

  return (
    <>
      <Sidebar
        activeSessionId={activeSessionId}
        deletingSessionId={deletingSessionId}
        onClose={() => setSidebarOpen(false)}
        onDeleteSession={(sessionId) => void removeSession(sessionId)}
        onNewChat={() => {
          setActiveSessionId(null);
          setMessages([]);
          setSearchQuery(null);
          writeChatIdToUrl(null);
          setSidebarOpen(false);
        }}
        onSelectSession={(sessionId) => {
          setActiveSessionId(sessionId);
          setSearchQuery(null);
          writeChatIdToUrl(sessionId);
          setSidebarOpen(false);
        }}
        open={sidebarOpen}
        pending={pending.sessions}
        sessions={sessions}
      />

      {sidebarOpen ? (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-on-surface/25 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <section className="min-h-screen lg:pl-[360px]">
        <Header
          configReady={configReady}
          onAdminClick={() => setAdminOpen(!adminOpen)}
          onLogout={logout}
          onMenuClick={() => setSidebarOpen(true)}
          user={user}
        />

        {adminOpen ? (
          <AdminPanel
            config={config}
            health={health}
            onRefresh={() => void loadConfig()}
            pending={pending}
            user={user}
          />
        ) : null}

        {error ? (
          <ErrorBanner message={error} onClose={() => setError(null)} />
        ) : null}

        <ChatWorkspace
          bottomRef={bottomRef}
          deletingMessageId={deletingMessageId}
          messages={messages}
          onDeleteUserMessage={(message) => void removeUserMessage(message)}
          onRetryUserMessage={(message) => void retryUserMessage(message)}
          onSelectSource={setSelectedSource}
          onSend={(message) => void sendMessage(message)}
          pending={pending}
          retryingMessageId={retryingMessageId}
          searchQuery={searchQuery}
          setTopK={setTopK}
          topK={topK}
          user={user}
        />
      </section>

      <SourceDrawer
        onClose={() => setSelectedSource(null)}
        source={selectedSource}
      />
    </>
  );
}

function Sidebar({
  activeSessionId,
  deletingSessionId,
  open,
  onClose,
  onDeleteSession,
  onNewChat,
  onSelectSession,
  pending,
  sessions,
}: {
  activeSessionId: string | null;
  deletingSessionId: string | null;
  open: boolean;
  onClose: () => void;
  onDeleteSession: (sessionId: string) => void;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  pending: boolean;
  sessions: ChatSession[];
}) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-[320px] max-w-[86vw] flex-col border-r border-outline-variant/60 bg-white transition-transform duration-200 lg:w-[360px] lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-start justify-between px-7 pb-7 pt-8">
        <div>
          <h1 className="text-[26px] font-bold leading-8 text-primary">
            Aranyabodh
          </h1>
          <p className="mt-2 text-[14px] font-medium uppercase leading-4 text-[#626b79]">
            RAG Analysis Engine
          </p>
        </div>
        <button
          aria-label="Close sidebar"
          className="mt-1 grid h-10 w-10 place-items-center rounded border border-outline-variant text-[#5f6875] lg:hidden"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" strokeWidth={2.2} />
        </button>
      </div>

      <div className="px-5">
        <button
          className="flex h-[56px] w-full items-center justify-center gap-3 rounded bg-primary text-[18px] font-medium text-white transition hover:bg-primary-container"
          onClick={onNewChat}
          type="button"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
          New Chat
        </button>
      </div>

      <nav className="mt-8 px-5">
        <ul className="space-y-3">
          <SidebarLink active href="/" icon={MessageSquareText} label="Chat" />
          <SidebarLink href="/ingestion" icon={FileText} label="Ingestion" />
          <SidebarLink href="/profile" icon={UserCircle} label="Profile" />
        </ul>
      </nav>

      <section className="mt-8 flex min-h-0 flex-1 flex-col px-7 pb-8">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold uppercase leading-5 text-[#7b8492]">
            Sessions
          </p>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : null}
        </div>
        <div className="mt-4 min-h-0 space-y-2 overflow-y-auto pr-1">
          {sessions.length === 0 && !pending ? (
            <p className="rounded border border-dashed border-outline-variant p-3 text-[14px] leading-5 text-[#626b79]">
              No chat sessions yet.
            </p>
          ) : null}
          {sessions.map((session) => {
            const deleting = deletingSessionId === session.id;

            return (
              <div
                className={`flex w-full items-start gap-2 rounded px-3 py-3 text-left transition ${
                  session.id === activeSessionId
                    ? "bg-[#e8f8ef] text-primary"
                    : "hover:bg-surface-container-low"
                }`}
                key={session.id}
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  disabled={deleting}
                  onClick={() => onSelectSession(session.id)}
                  type="button"
                >
                  <span className="block truncate text-[15px] font-semibold leading-5">
                    {session.title || "Untitled session"}
                  </span>
                  <span className="mt-1 block text-[12px] leading-4 text-[#7b8492]">
                    {formatWhen(session.updated_at)}
                  </span>
                </button>
                <button
                  aria-label={`Delete ${session.title || "chat session"}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded text-[#8d5a4a] transition hover:bg-[#fff3ef] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={deleting}
                  onClick={() => onDeleteSession(session.id)}
                  title="Delete session"
                  type="button"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

function SidebarLink({
  active = false,
  href,
  icon: Icon,
  label,
}: {
  active?: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <li>
      <a
        className={`relative flex h-[54px] items-center gap-5 rounded-sm px-5 text-[18px] font-medium ${
          active
            ? "bg-[#e8f8ef] text-primary before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-primary"
            : "text-[#26384d]"
        }`}
        href={href}
      >
        <Icon className="h-5 w-5" strokeWidth={2.1} />
        {label}
      </a>
    </li>
  );
}

function Header({
  configReady,
  onAdminClick,
  onLogout,
  onMenuClick,
  user,
}: {
  configReady: boolean;
  onAdminClick: () => void;
  onLogout: () => void;
  onMenuClick: () => void;
  user: AuthUser;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[89px] items-center justify-between border-b border-outline-variant/60 bg-white px-5 sm:px-8 lg:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <button
          aria-label="Open sidebar"
          className="grid h-10 w-10 shrink-0 place-items-center rounded border border-outline-variant text-[#5f6875] lg:hidden"
          onClick={onMenuClick}
          type="button"
        >
          <Menu className="h-5 w-5" strokeWidth={2.2} />
        </button>
        <h2 className="truncate text-[21px] font-bold leading-8 text-primary sm:text-[24px]">
          Aranyabodh
        </h2>
      </div>
      <div className="flex items-center gap-3 text-[#626b79] sm:gap-4">
        <StatusPill ready={configReady} />
        {isAdminUser(user) ? (
          <a
            className="hidden h-10 items-center gap-2 rounded border border-outline-variant px-3 text-[14px] font-semibold text-[#26384d] hover:bg-surface-container-low sm:inline-flex"
            href="/admin/users"
          >
            <UserCircle className="h-4 w-4" />
            Users
          </a>
        ) : null}
        {canManageDocuments(user) ? (
          <a
            className="hidden h-10 items-center gap-2 rounded border border-outline-variant px-3 text-[14px] font-semibold text-[#26384d] hover:bg-surface-container-low sm:inline-flex"
            href="/ingestion"
          >
            <Database className="h-4 w-4" />
            Ingestion
          </a>
        ) : null}
        <a
          aria-label="Profile"
          className="grid h-10 w-10 place-items-center rounded border border-outline-variant text-current transition hover:bg-surface-container-low"
          href="/profile"
          title={`Profile for ${user.email}`}
        >
          <UserCircle className="h-5 w-5" strokeWidth={2.1} />
        </a>
        <button
          aria-label="Admin setup"
          className="grid h-10 w-10 place-items-center rounded border border-outline-variant text-current transition hover:bg-surface-container-low"
          onClick={onAdminClick}
          type="button"
        >
          <Settings className="h-5 w-5" strokeWidth={2.1} />
        </button>
        <button
          aria-label="Sign out"
          className="grid h-10 w-10 place-items-center rounded border border-outline-variant text-current transition hover:bg-surface-container-low"
          onClick={onLogout}
          title={`Sign out ${user.email}`}
          type="button"
        >
          <LogOut className="h-5 w-5" strokeWidth={2.1} />
        </button>
      </div>
    </header>
  );
}

function StatusPill({ ready }: { ready: boolean }) {
  return (
    <span
      className={`hidden h-9 items-center gap-2 rounded border px-3 text-[13px] font-semibold uppercase sm:inline-flex ${
        ready
          ? "border-[#b7d6c4] bg-[#edf8f1] text-primary"
          : "border-[#e0c0b7] bg-[#fff3ef] text-[#743f2c]"
      }`}
    >
      {ready ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
      {ready ? "Configured" : "Setup Needed"}
    </span>
  );
}

function AdminPanel({
  config,
  health,
  onRefresh,
  pending,
  user,
}: {
  config: ConfigStatus | null;
  health: string;
  onRefresh: () => void;
  pending: PendingState;
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
              disabled={pending.config}
              icon={RefreshCw}
              label="Refresh"
              loading={pending.config}
              onClick={onRefresh}
            />
            <AdminButton
              disabled={!canManage}
              icon={Upload}
              label="Open Ingestion"
              loading={false}
              onClick={() => window.location.assign("/ingestion")}
            />
          </div>

          <div className="mt-4 grid gap-3 text-[13px] leading-5 text-[#4e5966] sm:grid-cols-3">
            <Metric
              label="Backend"
              value={health === "ok" ? API_BASE_URL : "Unavailable"}
            />
            <Metric label="Documents" value="Use ingestion page" />
            <Metric label="Index" value="Separate workflow" />
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

function FormError({ message }: { message: string }) {
  return (
    <div className="mt-5 flex items-start gap-3 rounded border border-[#f0c4b6] bg-[#fff5f1] px-3 py-3 text-[#743f2c]">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-[14px] leading-5">{message}</p>
    </div>
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

function ErrorBanner({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="border-b border-[#f0c4b6] bg-[#fff5f1] px-5 py-3 sm:px-8">
      <div className="mx-auto flex max-w-[1168px] items-start gap-3 text-[#743f2c]">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="min-w-0 flex-1 text-[14px] leading-5">{message}</p>
        <button
          aria-label="Dismiss error"
          className="grid h-7 w-7 place-items-center rounded hover:bg-[#f9e7df]"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ChatWorkspace({
  bottomRef,
  deletingMessageId,
  messages,
  onDeleteUserMessage,
  onRetryUserMessage,
  onSelectSource,
  onSend,
  pending,
  retryingMessageId,
  searchQuery,
  setTopK,
  topK,
  user,
}: {
  bottomRef: React.RefObject<HTMLDivElement>;
  deletingMessageId: string | null;
  messages: ChatMessage[];
  onDeleteUserMessage: (message: ChatMessage) => void;
  onRetryUserMessage: (message: ChatMessage) => void;
  onSelectSource: (source: Source) => void;
  onSend: (message: string) => void;
  pending: PendingState;
  retryingMessageId: string | null;
  searchQuery: string | null;
  setTopK: (value: number) => void;
  topK: number;
  user: AuthUser;
}) {
  return (
    <div className="relative min-h-[calc(100vh-89px)] pb-[190px]">
      <div className="mx-auto w-full max-w-[1168px] px-5 pt-10 sm:px-8 lg:pt-12">
        {messages.length === 0 ? <AssistantIntro user={user} /> : null}

        <div className="space-y-7">
          {messages.map((message) =>
            message.role === "user" ? (
              <UserMessage
                deleting={deletingMessageId === message.id}
                key={message.id}
                message={message}
                onDelete={() => onDeleteUserMessage(message)}
                onRetry={() => onRetryUserMessage(message)}
                retryDisabled={pending.send}
                retrying={retryingMessageId === message.id}
              />
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                onSelectSource={onSelectSource}
              />
            ),
          )}
          {pending.send ? <TypingIndicator /> : null}
          {searchQuery ? <DebugDetails searchQuery={searchQuery} /> : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatInput
        disabled={pending.send}
        onSend={onSend}
        setTopK={setTopK}
        topK={topK}
      />
    </div>
  );
}

function AssistantIntro({ user }: { user: AuthUser }) {
  return (
    <section className="mx-auto mb-12 max-w-[730px] text-center">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-lg bg-primary-container text-on-primary-container shadow-tonal">
        <ShieldCheck className="h-10 w-10" strokeWidth={2.2} />
      </div>
      <h3 className="mt-6 text-[22px] font-medium leading-8 text-[#151a18]">
        Aranyabodh
      </h3>
      <p className="mt-3 text-[17px] leading-6 text-[#2d3331]">
        Ask questions over indexed PDF, DOCX, and TXT department sources.
        Answers include citations and excerpts from retrieved chunks.
      </p>
      <div className="mt-7 grid gap-3 text-left sm:grid-cols-2">
        <HomeAction
          href="/profile"
          icon={UserCircle}
          label="Profile"
          text="Review account details and update your password."
        />
        {canManageDocuments(user) ? (
          <HomeAction
            href="/ingestion"
            icon={Database}
            label="Upload & Ingest"
            text="Add documents, run indexing, and preview searchable chunks."
          />
        ) : null}
      </div>
    </section>
  );
}

function HomeAction({
  href,
  icon: Icon,
  label,
  text,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  text: string;
}) {
  return (
    <a
      className="flex min-h-[92px] items-center gap-4 rounded border border-outline-variant bg-white p-4 text-left shadow-tonal transition hover:bg-surface-container-lowest"
      href={href}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded bg-[#edf8f1] text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold text-[#151a18]">
          {label}
        </span>
        <span className="mt-1 block text-[13px] leading-5 text-[#626b79]">
          {text}
        </span>
      </span>
    </a>
  );
}

function UserMessage({
  deleting,
  message,
  onDelete,
  onRetry,
  retryDisabled,
  retrying,
}: {
  deleting: boolean;
  message: ChatMessage;
  onDelete: () => void;
  onRetry: () => void;
  retryDisabled: boolean;
  retrying: boolean;
}) {
  const pendingMessage = message.metadata?.pending === true;

  return (
    <div className="group ml-auto max-w-[840px] rounded-lg bg-surface-container-low px-5 py-[18px] text-[18px] leading-7 text-[#111516] sm:px-6">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 whitespace-pre-wrap">{message.content}</p>
        <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <button
            aria-label="Retry user message"
            className="grid h-8 w-8 place-items-center rounded text-[#4e5966] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pendingMessage || retryDisabled}
            onClick={onRetry}
            title="Retry"
            type="button"
          >
            {retrying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
          <button
            aria-label="Delete user message"
            className="grid h-8 w-8 place-items-center rounded text-[#8d5a4a] transition hover:bg-[#fff3ef] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pendingMessage || deleting}
            onClick={onDelete}
            title="Delete message"
            type="button"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      {pendingMessage ? (
        <p className="mt-2 text-[12px] font-semibold uppercase text-[#7b8492]">
          Sending
        </p>
      ) : null}
    </div>
  );
}

function AssistantMessage({
  message,
  onSelectSource,
}: {
  message: ChatMessage;
  onSelectSource: (source: Source) => void;
}) {
  const abstained = messageAbstained(message);
  const confidence = messageConfidence(message);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyTextToClipboard(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-4 sm:grid-cols-[50px_minmax(0,960px)] sm:gap-5">
      <div
        className={`grid h-[42px] w-[42px] place-items-center rounded-lg text-white sm:h-[50px] sm:w-[50px] ${
          abstained ? "bg-[#8d5a4a]" : "bg-primary"
        }`}
      >
        <ShieldCheck className="h-6 w-6" strokeWidth={2.1} />
      </div>

      <div>
        <article
          className={`rounded-lg border px-5 py-[18px] text-[18px] leading-7 text-[#202625] shadow-tonal sm:px-[22px] ${
            abstained
              ? "border-[#e5bda9] bg-[#fff8f5]"
              : "border-[#d9dee4] bg-white"
          }`}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            {abstained ? (
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase leading-4 text-[#8d5a4a]">
                <span>Not enough evidence</span>
                {confidence != null ? (
                  <span className="rounded-sm bg-[#f4d0bf] px-2 py-1 text-[12px] text-[#743f2c]">
                    Confidence {confidence.toFixed(3)}
                  </span>
                ) : null}
              </div>
            ) : (
              <span aria-hidden="true" />
            )}
            <button
              aria-label="Copy assistant response"
              className="grid h-8 w-8 shrink-0 place-items-center rounded text-[#4e5966] transition hover:bg-surface-container-low disabled:opacity-60"
              onClick={() => void handleCopy()}
              title={copied ? "Copied" : "Copy response"}
              type="button"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          <MarkdownContent content={message.content} />
        </article>

        {message.sources?.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold uppercase leading-4 text-[#8f99a8]">
              Sources
            </span>
            {message.sources.map((source) => (
              <SourceChip
                key={`${source.source}-${source.chunk_index}-${source.score}`}
                label={source.display_source}
                onClick={() => onSelectSource(source)}
                source={source}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let listType: "ordered" | "unordered" | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    blocks.push(
      <p className="whitespace-pre-wrap" key={`p-${blocks.length}`}>
        {renderInlineLines(paragraph, `p-${blocks.length}`)}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      return;
    }

    const Tag = listType === "ordered" ? "ol" : "ul";
    blocks.push(
      <Tag
        className={`ml-5 space-y-2 ${
          listType === "ordered" ? "list-decimal" : "list-disc"
        }`}
        key={`list-${blocks.length}`}
      >
        {listItems.map((item, index) => (
          <li key={`${index}-${item}`}>
            {renderInlineMarkdown(item, `li-${blocks.length}-${index}`)}
          </li>
        ))}
      </Tag>,
    );
    listType = null;
    listItems = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.match(/^```/)) {
      flushParagraph();
      flushList();

      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].match(/^```/)) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push(
        <pre
          className="overflow-x-auto rounded border border-outline-variant bg-surface-container-lowest p-3 text-[14px] leading-6 text-[#151a18]"
          key={`code-${blocks.length}`}
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const nextType = orderedMatch ? "ordered" : "unordered";
      if (listType && listType !== nextType) {
        flushList();
      }
      listType = nextType;
      listItems.push((orderedMatch ?? unorderedMatch)?.[1] ?? "");
      continue;
    }

    if (listType && /^\s{2,}\S/.test(line) && listItems.length > 0) {
      listItems[listItems.length - 1] += ` ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return <div className="space-y-4">{blocks}</div>;
}

function renderInlineLines(lines: string[], keyPrefix: string) {
  return lines.flatMap((line, index) => [
    index > 0 ? <br key={`${keyPrefix}-br-${index}`} /> : null,
    ...renderInlineMarkdown(line, `${keyPrefix}-${index}`),
  ]);
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const parts = text.split(
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g,
  );

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code
          className="rounded bg-surface-container-low px-1.5 py-0.5 text-[0.9em]"
          key={key}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (
      ((part.startsWith("**") && part.endsWith("**")) ||
        (part.startsWith("__") && part.endsWith("__"))) &&
      part.length > 4
    ) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }

    if (
      ((part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_"))) &&
      part.length > 2
    ) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    return part;
  });
}

function SourceChip({
  label,
  onClick,
  source,
}: {
  label: string;
  onClick: () => void;
  source: Source;
}) {
  return (
    <button
      className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-sm border border-[#dfbaa9] bg-tertiary-fixed px-3 py-2 text-left text-[14px] leading-4 text-on-tertiary-fixed transition hover:bg-[#f4d0bf]"
      onClick={onClick}
      type="button"
    >
      <FileText className="h-4 w-4 shrink-0" strokeWidth={2} />
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-[12px] opacity-75">
        {pageRange(source)} · {evidenceRoleLabel(source)} ·{" "}
        {source.score.toFixed(3)}
      </span>
    </button>
  );
}

function TypingIndicator() {
  return (
    <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-4 sm:grid-cols-[50px_minmax(0,960px)] sm:gap-5">
      <div className="grid h-[42px] w-[42px] place-items-center rounded-lg bg-primary text-white sm:h-[50px] sm:w-[50px]">
        <ShieldCheck className="h-6 w-6" strokeWidth={2.1} />
      </div>
      <div className="inline-flex w-fit items-center gap-3 rounded-lg border border-[#d9dee4] bg-white px-5 py-4 text-[15px] font-semibold text-[#626b79] shadow-tonal">
        <Loader2 className="h-4 w-4 animate-spin" />
        Searching indexed sources
      </div>
    </div>
  );
}

function DebugDetails({ searchQuery }: { searchQuery: string }) {
  return (
    <details className="ml-auto max-w-[840px] rounded border border-outline-variant bg-white px-4 py-3 text-[13px] text-[#4e5966]">
      <summary className="cursor-pointer font-semibold uppercase text-[#7b8492]">
        Debug
      </summary>
      <p className="mt-2 whitespace-pre-wrap">{searchQuery}</p>
    </details>
  );
}

function ChatInput({
  disabled,
  onSend,
  setTopK,
  topK,
}: {
  disabled: boolean;
  onSend: (message: string) => void;
  setTopK: (value: number) => void;
  topK: number;
}) {
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0 && !disabled;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    onSend(value);
    setValue("");
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-transparent bg-surface/95 px-5 pb-6 pt-3 lg:left-[360px]">
      <div className="mx-auto max-w-[1120px]">
        <form
          className="flex min-h-[92px] items-center gap-3 rounded-lg border border-[#d9dee4] bg-white px-4 py-4 shadow-tonal sm:gap-4 sm:px-6"
          onSubmit={handleSubmit}
        >
          <div className="hidden items-center gap-2 rounded border border-outline-variant px-3 py-2 text-[13px] font-semibold text-[#4e5966] sm:flex">
            <Search className="h-4 w-4" />
            <label htmlFor="top-k">Top K</label>
            <input
              className="h-7 w-12 rounded border border-outline-variant px-2 text-center"
              id="top-k"
              max={20}
              min={1}
              onChange={(event) => setTopK(Number(event.target.value))}
              type="number"
              value={topK}
            />
          </div>
          <input
            aria-label="Chat prompt"
            className="min-w-0 flex-1 border-0 bg-transparent text-[17px] leading-7 text-on-surface placeholder:text-[#6e7787] focus:outline-none sm:text-[19px]"
            disabled={disabled}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Ask about forestry laws, permits, habitats, or source documents..."
            value={value}
          />
          <button
            aria-label="Send prompt"
            className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded bg-primary text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!canSend}
            type="submit"
          >
            {disabled ? (
              <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.2} />
            ) : (
              <Send className="h-6 w-6" strokeWidth={2.2} />
            )}
          </button>
        </form>
        <p className="mt-4 text-center text-[12px] font-medium uppercase leading-4 text-[#97a1af]">
          Aranyabodh
        </p>
      </div>
    </div>
  );
}

function SourceDrawer({
  onClose,
  source,
}: {
  onClose: () => void;
  source: Source | null;
}) {
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-50 w-[420px] max-w-[92vw] border-l border-outline-variant bg-white shadow-2xl transition-transform duration-200 ${
        source ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-outline-variant/70 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase text-[#7b8492]">
              Source Excerpt
            </p>
            <h3 className="mt-1 truncate text-[19px] font-bold text-primary">
              {source?.display_source ?? "Source"}
            </h3>
          </div>
          <button
            aria-label="Close source excerpt"
            className="grid h-9 w-9 shrink-0 place-items-center rounded border border-outline-variant hover:bg-surface-container-low"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {source ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="grid grid-cols-2 gap-3 text-[13px] leading-5">
              <DrawerMetric label="File" value={source.source} />
              <DrawerMetric label="Pages" value={pageRange(source)} />
              {source.section_heading ? (
                <DrawerMetric
                  label="Section"
                  value={source.section_heading}
                />
              ) : null}
              <DrawerMetric
                label="Evidence"
                value={evidenceRoleLabel(source)}
              />
              <DrawerMetric label="Chunk" value={source.chunk_index} />
              <DrawerMetric
                label="Relevance Score"
                value={source.score.toFixed(4)}
              />
            </div>

            <details
              className="mt-5 rounded border border-outline-variant/70 bg-surface-container-lowest p-4"
              open
            >
              <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-semibold uppercase text-[#626b79]">
                Excerpt
                <ChevronDown className="h-4 w-4" />
              </summary>
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[#202625]">
                {source.text}
              </p>
            </details>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function DrawerMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded bg-surface-container-low p-3">
      <p className="text-[12px] font-semibold uppercase text-[#7b8492]">
        {label}
      </p>
      <p className="mt-1 break-words text-[14px] font-semibold text-[#151a18]">
        {value}
      </p>
    </div>
  );
}
