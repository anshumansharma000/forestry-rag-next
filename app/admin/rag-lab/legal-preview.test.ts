import { describe, expect, it } from "vitest";
import { legalPreviewState } from "./legal-preview";

const source = { citation_number: null, source: "a", display_source: "A", page_start: 1, page_end: 1, chunk_index: 0, section_heading: null, score: .8, evidence_role: "matched" as const, text: "evidence" };
describe("legal preview states", () => {
  it("uses the backend outcome as the authoritative state", () => {
    expect(legalPreviewState({ sources: [source], outcome: "not_generated" }, false)).toBe("not_generated");
    expect(legalPreviewState({ sources: [source], answer: "a", outcome: "answered" }, true)).toBe("answered");
    expect(legalPreviewState({ sources: [source], answer: "", abstained: true, outcome: "insufficient_evidence" }, true)).toBe("insufficient_evidence");
    expect(legalPreviewState({ review: {}, outcome: "unsupported_answer" }, true)).toBe("unsupported_answer");
  });
  it("tolerates absent review fields", () => expect(legalPreviewState({ sources: [source], review: undefined, outcome: "not_generated" }, false)).toBe("not_generated"));
});
