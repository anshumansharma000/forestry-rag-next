"use client";

import { Loader2, Play, Search } from "lucide-react";
import { FormEvent, MutableRefObject, useEffect, useRef, useState } from "react";
import { MarkdownContent, citedSourcesForMessage } from "../../../components/markdown-content";
import { ensureFreshAuth, formatApiError } from "../../../lib/auth-client";
import { AuthState, Source } from "../../../lib/api";
import { LegalPreviewRequest, LegalPreviewResponse, previewLegalRetrieval, validateLegalPreview } from "../../../lib/legal";
import { answerOutcomeCopy } from "../../../lib/answer-outcome";
import { Notice } from "./rag-lab-ui";

const pages = (source: Source) => source.page_start == null ? "Page unavailable" : source.page_end != null && source.page_end !== source.page_start ? `Pages ${source.page_start}–${source.page_end}` : `Page ${source.page_start}`;

export function LegalPreview({ authRef }: { authRef: MutableRefObject<AuthState | null> }) {
  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState("");
  const [asOf, setAsOf] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [generate, setGenerate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LegalPreviewResponse | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending) return;
    const payload: LegalPreviewRequest = { question: question.trim(), generate_answer: generate };
    if (topK !== "") payload.top_k = Number(topK);
    if (asOf) payload.as_of = asOf;
    if (jurisdiction.trim()) payload.jurisdiction = jurisdiction.trim();
    const invalid = validateLegalPreview(payload); if (invalid) { setError(invalid); return; }
    requestRef.current?.abort(); const controller = new AbortController(); requestRef.current = controller;
    setPending(true); setError(null); setResult(null);
    try {
      const fresh = await ensureFreshAuth(authRef.current); authRef.current = fresh;
      const response = await previewLegalRetrieval(fresh.access_token, payload, controller.signal);
      if (requestRef.current === controller) setResult(response);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError") && requestRef.current === controller) setError(formatApiError(err, "Unable to run the legal retrieval preview."));
    } finally { if (requestRef.current === controller) { requestRef.current = null; setPending(false); } }
  }

  return <section>
    <h2 className="text-xl font-bold text-primary">Legal retrieval preview</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#626b79]">Searches the shared ingested document corpus using this deployment&apos;s legal registry namespace. It does not search an unpublished Knowledge Lab revision, and results must not be treated as verified current law unless the backend explicitly establishes currentness.</p>
    <form className="mt-5 rounded border border-outline-variant bg-white p-5" onSubmit={submit}>
      <label className="block text-sm font-semibold">Question<textarea className="field mt-2 min-h-28" disabled={pending} required value={question} onChange={e => setQuestion(e.target.value)} /></label>
      <div className="mt-4 grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold">Results (optional)<input className="field mt-2" min={1} max={20} placeholder="Backend default" type="number" value={topK} onChange={e => setTopK(e.target.value)} /></label><label className="text-sm font-semibold">Assessment date (optional)<input className="field mt-2" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></label><label className="text-sm font-semibold">Jurisdiction (optional)<input className="field mt-2" value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} /></label></div>
      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-semibold"><input checked={generate} className="h-5 w-5 accent-primary" onChange={e => setGenerate(e.target.checked)} type="checkbox" />Generate answer <span className="font-normal text-[#626b79]">(off by default; retrieval always runs)</span></label>
      <button className="primary-button mt-4" disabled={pending || !question.trim()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : generate ? <Play className="h-4 w-4" /> : <Search className="h-4 w-4" />}{pending ? "Searching…" : generate ? "Retrieve and generate answer" : "Preview retrieval"}</button>
    </form>
    {error ? <div className="mt-4"><Notice tone="error">{error}</Notice></div> : null}
    {result ? <PreviewResult generate={generate} result={result} /> : !pending ? <div className="mt-5 rounded border border-dashed border-outline-variant p-8 text-center text-sm text-[#626b79]">No legal preview has been run. Previews do not persist a chat or trial.</div> : null}
  </section>;
}

export function legalPreviewState(result: LegalPreviewResponse, generated: boolean) {
  void generated;
  return result.outcome;
}

function PreviewResult({ generate, result }: { generate: boolean; result: LegalPreviewResponse }) {
  const state = legalPreviewState(result, generate); const sources = result.sources ?? [];
  const cited = result.cited_sources?.length ? result.cited_sources : result.outcome === "answered" ? citedSourcesForMessage(result.answer ?? "", sources) : [];
  const review = result.review ?? {}; const evidence = result.evidence ?? {};
  const presentation = answerOutcomeCopy[state];
  return <div className="mt-6 space-y-5">
    <Notice tone={presentation.tone === "error" || presentation.tone === "warning" ? "error" : "info"}><strong>{presentation.label}.</strong> {presentation.explanation}</Notice>
    {generate && result.answer ? <article className="rounded border border-outline-variant bg-white p-5"><div className="flex flex-wrap items-center gap-3"><h3 className="text-lg font-bold text-primary">Answer</h3>{result.abstained ? <span className="rounded bg-[#fff5f1] px-2 py-1 text-xs font-bold text-[#743f2c]">Backend abstention</span> : null}<span className="text-xs text-[#626b79]">Retrieval score {result.confidence == null ? "—" : result.confidence.toFixed(3)}</span></div><div className="mt-3 text-sm leading-6"><MarkdownContent content={result.answer} onSelectSource={() => {}} sources={cited} /></div></article> : null}
    <section><h3 className="font-bold text-primary">Retrieved excerpts ({sources.length})</h3>{sources.length ? <div className="mt-3 space-y-3">{sources.map((source, index) => <article className="rounded border border-outline-variant bg-white p-4" key={`${source.document_id ?? source.source}-${source.chunk_index}-${index}`}><div className="flex flex-wrap justify-between gap-2"><strong>{source.display_source}</strong><span className="text-xs text-[#626b79]">Retrieval score {source.score.toFixed(3)}</span></div><p className="mt-1 text-xs text-[#626b79]">{pages(source)}{source.section_heading ? ` · ${source.section_heading}` : ""}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{source.text}</p></article>)}</div> : <p className="mt-2 text-sm text-[#626b79]">No retrieved excerpts.</p>}</section>
    <section className="grid gap-4 lg:grid-cols-2"><DefensivePanel title="Review checks" value={review} /><DefensivePanel title="Evidence and search stages" value={evidence} /></section>
    <section className="rounded border border-outline-variant bg-white p-4"><h3 className="font-bold text-primary">Review summary</h3><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><Summary label="Missing reviewed evidence categories" value={Array.isArray(review.missing_reviewed_evidence_categories) && review.missing_reviewed_evidence_categories.length ? review.missing_reviewed_evidence_categories.join(", ") : "None reported"} /><Summary label="Relationships missing selected evidence" value={Array.isArray(review.relationships_missing_selected_evidence) ? review.relationships_missing_selected_evidence.length : "Not reported"} /><Summary label="Relationship-search truncation" value={review.relationship_search_truncated == null ? "Not reported" : review.relationship_search_truncated ? "Truncated" : "Not truncated"} /></dl></section>
  </div>;
}

function DefensivePanel({ title, value }: { title: string; value: unknown }) { return <details className="rounded border border-outline-variant bg-white p-4" open><summary className="cursor-pointer font-bold text-primary">{title}</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-container-low p-3 text-xs leading-5">{value && typeof value === "object" && Object.keys(value as object).length ? JSON.stringify(value, null, 2) : "Not reported by the backend."}</pre></details>; }
function Summary({ label, value }: { label: string; value: React.ReactNode }) { return <div><dt className="text-xs font-bold uppercase text-[#626b79]">{label}</dt><dd className="mt-1">{value}</dd></div>; }
