import type { AnswerOutcome } from "./api";

export const answerOutcomeCopy: Record<AnswerOutcome, { label: string; explanation: string; tone: "success" | "warning" | "error" | "info" }> = {
  conversational: {
    label: "",
    explanation: "",
    tone: "info",
  },
  answered: {
    label: "Supported answer",
    explanation: "Generated answer based on cited evidence.",
    tone: "success",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    explanation: "The backend did not find enough evidence to answer reliably.",
    tone: "warning",
  },
  unsupported_answer: {
    label: "Answer validation failed",
    explanation: "A draft answer was rejected because its support could not be validated.",
    tone: "error",
  },
  out_of_scope: {
    label: "Outside supported topics",
    explanation: "",
    tone: "info",
  },
  clarification_required: {
    label: "More details needed",
    explanation: "",
    tone: "info",
  },
  not_generated: {
    label: "Answer not generated",
    explanation: "Retrieval completed without generating an answer.",
    tone: "info",
  },
};

export function isAbstentionOutcome(outcome?: AnswerOutcome): boolean {
  return outcome === "insufficient_evidence" || outcome === "unsupported_answer";
}

export function isScopeOutcome(outcome?: AnswerOutcome): boolean {
  return outcome === "out_of_scope" || outcome === "clarification_required";
}

export function isAnswerOutcome(value: unknown): value is AnswerOutcome {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(answerOutcomeCopy, value);
}

export function isConversationalAnswer(value: { outcome?: AnswerOutcome; answer_origin?: string }): boolean {
  return value.outcome === "conversational" || value.answer_origin === "conversational";
}
