import type { AnswerOutcome } from "./api";

export const answerOutcomeCopy: Record<AnswerOutcome, { label: string; explanation: string; tone: "success" | "warning" | "error" | "info" }> = {
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
  not_generated: {
    label: "Answer not generated",
    explanation: "Retrieval completed without generating an answer.",
    tone: "info",
  },
};

export function isAbstentionOutcome(outcome?: AnswerOutcome): boolean {
  return outcome === "insufficient_evidence" || outcome === "unsupported_answer";
}
