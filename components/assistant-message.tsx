"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import type { ChatMessage, Source } from "../lib/api";
import { answerOutcomeCopy, isAbstentionOutcome, isScopeOutcome, isConversationalAnswer } from "../lib/answer-outcome";
import { normalizeAnswerData } from "../lib/answer-provenance";
import { BrandLogo } from "./brand-logo";
import { citedSourcesForMessage } from "./markdown-content";
import { AnswerContent } from "./answer-content";

function pageRange(source: Source) {
  if (source.page_start == null && source.page_end == null) {
    return "Page number unavailable";
  }
  if (source.page_start === source.page_end || source.page_end == null) {
    return `Page ${source.page_start}`;
  }
  return `Pages ${source.page_start}-${source.page_end}`;
}

function evidenceRoleLabel(source: Source) {
  return source.evidence_role === "neighbor" ? "Nearby context" : "Matched";
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function AssistantMessage({
  message,
  onSelectSource,
  animate = false,
}: {
  message: ChatMessage;
  onSelectSource: (source: Source) => void;
  animate?: boolean;
}) {
  const [revealing, setRevealing] = useState(animate);
  useEffect(() => {
    if (!revealing) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finish = () => setRevealing(false);
    if (preference.matches || !animate) {
      finish();
      return;
    }
    // Also finish if the tab was backgrounded or animation events were interrupted.
    const timer = window.setTimeout(finish, 6400);
    preference.addEventListener("change", finish);
    return () => {
      window.clearTimeout(timer);
      preference.removeEventListener("change", finish);
    };
  }, [revealing, animate]);
  const data = normalizeAnswerData({ answer: message.content, sources: message.sources }, message.metadata ?? {});
  const conversational = isConversationalAnswer(data);
  const abstained = !conversational && data.abstained === true;
  const outcome = data.outcome;
  const scoped = isScopeOutcome(outcome);
  const outcomePresentation = !conversational && outcome ? answerOutcomeCopy[outcome] : null;
  const unsuccessful = !conversational && !scoped && (outcome ? isAbstentionOutcome(outcome) : abstained);
  const web = data.answer_origin === "web";
  const confidence = conversational || web || scoped ? null : data.confidence;
  const [copied, setCopied] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const citedSources = data.cited_sources ?? (unsuccessful
    ? [] : citedSourcesForMessage(message.content, message.sources ?? []));

  async function handleCopy() {
    try {
      await copyTextToClipboard(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 sm:gap-4">
      <div
        className={`grid h-8 w-8 place-items-center rounded-lg text-white ${
          unsuccessful ? "bg-[#fff5f1]" : "bg-[#edf8f1]"
        }`}
      >
        <BrandLogo className="h-6 w-6" />
      </div>

      <div className="min-w-0">
        <article
          aria-busy={revealing}
          className={`min-w-0 rounded-xl px-1 py-1 text-[16px] leading-7 text-[#202625] sm:px-2 ${
            unsuccessful
              ? "border border-[#e5bda9] bg-[#fff8f5] p-4"
              : "bg-transparent"
          }`}
        >
          <div className="mb-3 flex min-h-8 items-start justify-between gap-3">
            {outcomePresentation && outcome !== "answered" ? (
              <div className={`flex flex-wrap items-center gap-2 text-[13px] leading-4 ${scoped ? "font-medium text-[#626b79]" : "font-semibold uppercase text-[#8d5a4a]"}`}>
                <span>{outcomePresentation.label}</span>
                {confidence != null ? (
                  <span className="rounded-sm bg-[#f4d0bf] px-2 py-1 text-[12px] text-[#743f2c]">
                    Evidence match {confidence.toFixed(3)}
                  </span>
                ) : null}
              </div>
            ) : abstained ? (
              <span className="text-[13px] font-semibold uppercase text-[#8d5a4a]">Historical abstention</span>
            ) : (
              <span className="pt-1.5 text-[12px] font-medium text-[#7d8780]">Aranyabodh AI</span>
            )}
            {!revealing ? <button
              aria-label="Copy assistant response"
              className="answer-controls-in grid h-8 w-8 shrink-0 place-items-center rounded text-[#4e5966] transition hover:bg-surface-container-low disabled:opacity-60"
              onClick={() => void handleCopy()}
              title={copied ? "Copied" : "Copy response"}
              type="button"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button> : null}
          </div>
          <p className="sr-only" role="status">{revealing ? "Revealing answer…" : "Answer ready."}</p>
          <AnswerContent
            {...data}
            showOutcomeLabel={false}
            answer={message.content}
            onSelectSource={onSelectSource}
            cited_sources={citedSources}
            revealing={revealing}
            onRevealComplete={() => setRevealing(false)}
          />
          {!revealing && outcomePresentation && isAbstentionOutcome(outcome) ? (
            <p className="mt-4 text-[14px] leading-6 text-[#743f2c]">
              {outcomePresentation.explanation}
            </p>
          ) : null}
        </article>

        {!revealing && citedSources.length ? (
          <div className="answer-controls-in mt-4 flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold uppercase leading-4 text-[#8f99a8]">
              Sources
            </span>
            {(sourcesExpanded ? citedSources : citedSources.slice(0, 3)).map((source) => (
              <SourceChip
                key={`${source.source}-${source.chunk_index}-${source.score}`}
                label={source.display_source}
                number={source.citation_number}
                onClick={() => onSelectSource(source)}
                source={source}
              />
            ))}
            {citedSources.length > 3 ? <button aria-expanded={sourcesExpanded} className="min-h-11 rounded-lg px-3 text-[13px] font-semibold text-primary hover:bg-[#edf8f1]" onClick={() => setSourcesExpanded((expanded) => !expanded)} type="button">{sourcesExpanded ? "Show fewer" : `Show all ${citedSources.length} sources`}</button> : null}
          </div>
        ) : null}
        {!revealing && !conversational && !web && !scoped && unsuccessful && message.sources?.length ? (
          <details className="mt-4 rounded border border-outline-variant bg-white px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-semibold uppercase text-[#7b8492]">Retrieved evidence — not validated as answer support ({message.sources.length})</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {message.sources.map((source) => <SourceChip key={`${source.source}-${source.chunk_index}-${source.score}`} label={source.display_source} number={source.citation_number} onClick={() => onSelectSource(source)} source={source} />)}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function SourceChip({
  label,
  number,
  onClick,
  source,
}: {
  label: string;
  number: number | null;
  onClick: () => void;
  source: Source;
}) {
  return (
    <button
      aria-label={`Source ${number ?? "citation"}: ${label}, ${pageRange(source)}`}
      className="grid min-h-11 max-w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 rounded-lg border border-[#dde4de] bg-[#f0f4f1] px-3 py-2 text-left text-[14px] leading-4 text-[#44584b] transition hover:bg-[#e5ede7] sm:inline-flex"
      onClick={onClick}
      type="button"
    >
      <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-white/70 text-[12px] font-bold">{number ?? "—"}</span>
      <span className="min-w-0 truncate font-semibold">{label}</span>
      <span className="col-start-2 text-[12px] opacity-75 sm:col-auto sm:shrink-0">
        {pageRange(source)} · {evidenceRoleLabel(source)}
      </span>
    </button>
  );
}

