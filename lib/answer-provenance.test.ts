import { describe, expect, it } from "vitest";
import { normalizeAnswerProvenance, normalizeAnswerData } from "./answer-provenance";

describe("web answer normalization", () => {
  it("defaults missing or unknown provenance to documents", () => {
    expect(normalizeAnswerProvenance({})).toEqual({ answer_origin: "documents", web_sources: [], web_search_entry_point: null });
    expect(normalizeAnswerProvenance({ answer_origin: "unknown" }).answer_origin).toBe("documents");
  });
  it("tolerates malformed source metadata", () => {
    expect(normalizeAnswerProvenance({ answer_origin: "web", web_sources: [null, {}, { citation_number: -1, url: "https://example.com", title: "Bad" }], web_search_entry_point: 9 }).web_sources).toEqual([]);
  });
  it("prefers explicit false, zero, null and empty arrays over metadata", () => {
    const result = normalizeAnswerData({ answer: "", abstained: false, confidence: 0, sources: [], cited_sources: [], web_search_entry_point: null }, {
      answer: "Stale answer", abstained: true, retrieval_confidence: .9, sources: [{}], cited_sources: [{}], web_search_entry_point: "<div>Stale</div>", answer_origin: "web",
    });
    expect(result).toMatchObject({ answer: "", abstained: false, confidence: 0, sources: [], cited_sources: [], web_search_entry_point: null });
  });
  it("falls back to metadata for every missing answer field", () => {
    expect(normalizeAnswerData({}, { answer: "Backend guidance", outcome: "clarification_required", abstained: false, retrieval_confidence: 0, answer_origin: "documents" })).toMatchObject({ answer: "Backend guidance", outcome: "clarification_required", abstained: false, confidence: 0, answer_origin: "documents" });
  });
  it("does not infer provenance from content and leaves legacy citations unspecified", () => {
    expect(normalizeAnswerData({ answer: "Internet-sourced answer" })).toMatchObject({ answer_origin: "documents", cited_sources: undefined, outcome: undefined, abstained: undefined });
  });
});
