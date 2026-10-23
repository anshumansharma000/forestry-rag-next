// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppHome from "./page";
import * as api from "../../lib/api";

vi.mock("../../components/chat-composer", () => ({
  ChatComposer: ({ disabled, onSend }: { disabled: boolean; onSend: (value: string) => Promise<boolean> }) =>
    <button data-testid="send" disabled={disabled} onClick={() => void onSend("Question?")}>Ask test question</button>,
}));
vi.mock("../../lib/api", async importOriginal => {
  const actual = await importOriginal<typeof api>();
  const user = { id: "u", email: "user@example.com", full_name: "User", role: "viewer", must_change_password: false };
  return { ...actual,
    readStoredAuth: vi.fn(() => ({ access_token: "token", refresh_token: "refresh", expires_at: "2099-01-01", user })),
    storeAuth: vi.fn(), getCurrentUser: vi.fn(async () => user),
    getHealth: vi.fn(async () => ({ status: "ok" })),
    getConfigStatus: vi.fn(async () => ({ gemini_api_key_configured: true, supabase_url_configured: true, supabase_service_role_key_configured: true, supabase_url_valid: true, jwt_secret_key_configured: true })),
    listSessions: vi.fn(async () => ({ sessions: [{ id: "s", title: "Chat", created_at: "2026-10-22", updated_at: "2026-10-22" }] })),
    getMessages: vi.fn(async () => ({ session_id: "s", messages: [] })),
    askSession: vi.fn(),
  };
});

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.localStorage.clear();
  window.history.replaceState(null, "", "/app?chat=s");
  vi.mocked(api.askSession).mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("scope replies complete the chat turn", () => {
  it.each(["out_of_scope", "clarification_required"] as const)("accepts %s without retries and allows the next message", async outcome => {
    const message = { id: "a", session_id: "s", role: "assistant" as const, content: "Backend guidance", sources: [], metadata: { outcome, abstained: true }, created_at: "now" };
    vi.mocked(api.askSession).mockResolvedValue({ answer: message.content, sources: [], cited_sources: [], confidence: 0, outcome, abstained: true, answer_origin: "documents", web_sources: [], web_search_entry_point: null, session_id: "s", request_id: "r", search_query: "", assistant_message: message, user_message: { ...message, id: "user", role: "user", content: "Question?", metadata: {} } });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<AppHome />));
      const send = container.querySelector<HTMLButtonElement>('[data-testid="send"]')!;
      expect(send.disabled).toBe(false);
      await act(async () => send.click());
      expect(api.askSession).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain("Backend guidance");
      expect(container.textContent).toContain(outcome === "out_of_scope" ? "Outside supported topics" : "More details needed");
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(container.textContent).not.toContain("Retry or discard");
      expect(Object.keys(window.localStorage).filter(key => key.startsWith("aranyabodh-pending-chat-turn:"))).toEqual([]);
      expect(send.disabled).toBe(false);
      // The next request happens only after another explicit user action.
      await act(async () => send.click());
      expect(api.askSession).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
