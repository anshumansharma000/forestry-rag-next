import { isAnswerOutcome, isScopeOutcome, isConversationalAnswer } from "./answer-outcome";
import type { ChatMessage, Source } from "./api";

export type WebSource = { citation_number: number; url: string; title: string };
export type AnswerProvenance = {
  answer_origin?: "documents" | "web" | "conversational";
  web_sources?: WebSource[];
  web_search_entry_point?: string | null;
};

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeAnswerProvenance(value: AnswerProvenance | Record<string, unknown>) {
  const web = value.answer_origin === "web";
  return {
    answer_origin: web ? "web" as const : value.answer_origin === "conversational" ? "conversational" as const : "documents" as const,
    web_sources: web && Array.isArray(value.web_sources) ? value.web_sources.filter((source): source is WebSource => {
      if (!source || typeof source !== "object") return false;
      const candidate = source as WebSource;
      return Number.isInteger(candidate.citation_number) && candidate.citation_number > 0 &&
        typeof candidate.title === "string" && !!safeHttpsUrl(candidate.url);
    }).map(source => ({ ...source, url: safeHttpsUrl(source.url)! })) : [],
    web_search_entry_point: web && typeof value.web_search_entry_point === "string" && value.web_search_entry_point.trim()
      ? value.web_search_entry_point : null,
  };
}

export function normalizeAssistantMessage(message: ChatMessage): ChatMessage {
  if (message.role !== "assistant") return message;
  const data = normalizeAnswerData({ answer: message.content, sources: message.sources }, message.metadata ?? {});
  return {
    ...message,
    metadata: {
      ...message.metadata,
      answer_origin: data.answer_origin,
      web_sources: data.web_sources,
      web_search_entry_point: data.web_search_entry_point,
      ...(data.cited_sources === undefined ? {} : { cited_sources: data.cited_sources }),
    },
  };
}

/** Top-level response values win, including false, zero, null and empty arrays. */
export function normalizeAnswerData(response: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
  const field = (key: string, metadataKey = key) => response[key] === undefined ? metadata[metadataKey] : response[key];
  const outcome = field("outcome");
  const abstained = field("abstained");
  const confidence = field("confidence", "retrieval_confidence");
  const sources = field("sources");
  const citedSources = field("cited_sources");
  const provenance = normalizeAnswerProvenance({
    answer_origin: field("answer_origin"),
    web_sources: field("web_sources"),
    web_search_entry_point: field("web_search_entry_point"),
  });
  const conversational = isConversationalAnswer({ ...provenance, outcome: isAnswerOutcome(outcome) ? outcome : undefined });
  return {
    ...provenance,
    answer: typeof field("answer") === "string" ? field("answer") as string : "",
    outcome: isAnswerOutcome(outcome) ? outcome : undefined,
    abstained: typeof abstained === "boolean" ? abstained : undefined,
    confidence: !conversational && typeof confidence === "number" && Number.isFinite(confidence) ? confidence : null,
    sources: !conversational && Array.isArray(sources) ? sources as Source[] : [],
    // Keep missing legacy citations distinct so the existing inline-citation fallback works.
    cited_sources: conversational || provenance.answer_origin === "web" || (isAnswerOutcome(outcome) && isScopeOutcome(outcome))
      ? [] : Array.isArray(citedSources) ? citedSources as Source[] : undefined,
  };
}
