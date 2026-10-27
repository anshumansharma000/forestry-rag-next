"use client";

import React, { useEffect, useRef, useState } from "react";
import { downloadSourceDocument, getDocumentPreview, type DocumentLibraryItem, type DocumentPreviewSection } from "../lib/api";
import { formatApiError } from "../lib/auth-client";
import { SidePanel } from "./side-panel";

export function DocumentFilePreview({ document, getToken, onClose }: {
  document: DocumentLibraryItem;
  getToken: () => Promise<string>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [sections, setSections] = useState<DocumentPreviewSection[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreController = useRef<AbortController | null>(null);
  const kind = document.kind.toLowerCase();
  const original = kind === "pdf" || kind === "txt";

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setLoading(true); setError(null); setPdfUrl(null); setText(null); setSections([]); setNextOffset(null);
    async function load() {
      try {
        const token = await getToken();
        if (controller.signal.aborted) return;
        if (original) {
          const file = await downloadSourceDocument(token, document.id, controller.signal);
          if (controller.signal.aborted) return;
          if (kind === "pdf") {
            // Force PDF MIME type: never render arbitrary uploaded HTML.
            objectUrl = URL.createObjectURL(new Blob([file], { type: "application/pdf" }));
            setPdfUrl(objectUrl);
          } else {
            const content = await file.text();
            if (!controller.signal.aborted) setText(content);
          }
        } else {
          const preview = await getDocumentPreview(token, document.id, 0, controller.signal);
          if (controller.signal.aborted) return;
          setSections(preview.sections); setNextOffset(preview.next_offset);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(formatApiError(err, "Unable to open this document."));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => {
      controller.abort(); moreController.current?.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attempt, document.id, getToken, kind, original]);

  async function loadMore() {
    if (nextOffset === null || moreController.current) return;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true); setError(null);
    try {
      const token = await getToken();
      if (controller.signal.aborted) return;
      const preview = await getDocumentPreview(token, document.id, nextOffset, controller.signal);
      if (controller.signal.aborted) return;
      setSections(current => [...current, ...preview.sections]); setNextOffset(preview.next_offset);
    } catch (err) {
      if (!controller.signal.aborted) setError(formatApiError(err, "Unable to load more of this document."));
    } finally {
      if (!controller.signal.aborted) { setLoadingMore(false); moreController.current = null; }
    }
  }

  return <SidePanel title="Document preview" centered wide onClose={onClose}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 break-all font-semibold">{document.filename}</p>
      {pdfUrl ? <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 content-center text-sm font-semibold text-primary hover:underline">Open in new tab</a> : null}
    </div>
    {loading ? <p role="status" className="py-12 text-center text-sm">Opening document…</p> : null}
    {error ? <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
      <p>{error}</p>
      <button type="button" className="mt-2 min-h-11 font-semibold underline" onClick={() => sections.length ? void loadMore() : setAttempt(value => value + 1)}>Try again</button>
    </div> : null}
    {pdfUrl ? <iframe title={`Preview of ${document.filename}`} src={pdfUrl} className="h-[calc(95dvh-11rem)] min-h-[240px] w-full rounded-lg border bg-slate-100" /> : null}
    {text !== null ? <pre className="whitespace-pre-wrap break-words rounded-lg border bg-slate-50 p-5 font-sans text-sm leading-7">{text || "This text file is empty."}</pre> : null}
    {!original && !loading && sections.length > 0 ? <>
      <p className="mb-4 text-sm text-slate-600">Indexed text preview. Original document formatting, images, and slide layouts are not shown.</p>
      <div className="space-y-5">{sections.map(section => <section key={section.chunk_index} className="rounded-lg border p-5">
        {section.section_heading ? <h3 className="mb-2 font-semibold">{section.section_heading}</h3> : null}
        {section.page_start != null ? <p className="mb-2 text-xs text-slate-500">{kind === "ppt" || kind === "pptx" ? "Slide" : "Page"} {section.page_start}{section.page_end != null && section.page_end !== section.page_start ? `–${section.page_end}` : ""}</p> : null}
        <p className="whitespace-pre-wrap break-words text-sm leading-7">{section.content}</p>
      </section>)}</div>
      {nextOffset !== null ? <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="mt-4 min-h-11 font-semibold text-primary disabled:opacity-50">{loadingMore ? "Loading…" : "Load more"}</button> : null}
    </> : null}
  </SidePanel>;
}
