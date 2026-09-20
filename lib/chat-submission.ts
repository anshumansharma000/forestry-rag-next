import { ApiError, type ChatMessage } from "./api";

export type ChatSubmission = {
  userId: string;
  sessionId: string;
  requestId: string;
  message: string;
  topK?: number;
  createdAt: string;
};

const prefix = "aranyabodh-pending-chat-turn:";

export function newRequestId() {
  return crypto.randomUUID();
}

export function canStartChatSubmission(message: string, inFlight: boolean, unresolved: boolean) {
  return message.trim().length > 0 && !inFlight && !unresolved;
}

export function pendingChatKey(userId: string, sessionId: string) {
  return `${prefix}${encodeURIComponent(userId)}:${encodeURIComponent(sessionId)}`;
}

export function writePendingChat(submission: ChatSubmission) {
  window.localStorage.setItem(
    pendingChatKey(submission.userId, submission.sessionId),
    JSON.stringify(submission),
  );
}

export function readPendingChat(userId: string, sessionId: string): ChatSubmission | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(pendingChatKey(userId, sessionId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ChatSubmission>;
    return value.userId === userId &&
      value.sessionId === sessionId &&
      typeof value.requestId === "string" &&
      typeof value.message === "string" &&
      typeof value.createdAt === "string"
      ? (value as ChatSubmission)
      : null;
  } catch {
    return null;
  }
}

export function clearPendingChat(userId: string, sessionId: string) {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(pendingChatKey(userId, sessionId));
  }
}

export function clearPendingChatsForUser(userId: string) {
  if (typeof window === "undefined") return;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(`${prefix}${encodeURIComponent(userId)}:`)) {
      window.localStorage.removeItem(key);
    }
  }
}

export function messageRequestId(message: ChatMessage) {
  const value = message.metadata?.request_id;
  return typeof value === "string" ? value : null;
}

export function submissionCompleted(messages: ChatMessage[], requestId: string) {
  return messages.some(
    (message) => message.role === "assistant" && messageRequestId(message) === requestId,
  );
}

export function pendingUserMessage(submission: ChatSubmission): ChatMessage {
  return {
    id: `pending-${submission.requestId}`,
    session_id: submission.sessionId,
    role: "user",
    content: submission.message,
    sources: [],
    metadata: { pending: true, request_id: submission.requestId },
    created_at: submission.createdAt,
  };
}

export type RetryDecision =
  | { kind: "retry"; delayMs: number }
  | { kind: "deleted" }
  | { kind: "auth" }
  | { kind: "conflict" }
  | { kind: "stop" };

export function retryDecision(error: unknown, attempt: number, maxAttempts = 3): RetryDecision {
  if (error instanceof ApiError) {
    if (error.status === 410) return { kind: "deleted" };
    if (error.status === 401) return { kind: "auth" };
    if (error.status === 409 && error.retryAfterMs == null) return { kind: "conflict" };
    if (
      (error.status === 409 || error.status === 429 || error.status === 503) &&
      error.retryAfterMs != null &&
      attempt < maxAttempts
    ) {
      return { kind: "retry", delayMs: error.retryAfterMs };
    }
    return { kind: "stop" };
  }

  if (
    attempt < maxAttempts &&
    !(error instanceof DOMException && error.name === "AbortError")
  ) {
    return { kind: "retry", delayMs: 750 * attempt };
  }
  return { kind: "stop" };
}
