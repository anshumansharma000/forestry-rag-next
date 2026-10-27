"use client";

import React, { useRef, useState } from "react";
import type { DocumentLibraryItem } from "../lib/api";
import { formatApiError } from "../lib/auth-client";
import { SidePanel } from "./side-panel";

export function DocumentDeleteDialog({ document, onClose, onDelete }: {
  document: DocumentLibraryItem;
  onClose: () => void;
  onDelete: (document: DocumentLibraryItem) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onDelete(document);
    } catch (err) {
      setError(formatApiError(err, "Unable to delete this document. Please retry."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return <SidePanel title="Delete document?" centered busy={busy} onClose={onClose}>
    <p className="break-all font-semibold">{document.filename}</p>
    <p className="mt-3 text-sm leading-6">This permanently removes the original file and its indexed content from the library and future AI answers. This cannot be undone.</p>
    <p className="mt-2 text-sm leading-6">Existing chat messages remain, but their links to this file will no longer work.</p>
    {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
    <div className="mt-6 flex justify-end gap-3">
      <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-lg border px-4 disabled:opacity-50">Cancel</button>
      <button type="button" disabled={busy} onClick={() => void confirm()} className="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white disabled:opacity-50">{busy ? "Deleting…" : "Delete permanently"}</button>
    </div>
  </SidePanel>;
}
