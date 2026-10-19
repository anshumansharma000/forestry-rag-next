"use client";

import { AlertCircle, Loader2, Save, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentLibraryItem } from "../lib/api";
import { formatApiError } from "../lib/auth-client";
import {
  CategoryOption, CategorizationDraft, DocumentCategorization, categorizationDraft,
  categorizationPatch, getDocumentCategorization, saveDocumentCategorization, validateCategorizationDraft,
} from "../lib/document-categorization";
import { CategorizationFields } from "./categorization-fields";

export function DocumentMetadataReview({ document: item, categories, getToken, onClose, onSaved }: {
  document: DocumentLibraryItem;
  categories: CategoryOption[];
  getToken: () => Promise<string>;
  onClose: () => void;
  onSaved: (categorization: DocumentCategorization) => void;
}) {
  const [original, setOriginal] = useState<DocumentCategorization | null>(item.categorization ?? null);
  const [draft, setDraft] = useState<CategorizationDraft>(() => categorizationDraft(item.categorization?.values));
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<() => void>(() => undefined);
  const dirty = Object.keys(categorizationPatch(draft, original?.values ?? {})).length > 0;
  const hasSuggestions = Object.values(original?.field_sources ?? {}).includes("inferred");
  const close = useCallback(() => {
    if (!saving && (!dirty || window.confirm("Discard unsaved document metadata changes?"))) onClose();
  }, [dirty, onClose, saving]);
  closeRef.current = close;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const token = await getToken();
        if (controller.signal.aborted) return;
        const response = await getDocumentCategorization(token, item.id, controller.signal);
        if (controller.signal.aborted) return;
        setOriginal(response.categorization);
        setDraft(categorizationDraft(response.categorization?.values));
        setLoaded(true);
      } catch (err) {
        if (!controller.signal.aborted) setError(formatApiError(err, "Unable to load document metadata."));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [attempt, getToken, item.id]);

  useEffect(() => {
    const previousFocus = window.document.activeElement as HTMLElement | null;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]',
      ) ?? []).filter(element => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); panelRef.current?.focus(); return; }
      const active = window.document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || active === panelRef.current)) { event.preventDefault(); first.focus(); }
    };
    window.document.addEventListener("keydown", keydown);
    return () => {
      window.document.removeEventListener("keydown", keydown);
      window.document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  async function save(acceptSuggestions: boolean) {
    if (saving || !loaded) return;
    const validationError = validateCategorizationDraft(draft, categories);
    if (validationError) { setError(validationError); return; }
    const patch = categorizationPatch(draft, original?.values ?? {}, acceptSuggestions);
    if (!Object.keys(patch).length) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await saveDocumentCategorization(await getToken(), item.id, patch);
      setOriginal(response.categorization);
      setDraft(categorizationDraft(response.categorization.values));
      onSaved(response.categorization);
      setNotice(acceptSuggestions ? "Suggestions accepted and metadata saved." : "Document metadata saved.");
    } catch (err) {
      setError(`${formatApiError(err, "Unable to save document metadata.")} Your unsaved changes have been kept.`);
    } finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/35" onMouseDown={event => {
    if (event.target === event.currentTarget) close();
  }}>
    <aside role="dialog" aria-modal="true" aria-labelledby="metadata-review-title" tabIndex={-1} ref={panelRef}
      className="flex h-full w-full flex-col bg-surface shadow-2xl sm:max-w-2xl">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-outline-variant p-5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-[#626b79]">Document metadata</p>
          <h2 id="metadata-review-title" className="mt-1 break-words text-xl font-bold text-primary">{item.title || item.filename}</h2>
          <p className="mt-1 break-all text-xs text-[#626b79]">{item.filename}</p>
        </div>
        <button className="grid h-11 w-11 shrink-0 place-items-center rounded hover:bg-surface-container" type="button"
          aria-label="Close metadata review" disabled={saving} onClick={close}><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <p className="mb-5 text-sm leading-6 text-[#626b79]">Check the suggested values against their supporting excerpts. You can correct or clear any field. Saving metadata keeps the original file and searchable content in place.</p>
        {error ? <div className="mb-4 flex items-start gap-2 rounded border border-[#f0c4b6] bg-[#fff5f1] p-3 text-sm text-[#743f2c]" role="alert">
          <AlertCircle className="h-5 w-5 shrink-0" /><div>{error}{!loaded ? <button className="mt-2 block min-h-11 underline" onClick={() => setAttempt(value => value + 1)} type="button">Try again</button> : null}</div>
        </div> : null}
        {notice ? <p className="mb-4 rounded bg-[#edf8f1] p-3 text-sm text-primary" role="status">{notice}</p> : null}
        {loading ? <p className="flex items-center gap-2 py-6 text-sm" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading metadata…</p> : null}
        {!loading && loaded ? <CategorizationFields draft={draft} categories={categories} onChange={value => {
          setDraft(value); setNotice(null);
        }} disabled={saving} evidence={original} /> : null}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-outline-variant bg-surface p-4">
        <span className="mr-auto text-xs text-[#626b79]" aria-live="polite">{dirty ? "Unsaved changes" : ""}</span>
        <button className="secondary-button" type="button" disabled={saving} onClick={close}>Close</button>
        {hasSuggestions ? <button className="secondary-button" type="button" disabled={saving || loading || !loaded}
          onClick={() => void save(true)}>Accept suggestions and save</button> : null}
        <button className="primary-button" type="button" disabled={saving || loading || !loaded || !dirty} onClick={() => void save(false)}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save changes
        </button>
      </footer>
    </aside>
  </div>;
}
