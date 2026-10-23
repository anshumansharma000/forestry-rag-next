import { describe, expect, it } from "vitest";
import { answerOutcomeCopy, isAbstentionOutcome } from "./answer-outcome";

describe("answer outcomes", () => {
  it("defines a distinct presentation for all seven backend outcomes", () => {
    expect(Object.keys(answerOutcomeCopy)).toEqual([
      "conversational", "answered", "insufficient_evidence", "unsupported_answer", "out_of_scope", "clarification_required", "not_generated",
    ]);
    expect(answerOutcomeCopy.insufficient_evidence.label).not.toBe(answerOutcomeCopy.unsupported_answer.label);
    expect(isAbstentionOutcome("insufficient_evidence")).toBe(true);
    expect(isAbstentionOutcome("unsupported_answer")).toBe(true);
    expect(isAbstentionOutcome("answered")).toBe(false);
  });
});
