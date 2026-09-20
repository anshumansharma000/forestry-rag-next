import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { canStartChatSubmission, pendingUserMessage, readPendingChat, retryDecision, submissionCompleted, writePendingChat } from "./chat-submission";

const submission = {
  userId: "user-1", sessionId: "session-1", requestId: "request-1",
  message: "Question?", topK: 5, createdAt: "2026-01-01T00:00:00Z",
};

describe("retry-safe chat turns", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("prevents double-clicks and new turns while a turn is unresolved", () => {
    expect(canStartChatSubmission("Question?", false, false)).toBe(true);
    expect(canStartChatSubmission("Question?", true, false)).toBe(false);
    expect(canStartChatSubmission("Question?", false, true)).toBe(false);
  });

  it("reconciles a persisted pending turn with an assistant message without duplicating it", () => {
    const pending = pendingUserMessage(submission);
    const assistant = { ...pending, id: "a-1", role: "assistant" as const, metadata: { request_id: "request-1" } };
    expect(submissionCompleted([assistant], submission.requestId)).toBe(true);
    expect(pending.id).toBe("pending-request-1");
  });

  it("restores the exact frozen submission after a page reload", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } });
    writePendingChat(submission);
    expect(readPendingChat("user-1", "session-1")).toEqual(submission);
    expect(readPendingChat("other-user", "session-1")).toBeNull();
  });

  it("distinguishes busy conflicts, attention conflicts, deletion, and Retry-After", () => {
    expect(retryDecision(new ApiError({ code: "busy", message: "busy", status: 409, retryAfterMs: 2000 }), 1)).toEqual({ kind: "retry", delayMs: 2000 });
    expect(retryDecision(new ApiError({ code: "conflict", message: "conflict", status: 409 }), 1)).toEqual({ kind: "conflict" });
    expect(retryDecision(new ApiError({ code: "gone", message: "gone", status: 410 }), 1)).toEqual({ kind: "deleted" });
    expect(retryDecision(new ApiError({ code: "limited", message: "limited", status: 429, retryAfterMs: 9000 }), 1)).toEqual({ kind: "retry", delayMs: 9000 });
  });
});
