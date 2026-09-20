import { afterEach, describe, expect, it, vi } from "vitest";
import { ask, askSession } from "./api";

afterEach(() => vi.unstubAllGlobals());

const source = {
  citation_number: 4,
  document_id: "document-4",
  source: "rules.pdf",
  display_source: "Rules.pdf · Page 7",
  page_start: 7,
  page_end: 7,
  chunk_index: 2,
  section_heading: "Permits",
  score: 0.91,
  evidence_role: "matched" as const,
  text: "Relevant evidence.",
};

describe("adaptive RAG API contract", () => {
  it.each(["answered", "insufficient_evidence", "unsupported_answer", "not_generated"] as const)(
    "preserves the authoritative %s outcome",
    async (outcome) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        answer: "Explanation", sources: [], cited_sources: [], confidence: null,
        abstained: outcome === "insufficient_evidence" || outcome === "unsupported_answer",
        outcome,
      }), { status: 200 })));
      expect((await ask("token", "Question?")).outcome).toBe(outcome);
    },
  );

  it("omits top_k by default and normalizes a rolling-deployment response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: "Supported [4].",
      sources: [source],
      confidence: null,
      abstained: false,
      outcome: "answered",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ask("token", "Question?");
    const init = fetchMock.mock.calls[0][1] as RequestInit;

    expect(JSON.parse(String(init.body))).toEqual({ question: "Question?" });
    expect(result.cited_sources).toEqual([]);
    expect(result.confidence).toBeNull();
  });

  it("omits top_k for chat and preserves cited and complete source lists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      session_id: "session-1",
      user_message: { id: "u", session_id: "session-1", role: "user", content: "Question?", sources: [], metadata: {}, created_at: "now" },
      assistant_message: { id: "a", session_id: "session-1", role: "assistant", content: "Supported [4].", sources: [source, { ...source, citation_number: 5, chunk_index: 3 }], metadata: {}, created_at: "now" },
      search_query: "Question?",
      answer: "Supported [4].",
      sources: [source, { ...source, citation_number: 5, chunk_index: 3 }],
      cited_sources: [source],
      confidence: 0.91,
      abstained: false,
      outcome: "answered",
      request_id: "request-1",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await askSession("token", "session-1", "Question?", "request-1");
    const init = fetchMock.mock.calls[0][1] as RequestInit;

    expect(JSON.parse(String(init.body))).toEqual({ message: "Question?", request_id: "request-1" });
    expect(result.cited_sources).toHaveLength(1);
    expect(result.sources).toHaveLength(2);
    expect(result.assistant_message.sources).toHaveLength(2);
  });

  it("sends an identical request ID and frozen payload across retries", async () => {
    const response = {
      session_id: "session-1", request_id: "request-fixed", outcome: "answered",
      user_message: { id: "u", session_id: "session-1", role: "user", content: "Question?", sources: [], metadata: {}, created_at: "now" },
      assistant_message: { id: "a", session_id: "session-1", role: "assistant", content: "Answer", sources: [], metadata: {}, created_at: "now" },
      search_query: "Question?", answer: "Answer", sources: [], cited_sources: [], confidence: 1, abstained: false,
    };
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await askSession("token", "session-1", "Question?", "request-fixed", 5);
    await askSession("token", "session-1", "Question?", "request-fixed", 5);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies).toEqual([
      { message: "Question?", top_k: 5, request_id: "request-fixed" },
      { message: "Question?", top_k: 5, request_id: "request-fixed" },
    ]);
  });

  it("sends top_k only for an explicit diagnostic override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: "No answer.", sources: [], cited_sources: [], confidence: 0, abstained: true,
      outcome: "insufficient_evidence",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await ask("token", "Question?", 9);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ question: "Question?", top_k: 9 });
  });

  it("rejects an invalid diagnostic override before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(ask("token", "Question?", 21)).rejects.toThrow("1 through 20");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
