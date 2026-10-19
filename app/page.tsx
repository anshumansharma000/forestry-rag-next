"use client";

import {
  AlertCircle,
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { groupChatSessions } from "../lib/chat-history";
import { ChatComposer } from "../components/chat-composer";
import { BrandLogo } from "../components/brand-logo";
import { PasswordInput } from "../components/password-input";
import { SystemStatusPanel, isConfigReady } from "../components/system-status-panel";
import { AppHeader } from "../components/app-header";
import { AppSidebar } from "../components/app-sidebar";
import { SourceDrawer } from "../components/source-drawer";
import {
  MarkdownContent,
  citedSourcesForMessage,
  sourcesForAskResponse,
} from "../components/markdown-content";
import {
  formatApiError,
  isTokenNearExpiry,
  validatePassword,
} from "../lib/auth-client";
import {
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
  downloadSourceDocument,
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
import { answerOutcomeCopy, isAbstentionOutcome } from "../lib/answer-outcome";
import {
  ChatSubmission,
  canStartChatSubmission,
  clearPendingChat,
  clearPendingChatsForUser,
  newRequestId,
  pendingUserMessage,
  readPendingChat,
  retryDecision,
  submissionCompleted,
  writePendingChat,
} from "../lib/chat-submission";

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
    return "Page number unavailable";
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

function messageOutcome(message: ChatMessage) {
  const outcome = message.metadata?.outcome;
  return outcome === "answered" || outcome === "insufficient_evidence" || outcome === "unsupported_answer" || outcome === "not_generated"
    ? outcome
    : undefined;
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

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Retry cancelled", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, delayMs);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Retry cancelled", "AbortError"));
    }, { once: true });
  });
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
        <span className="text-[15px] font-semibold">Opening your chat</span>
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
          <h1 className="w-fit rounded-xl bg-white p-5">
            <BrandLogo className="h-auto w-[180px]" />
          </h1>
          <p className="mt-5 max-w-xl text-[18px] leading-7 text-white/78">
            Find reliable answers in department documents and open the source
            behind every response.
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
              <BrandLogo decorative className="h-8 w-8" />
            </span>
            <div>
              <h2 className="text-[24px] font-bold text-primary">Sign in</h2>
              <p className="text-[14px] text-[#626b79]">
                Sign in with your department account
              </p>
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
            <PasswordInput
              autoComplete="current-password"
              className="h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
              onChange={(event) => setPassword(event.target.value)}
              required
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
          <p className="mt-4 text-center text-[13px] leading-5 text-[#626b79]">
            Contact your administrator if you cannot sign in or need your password reset.
          </p>
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
          <PasswordInput
            autoComplete="current-password"
            className="h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            value={currentPassword}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-[13px] font-semibold uppercase text-[#626b79]">
            New password
          </span>
          <PasswordInput
            autoComplete="new-password"
            className="h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
            minLength={8}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            value={newPassword}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-[13px] font-semibold uppercase text-[#626b79]">
            Confirm new password
          </span>
          <PasswordInput
            autoComplete="new-password"
            className="h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
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
  const [downloadingSource, setDownloadingSource] = useState(false);
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
  const [pendingSubmission, setPendingSubmission] = useState<ChatSubmission | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const askControllerRef = useRef<AbortController | null>(null);
  const submissionInFlightRef = useRef(false);
  const activeSessionRef = useRef<string | null>(null);

  useEffect(() => () => askControllerRef.current?.abort(), []);
  useEffect(() => {
    activeSessionRef.current = activeSessionId;
  }, [activeSessionId]);

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
      handleError(err, "Unable to load recent chats.");
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
        if (activeSessionRef.current !== sessionId) return;
        const persisted = readPendingChat(user.id, sessionId);
        if (persisted && submissionCompleted(data.messages, persisted.requestId)) {
          clearPendingChat(user.id, sessionId);
          setPendingSubmission(null);
          setMessages(data.messages);
        } else if (persisted) {
          setPendingSubmission(persisted);
          setMessages([...data.messages, pendingUserMessage(persisted)]);
        } else {
          setPendingSubmission(null);
          setMessages(data.messages);
        }
      } catch (err) {
        handleError(err, "Unable to load messages.");
      } finally {
        setPendingKey("messages", false);
      }
    },
    [ensureAuth, handleError, setPendingKey, user.id],
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

  async function createChatSession(title?: string) {
    const token = await ensureAuth();
    const session = await createSession(token, title);
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    writeChatIdToUrl(session.id);
    return session;
  }

  async function submitFrozenTurn(submission: ChatSubmission) {
    if (submissionInFlightRef.current || activeSessionRef.current !== submission.sessionId) return false;
    submissionInFlightRef.current = true;
    setPendingKey("send", true);
    setPendingSubmission(submission);
    writePendingChat(submission);

    let attempt = 0;
    try {
      while (true) {
        attempt += 1;
        let controller: AbortController | null = null;
        try {
          const token = await ensureAuth();
          controller = new AbortController();
          askControllerRef.current = controller;
          const response = await askSession(
            token,
            submission.sessionId,
            submission.message,
            submission.requestId,
            submission.topK,
            controller.signal,
          );
          if (activeSessionRef.current !== submission.sessionId) return false;
          clearPendingChat(submission.userId, submission.sessionId);
          setPendingSubmission(null);
          setSearchQuery(response.search_query ?? null);
          const serverUser = {
            ...response.user_message,
            metadata: { ...response.user_message.metadata, request_id: response.request_id },
          };
          const serverAssistant = {
            ...response.assistant_message,
            metadata: {
              ...response.assistant_message.metadata,
              request_id: response.request_id,
              outcome: response.outcome,
              retrieval_confidence: response.confidence,
              abstained: response.abstained,
              cited_sources: sourcesForAskResponse(response),
            },
            sources: response.assistant_message.sources?.length
              ? response.assistant_message.sources
              : response.sources,
          };
          setMessages((current) => [
            ...current.filter((item) =>
              item.id !== `pending-${submission.requestId}` &&
              item.id !== serverUser.id && item.id !== serverAssistant.id,
            ),
            serverUser,
            serverAssistant,
          ]);
          void loadSessions();
          return true;
        } catch (err) {
          const decision = retryDecision(err, attempt);
          if (decision.kind === "retry") {
            try {
              await waitForRetry(decision.delayMs, controller?.signal ?? new AbortController().signal);
            } catch (delayError) {
              if (delayError instanceof DOMException && delayError.name === "AbortError") return false;
              throw delayError;
            }
            if (activeSessionRef.current !== submission.sessionId) return false;
            continue;
          }
          if (decision.kind === "deleted") {
            clearPendingChat(submission.userId, submission.sessionId);
            setPendingSubmission(null);
            setMessages((current) => current.filter((item) => item.id !== `pending-${submission.requestId}`));
            setError("This original turn was deleted and cannot be retried.");
            return false;
          }
          if (decision.kind === "conflict") {
            setError("This turn conflicts with another operation. Review it, then retry or discard it.");
            return false;
          }
          if (err instanceof DOMException && err.name === "AbortError") return false;
          handleError(err, "Your message is saved, but the response could not be confirmed. Retry to check for a response, or discard it to continue.");
          return false;
        }
      }
    } finally {
      askControllerRef.current = null;
      submissionInFlightRef.current = false;
      setPendingKey("send", false);
    }
  }

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!canStartChatSubmission(message, pending.send || submissionInFlightRef.current, pendingSubmission != null)) {
      return false;
    }

    setError(null);
    setGlobalError(null);
    setSearchQuery(null);
    submissionInFlightRef.current = true;
    const requestId = newRequestId();

    try {
      const session =
        activeSessionId == null
          ? await createChatSession(message.slice(0, 80))
          : sessions.find((item) => item.id === activeSessionId);
      if (!session) {
        throw new Error("Unable to open this chat.");
      }
      activeSessionRef.current = session.id;
      const submission: ChatSubmission = {
        userId: user.id,
        sessionId: session.id,
        requestId,
        message,
        createdAt: nowIso(),
      };
      writePendingChat(submission);
      setPendingSubmission(submission);
      setMessages((current) => [...current, pendingUserMessage(submission)]);
      submissionInFlightRef.current = false;
      return await submitFrozenTurn(submission);
    } catch (err) {
      handleError(err, "Unable to send message.");
      return false;
    } finally {
      submissionInFlightRef.current = false;
    }
  }

  function discardPendingSubmission() {
    if (!pendingSubmission) return;
    clearPendingChat(pendingSubmission.userId, pendingSubmission.sessionId);
    setMessages((current) => current.filter((item) => item.id !== `pending-${pendingSubmission.requestId}`));
    setPendingSubmission(null);
    setError(null);
  }

  async function removeSession(sessionId: string) {
    if (deletingSessionId) {
      return;
    }

    const session = sessions.find((item) => item.id === sessionId);
    const confirmed = window.confirm(
      `Delete "${session?.title || "Untitled chat"}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingSessionId(sessionId);
    try {
      const token = await ensureAuth();
      await deleteSession(token, sessionId);
      clearPendingChat(user.id, sessionId);
      const remaining = sessions.filter((item) => item.id !== sessionId);
      setSessions(remaining);
      if (sessionId === activeSessionId) {
        setActiveSessionId(null);
        setMessages([]);
        writeChatIdToUrl(null);
      }
    } catch (err) {
      handleError(err, "Unable to delete this chat.");
    } finally {
      setDeletingSessionId(null);
    }
  }

  function logoutAndClearPending() {
    askControllerRef.current?.abort();
    clearPendingChatsForUser(user.id);
    logout();
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

  async function downloadSelectedSource(source: Source) {
    if (!isAdminUser(user) || !source.document_id || downloadingSource) {
      return;
    }

    setDownloadingSource(true);
    try {
      const token = await ensureAuth();
      const blob = await downloadSourceDocument(token, source.document_id);
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = source.display_source || source.source || "source-document";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      handleError(err, "Unable to download the source document.");
    } finally {
      setDownloadingSource(false);
    }
  }

  const configReady = isConfigReady(config);

  return (
    <>
      <AppSidebar
        activePath="/"
        mobileOpen={sidebarOpen}
        onMobileOpenChange={setSidebarOpen}
        onNewChat={() => {
          askControllerRef.current?.abort();
          setActiveSessionId(null);
          setMessages([]);
          setPendingSubmission(null);
          setSearchQuery(null);
          writeChatIdToUrl(null);
          setSidebarOpen(false);
        }}
        user={user}
      >
        <ChatHistory
          activeSessionId={activeSessionId}
          deletingSessionId={deletingSessionId}
          onDeleteSession={(sessionId) => void removeSession(sessionId)}
          onSelectSession={(sessionId) => {
            askControllerRef.current?.abort();
            setActiveSessionId(sessionId);
            setPendingSubmission(null);
            setSearchQuery(null);
            writeChatIdToUrl(sessionId);
            setSidebarOpen(false);
          }}
          pending={pending.sessions}
          sessions={sessions}
        />
      </AppSidebar>

      <section className="min-h-screen transition-[padding] duration-200 lg:pl-[var(--app-sidebar-width)]">
        <AppHeader
          title="Chat"
          health={health}
          configReady={configReady}
          onAdminClick={() => setAdminOpen(!adminOpen)}
          onLogout={logoutAndClearPending}
          onMenuClick={() => setSidebarOpen(true)}
          user={user}
        />

        {adminOpen ? (
          <SystemStatusPanel
            config={config}
            health={health}
            onRefresh={() => void loadConfig()}
            refreshing={pending.config}
            user={user}
          />
        ) : null}

        {error ? (
          <ErrorBanner message={error} onClose={() => setError(null)} />
        ) : null}

        <ChatWorkspace
          sessionId={activeSessionId}
          bottomRef={bottomRef}
          deletingMessageId={deletingMessageId}
          messages={messages}
          onDeleteUserMessage={(message) => void removeUserMessage(message)}
          onRetryUserMessage={(message) => void retryUserMessage(message)}
          onSelectSource={setSelectedSource}
          onSend={sendMessage}
          onDiscardPending={discardPendingSubmission}
          onRetryPending={() => pendingSubmission ? void submitFrozenTurn(pendingSubmission) : undefined}
          pending={pending}
          pendingSubmission={pendingSubmission}
          retryingMessageId={retryingMessageId}
          searchQuery={searchQuery}
        />
      </section>

      <SourceDrawer
        canDownload={isAdminUser(user)}
        downloading={downloadingSource}
        onClose={() => setSelectedSource(null)}
        onDownload={(source) => void downloadSelectedSource(source)}
        source={selectedSource}
      />
    </>
  );
}

function ChatHistory({
  activeSessionId,
  deletingSessionId,
  onDeleteSession,
  onSelectSession,
  pending,
  sessions,
}: {
  activeSessionId: string | null;
  deletingSessionId: string | null;
  onDeleteSession: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  pending: boolean;
  sessions: ChatSession[];
}) {
  return (
      <section aria-label="Recent chats" className="mt-6 flex min-h-0 flex-1 flex-col border-t border-outline-variant/50 px-5 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold uppercase leading-5 text-[#7b8492]">
            Recent chats
          </p>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : null}
        </div>
        <div className="mt-4 min-h-0 space-y-2 pr-1">
          {sessions.length === 0 && !pending ? (
            <p className="rounded border border-dashed border-outline-variant p-3 text-[14px] leading-5 text-[#626b79]">
              Your conversations will appear here.
            </p>
          ) : null}
          {groupChatSessions(sessions).map((group) => (
            <section key={group.label} aria-label={group.label} className="pt-2">
              <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#7b8492]">{group.label}</h2>
              {group.sessions.map((session) => {
            const deleting = deletingSessionId === session.id;

            return (
              <div
                className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition ${
                  session.id === activeSessionId
                    ? "bg-[#eaf3ed] text-primary"
                    : "hover:bg-surface-container-low"
                }`}
                key={session.id}
              >
                <button
                  className="min-h-11 min-w-0 flex-1 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  data-sidebar-select
                  aria-current={session.id === activeSessionId ? "true" : undefined}
                  title={session.title || "Untitled chat"}
                  disabled={deleting}
                  onClick={() => onSelectSession(session.id)}
                  type="button"
                >
                  <span className="block truncate text-[15px] font-semibold leading-5">
                    {session.title || "Untitled chat"}
                  </span>
                  <span className="mt-1 block text-[12px] leading-4 text-[#7b8492]">
                    {formatWhen(session.updated_at)}
                  </span>
                </button>
                <button
                  aria-label={`Delete ${session.title || "chat"}`}
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[#8d5a4a] transition hover:bg-[#fff3ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${deleting ? "" : "[@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-focus-within:opacity-100"}`}
                  disabled={deleting}
                  onClick={() => onDeleteSession(session.id)}
                  title="Delete chat"
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
            </section>
          ))}
        </div>
      </section>
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
  sessionId,
  bottomRef,
  deletingMessageId,
  messages,
  onDeleteUserMessage,
  onRetryUserMessage,
  onSelectSource,
  onSend,
  onDiscardPending,
  onRetryPending,
  pending,
  pendingSubmission,
  retryingMessageId,
  searchQuery,
}: {
  sessionId: string | null;
  bottomRef: React.RefObject<HTMLDivElement>;
  deletingMessageId: string | null;
  messages: ChatMessage[];
  onDeleteUserMessage: (message: ChatMessage) => void;
  onRetryUserMessage: (message: ChatMessage) => void;
  onSelectSource: (source: Source) => void;
  onSend: (message: string) => Promise<boolean>;
  onDiscardPending: () => void;
  onRetryPending: () => void;
  pending: PendingState;
  pendingSubmission: ChatSubmission | null;
  retryingMessageId: string | null;
  searchQuery: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [composerHeight, setComposerHeight] = useState(112);
  const [showJump, setShowJump] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const followLatest = useRef(true);
  const previousSession = useRef(sessionId);

  const jumpToLatest = useCallback(() => {
    followLatest.current = true;
    setShowJump(false);
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    const update = () => {
      const distance = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      followLatest.current = distance < 160;
      setShowJump(!followLatest.current);
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (previousSession.current !== sessionId) {
      previousSession.current = sessionId;
      followLatest.current = true;
    }
    if (followLatest.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
      setShowJump(false);
    } else {
      setShowJump(document.documentElement.scrollHeight - window.scrollY - window.innerHeight >= 160);
    }
  }, [messages, pending.send, sessionId, composerHeight]);

  return (
    <div className="relative min-h-[calc(100vh-72px)]" style={{ paddingBottom: composerHeight + 32 }}>
      <div className="mx-auto w-full max-w-[904px] px-5 pt-10 sm:px-8 lg:pt-12">
        {messages.length === 0 ? <AssistantIntro onPromptSelect={(prompt) => { setDraft(prompt); inputRef.current?.focus(); }} /> : null}

        <div className="space-y-10">
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
          {pendingSubmission && !pending.send ? (
            <div className="ml-auto flex max-w-[840px] flex-wrap items-center justify-between gap-3 rounded border border-[#e0cfa9] bg-[#fff9e9] px-4 py-3 text-sm text-[#6c551d]" role="status">
              <span>Your message is saved. Retry to check for a response.</span>
              <span className="flex gap-2">
                <button className="rounded border border-[#c8aa67] bg-white px-3 py-2 font-semibold" onClick={onRetryPending} type="button">Retry</button>
                <button className="rounded px-3 py-2 font-semibold underline" onClick={onDiscardPending} type="button">Discard</button>
              </span>
            </div>
          ) : null}
          {searchQuery ? <DebugDetails searchQuery={searchQuery} /> : null}
          <div ref={bottomRef} />
        </div>
      </div>

      {showJump && messages.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 z-20 flex justify-center lg:left-[var(--app-sidebar-width)]" style={{ bottom: composerHeight + 12 }}>
          <button className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-outline-variant bg-white px-4 text-sm font-medium text-primary shadow-sm hover:bg-[#edf8f1]" onClick={jumpToLatest} type="button"><ArrowDown className="h-4 w-4" />Jump to latest</button>
        </div>
      ) : null}
      <ChatComposer
        value={draft}
        onChange={setDraft}
        inputRef={inputRef}
        onHeightChange={setComposerHeight}
        disabled={pending.send || pendingSubmission != null}
        sending={pending.send}
        onSend={(message) => { followLatest.current = true; return onSend(message); }}
      />
    </div>
  );
}

function AssistantIntro({ onPromptSelect }: { onPromptSelect: (prompt: string) => void }) {
  return (
    <section className="mx-auto mb-12 max-w-[730px] text-center">
      <h3>
        <BrandLogo className="mx-auto h-auto w-28 max-w-full" />
      </h3>
      <p className="mt-3 text-[17px] leading-6 text-[#2d3331]">
        Ask about forestry rules, procedures, and department records. You can
        open the supporting source for every answer.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2 text-left">
        {["What is the forest clearance procedure?", "Summarize the latest NPV guidance", "Which documents cover protected areas?"].map((prompt) => (
          <button
            className="rounded-full border border-outline-variant bg-white px-4 py-2 text-[13px] font-semibold text-primary transition hover:bg-[#edf8f1]"
            key={prompt}
            onClick={() => onPromptSelect(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </section>
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
    <div className="group ml-auto max-w-[min(100%,680px)] rounded-2xl bg-[#edf2ee] px-4 py-3 text-[16px] leading-7 text-[#202625] sm:px-5">
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
  const outcome = messageOutcome(message);
  const outcomePresentation = outcome ? answerOutcomeCopy[outcome] : null;
  const unsuccessful = outcome ? isAbstentionOutcome(outcome) : abstained;
  const confidence = messageConfidence(message);
  const [copied, setCopied] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const responseCitations = message.metadata?.cited_sources;
  const citedSources = Array.isArray(responseCitations)
    ? (responseCitations as Source[])
    : unsuccessful
      ? []
      : citedSourcesForMessage(message.content, message.sources ?? []);

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
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 sm:gap-4">
      <div
        className={`grid h-8 w-8 place-items-center rounded-lg text-white ${
          unsuccessful ? "bg-[#fff5f1]" : "bg-[#edf8f1]"
        }`}
      >
        <BrandLogo className="h-6 w-6" />
      </div>

      <div className="min-w-0">
        <article
          className={`min-w-0 rounded-xl px-1 py-1 text-[16px] leading-7 text-[#202625] sm:px-2 ${
            unsuccessful
              ? "border border-[#e5bda9] bg-[#fff8f5] p-4"
              : "bg-transparent"
          }`}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            {outcomePresentation && outcome !== "answered" ? (
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase leading-4 text-[#8d5a4a]">
                <span>{outcomePresentation.label}</span>
                {confidence != null ? (
                  <span className="rounded-sm bg-[#f4d0bf] px-2 py-1 text-[12px] text-[#743f2c]">
                    Evidence match {confidence.toFixed(3)}
                  </span>
                ) : null}
              </div>
            ) : abstained ? (
              <span className="text-[13px] font-semibold uppercase text-[#8d5a4a]">Historical abstention</span>
            ) : (
              <span className="pt-1.5 text-[12px] font-medium text-[#7d8780]">Aranyabodh AI</span>
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
          <MarkdownContent
            content={message.content}
            onSelectSource={onSelectSource}
            sources={citedSources}
          />
          {outcomePresentation && isAbstentionOutcome(outcome) ? (
            <p className="mt-4 text-[14px] leading-6 text-[#743f2c]">
              {outcomePresentation.explanation}
            </p>
          ) : null}
        </article>

        {citedSources.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold uppercase leading-4 text-[#8f99a8]">
              Sources
            </span>
            {(sourcesExpanded ? citedSources : citedSources.slice(0, 3)).map((source) => (
              <SourceChip
                key={`${source.source}-${source.chunk_index}-${source.score}`}
                label={source.display_source}
                number={source.citation_number}
                onClick={() => onSelectSource(source)}
                source={source}
              />
            ))}
            {citedSources.length > 3 ? <button aria-expanded={sourcesExpanded} className="min-h-11 rounded-lg px-3 text-[13px] font-semibold text-primary hover:bg-[#edf8f1]" onClick={() => setSourcesExpanded((expanded) => !expanded)} type="button">{sourcesExpanded ? "Show fewer" : `Show all ${citedSources.length} sources`}</button> : null}
          </div>
        ) : null}
        {unsuccessful && message.sources?.length ? (
          <details className="mt-4 rounded border border-outline-variant bg-white px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-semibold uppercase text-[#7b8492]">Retrieved evidence — not validated as answer support ({message.sources.length})</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {message.sources.map((source) => <SourceChip key={`${source.source}-${source.chunk_index}-${source.score}`} label={source.display_source} number={source.citation_number} onClick={() => onSelectSource(source)} source={source} />)}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function SourceChip({
  label,
  number,
  onClick,
  source,
}: {
  label: string;
  number: number | null;
  onClick: () => void;
  source: Source;
}) {
  return (
    <button
      aria-label={`Source ${number ?? "citation"}: ${label}, ${pageRange(source)}`}
      className="grid min-h-11 max-w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 rounded-lg border border-[#dde4de] bg-[#f0f4f1] px-3 py-2 text-left text-[14px] leading-4 text-[#44584b] transition hover:bg-[#e5ede7] sm:inline-flex"
      onClick={onClick}
      type="button"
    >
      <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-white/70 text-[12px] font-bold">{number ?? "—"}</span>
      <span className="min-w-0 truncate font-semibold">{label}</span>
      <span className="col-start-2 text-[12px] opacity-75 sm:col-auto sm:shrink-0">
        {pageRange(source)} · {evidenceRoleLabel(source)}
      </span>
    </button>
  );
}

function TypingIndicator() {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 sm:gap-4">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#edf8f1] text-white">
        <BrandLogo className="h-6 w-6" />
      </div>
      <div className="inline-flex w-fit items-center gap-3 rounded-xl bg-[#f0f4f1] px-4 py-3 text-[14px] font-medium text-[#626b79]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Searching and analyzing the documents…
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
