import { afterEach, describe, expect, it, vi } from "vitest";
import { ask, askSession, getMessages } from "./api";

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
  it.each(["answered", "insufficient_evidence", "unsupported_answer", "not_generated", "out_of_scope", "clarification_required", "conversational"] as const)(
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


describe("internet fallback API and history", () => {
  const web = {
    answer_origin: "web", web_sources: [{ citation_number: 3, title: "Web article", url: "https://example.com/article" }],
    web_search_entry_point: "<style>.chip{color:green}</style><a href='https://google.com/search?q=forest'>Forest</a>",
  };
  const assistant = { id: "a", session_id: "s", role: "assistant", content: "Web answer [Web 3](https://example.com/article)", sources: [source], metadata: { request_id: "r" }, created_at: "now" };
  const response = { answer: assistant.content, sources: [source], cited_sources: [], confidence: .9, outcome: "answered", abstained: false };
  const mock = (value: unknown) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 200 })));

  it("normalizes standalone web answers without changing outcome or retrieval data", async () => {
    mock({ ...response, ...web, cited_sources: [source] });
    const result = await ask("token", "Question?");
    expect(result).toMatchObject({ ...web, outcome: "answered", abstained: false, cited_sources: [], sources: [source], confidence: .9 });
  });

  it("copies top-level web fields into live assistant metadata and preserves request identity", async () => {
    mock({ ...response, ...web, request_id: "r", session_id: "s", search_query: "Question?", user_message: { ...assistant, role: "user" }, assistant_message: assistant });
    const result = await askSession("token", "s", "Question?", "r");
    expect(result.assistant_message.metadata).toMatchObject({ ...web, request_id: "r", outcome: "answered", abstained: false, cited_sources: [] });
  });

  it("normalizes reloaded web metadata identically to a new reply", async () => {
    mock({ ...response, ...web, request_id: "r", assistant_message: assistant, user_message: { ...assistant, role: "user" } });
    const live = await askSession("token", "s", "Question?", "r");
    mock({ session_id: "s", messages: [{ ...assistant, metadata: { ...web, request_id: "r", outcome: "answered", abstained: false, cited_sources: [], retrieval_confidence: .9 } }] });
    const history = await getMessages("token", "s");
    expect(history.messages[0]).toEqual(live.assistant_message);
  });

  it("accepts metadata-only provenance during a rolling deployment", async () => {
    mock({ ...response, request_id: "r", assistant_message: { ...assistant, metadata: web } });
    const result = await askSession("token", "s", "Question?", "r");
    expect(result).toMatchObject(web);
    expect(result.assistant_message.metadata).toMatchObject(web);
  });

  it("normalizes legacy history as documents and retains its existing metadata and sources", async () => {
    mock({ session_id: "s", messages: [assistant, { ...assistant, id: "u", role: "user" }] });
    const result = await getMessages("token", "s");
    expect(result.messages[0].metadata).toEqual({ request_id: "r", answer_origin: "documents", web_sources: [], web_search_entry_point: null });
    expect(result.messages[0].sources).toEqual([source]);
    expect(result.messages[1].metadata).toEqual({ request_id: "r" });
  });

  it("does not allow stale web metadata to override explicit document provenance", async () => {
    mock({ ...response, answer_origin: "documents", cited_sources: [source], request_id: "r", assistant_message: { ...assistant, metadata: web } });
    const result = await askSession("token", "s", "Question?", "r");
    expect(result.answer_origin).toBe("documents");
    expect(result.cited_sources).toEqual([source]);
    expect(result.assistant_message.metadata.web_sources).toEqual([]);
  });
  it("uses metadata-only outcome, abstention and retrieval confidence for new replies", async () => {
    mock({ request_id: "r", assistant_message: { ...assistant, metadata: { ...web, outcome: "answered", abstained: false, retrieval_confidence: 0 } } });
    const result = await askSession("token", "s", "Question?", "r");
    expect(result).toMatchObject({ answer: assistant.content, outcome: "answered", abstained: false, confidence: 0 });
    expect(result.assistant_message.metadata).toMatchObject({ outcome: "answered", abstained: false, retrieval_confidence: 0 });
  });

  it("prefers explicit top-level answer, false, zero and empty sources over stale metadata", async () => {
    mock({ ...response, answer: "Fresh answer", abstained: false, confidence: 0, sources: [], cited_sources: [], assistant_message: { ...assistant, metadata: { outcome: "insufficient_evidence", abstained: true, retrieval_confidence: .9, cited_sources: [source] } } });
    const result = await askSession("token", "s", "Question?", "r");
    expect(result.assistant_message).toMatchObject({ content: "Fresh answer", sources: [], metadata: { outcome: "answered", abstained: false, retrieval_confidence: 0, cited_sources: [] } });
  });

  it.each(["out_of_scope", "clarification_required"] as const)("reloads %s from metadata and removes supporting citations", async outcome => {
    mock({ session_id: "s", messages: [{ ...assistant, metadata: { outcome, abstained: true, retrieval_confidence: 0, cited_sources: [source] } }] });
    const result = await getMessages("token", "s");
    expect(result.messages[0].metadata).toMatchObject({ outcome, abstained: true, retrieval_confidence: 0, cited_sources: [] });
  });

});


describe("conversational chat contract", () => {
  it.each([
    ["Hello", "Hello! How can I help?"],
    ["Thanks", "You’re welcome!"],
  ])("preserves %s replies in incoming responses and saved metadata", async (prompt, answer) => {
    const metadata = { outcome: "conversational", answer_origin: "conversational", abstained: false, retrieval_confidence: null, cited_sources: [], web_sources: [], web_search_entry_point: null, request_id: "r" };
    const assistant = { id: "a", session_id: "s", role: "assistant", content: answer, sources: [], metadata, created_at: "now" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ answer, outcome: "conversational", answer_origin: "conversational", abstained: false, confidence: null, sources: [], cited_sources: [], request_id: "r", assistant_message: assistant }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ session_id: "s", messages: [assistant] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const live = await askSession("token", "s", prompt, "r");
    const history = await getMessages("token", "s");
    expect(live).toMatchObject({ answer, outcome: "conversational", answer_origin: "conversational", abstained: false, confidence: null, sources: [], cited_sources: [] });
    expect(live.assistant_message).toEqual(history.messages[0]);
    expect(history.messages[0].metadata).toEqual(metadata);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
