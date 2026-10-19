"use client";

import React, { useEffect, useState } from "react";
import {
  CategoryOption, CategorizationDraft, CategorizationField, DocumentCategorization,
  listDocumentCategories, METADATA_FIELDS,
} from "../lib/document-categorization";

export function useDocumentCategories(token?: string) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [status, setStatus] = useState<"loading" | "available" | "unavailable">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setStatus("loading");
    void listDocumentCategories(token, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.categories) || !result.categories.length) throw new Error("Categories are unavailable.");
      setCategories(result.categories);
      setStatus("available");
    }).catch(() => { if (!controller.signal.aborted) setStatus("unavailable"); });
    return () => controller.abort();
  }, [token, attempt]);
  return { categories, status, retry: () => setAttempt(value => value + 1) };
}

export function CategorizationFields({ draft, categories, onChange, disabled = false, evidence, compact = false }: {
  draft: CategorizationDraft;
  categories: CategoryOption[];
  onChange: (draft: CategorizationDraft) => void;
  disabled?: boolean;
  evidence?: DocumentCategorization | null;
  compact?: boolean;
}) {
  const change = (key: CategorizationField, value: string) => onChange({ ...draft, [key]: value });
  const metadata = <div className={`grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
    {METADATA_FIELDS.map(field => <div className={field.kind === "list" && !compact ? "sm:col-span-2" : ""} key={field.key}>
      <label className="block text-sm font-semibold text-[#414844]">
        {field.label}<span className="mt-1.5 block">
          {field.kind === "list" ? <textarea aria-label={field.label} className="field min-h-20" value={draft[field.key]} maxLength={51000}
            onChange={event => change(field.key, event.target.value)} placeholder={field.hint} />
            : <input aria-label={field.label} className="field" type={field.kind === "date" ? "date" : "text"} value={draft[field.key]}
              onChange={event => change(field.key, event.target.value)} maxLength={field.kind === "text" ? 500 : undefined}
              placeholder={"hint" in field ? field.hint : undefined} />}
        </span>
      </label>
      <FieldEvidence field={field.key} categorization={evidence} />
    </div>)}
  </div>;
  return <fieldset disabled={disabled} className="min-w-0 space-y-4">
    <legend className="sr-only">Document category and metadata</legend>
    <div>
      <label className="block text-sm font-semibold text-[#414844]">Category
        <select aria-label="Category" className="field mt-1.5" value={draft.document_type} onChange={event => change("document_type", event.target.value)}>
          <option value="">{compact ? "Suggest during processing" : "Uncategorized"}</option>
          {draft.document_type && !categories.some(option => option.value === draft.document_type)
            ? <option value={draft.document_type}>{draft.document_type.replaceAll("_", " ")}</option> : null}
          {categories.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <FieldEvidence field="document_type" categorization={evidence} />
    </div>
    {compact ? <details className="rounded border border-outline-variant bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-primary">Optional metadata</summary>
      <p className="mb-4 mt-2 text-xs leading-5 text-[#626b79]">Enter what you know. Leave other fields blank for suggestions during processing.</p>
      {metadata}
    </details> : metadata}
  </fieldset>;
}

function FieldEvidence({ field, categorization }: { field: CategorizationField; categorization?: DocumentCategorization | null }) {
  const source = categorization?.field_sources?.[field];
  const excerpts = categorization?.evidence?.[field] ?? [];
  if (!source && !excerpts.length) return null;
  return <div className="mt-1 text-xs text-[#626b79]">
    <span>{source === "manual" ? "Entered or accepted" : "Suggested — check the source"}</span>
    {excerpts.length ? <details className="mt-1">
      <summary className="cursor-pointer text-primary underline">Supporting excerpts ({excerpts.length})</summary>
      <div className="mt-2 space-y-2">{excerpts.map((excerpt, index) => <blockquote className="border-l-2 border-[#b7d6c4] bg-[#f3f8f5] p-2" key={index}>
        <p className="mb-1 font-semibold">{excerpt.page == null ? "Title or filename" : `Page ${excerpt.page}`}</p>
        <p className="whitespace-pre-wrap break-words leading-5">{excerpt.text}</p>
      </blockquote>)}</div>
    </details> : null}
  </div>;
}
