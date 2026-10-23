"use client";

import React from "react";
import type { AnswerProvenance } from "../lib/answer-provenance";
import { normalizeAnswerData } from "../lib/answer-provenance";
import { answerOutcomeCopy, isScopeOutcome, isConversationalAnswer } from "../lib/answer-outcome";
import type { AnswerOutcome, Source } from "../lib/api";
import { MarkdownContent } from "./markdown-content";
import { GoogleSearchSuggestions } from "./google-search-suggestions";

/** Shared answer body for /ask responses and live or saved chat replies. */
export function AnswerContent({ answer, cited_sources, onSelectSource, revealing, onRevealComplete, outcome, showOutcomeLabel = true, ...provenance }: AnswerProvenance & {
  answer: string;
  outcome?: AnswerOutcome;
  showOutcomeLabel?: boolean;
  cited_sources: Source[];
  onSelectSource: (source: Source) => void;
  revealing?: boolean;
  onRevealComplete?: () => void;
}) {
  const normalized = normalizeAnswerData({ ...provenance, answer, cited_sources, outcome });
  const conversational = isConversationalAnswer(normalized);
  const scoped = !conversational && isScopeOutcome(outcome);
  const web = !conversational && !scoped && normalized.answer_origin === "web";
  return <>
    {scoped && showOutcomeLabel && outcome ? <p className="mb-3 text-[13px] font-medium text-[#626b79]">{answerOutcomeCopy[outcome].label}</p> : null}
    {web ? <p role="note" className="mb-4 rounded-lg border border-[#e5bda9] bg-[#fff8f5] px-4 py-2 font-bold text-[#743f2c]">Internet-sourced answer</p> : null}
    <MarkdownContent
      content={answer}
      sources={conversational || web || scoped ? [] : cited_sources}
      onSelectSource={onSelectSource}
      httpsLinksOnly={web}
      revealing={revealing}
      onRevealComplete={onRevealComplete}
    />
    {web && normalized.web_sources.length ? <section aria-label="Web sources" className="mt-4">
      <h3 className="text-[13px] font-semibold uppercase text-[#7b8492]">Web sources</h3>
      <ul className="mt-2 flex flex-wrap gap-2">{normalized.web_sources.map((source, index) => <li key={`${source.citation_number}-${index}`}>
        <a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-[14px] font-semibold text-primary underline" href={source.url} target="_blank" rel="noopener noreferrer">[Web {source.citation_number}] {source.title}</a>
      </li>)}</ul>
    </section> : null}
    {web && normalized.web_search_entry_point ? <GoogleSearchSuggestions html={normalized.web_search_entry_point} /> : null}
  </>;
}
