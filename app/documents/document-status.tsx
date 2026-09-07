import { Loader2, RefreshCw } from "lucide-react";
import React from "react";
import type { DocumentLibraryItem } from "../../lib/api";
import { formatIndexedDate } from "../../lib/document-library";
import type { RetryUpdate } from "../../lib/document-retry";

export function DocumentStatus({ canRetry, document, onRetry, retryState }: {
  canRetry: boolean;
  document: DocumentLibraryItem;
  onRetry: (document: DocumentLibraryItem) => void;
  retryState?: RetryUpdate;
}) {
  const status = retryState?.status ?? document.status;
  const processing = status === "queued" || status === "running";
  const error = retryState?.error ?? document.ingest_error;

  if (status === "indexed" || status === "succeeded") {
    return (
      <span className="text-[13px] text-[#4e5966]">
        <span className="block font-bold text-primary">
          {document.chunk_count > 0 ? "Ready for chat" : "Needs review"}
        </span>
        <span className="mt-1 block text-[12px]">Processed {formatIndexedDate(document.ingested_at)}</span>
      </span>
    );
  }

  if (processing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {status === "queued" ? "Queued" : "Processing"}
      </span>
    );
  }

  return (
    <div className="min-w-0">
      <span className="inline-flex rounded bg-[#fbe3da] px-2 py-0.5 text-[11px] font-bold text-[#8a3f27]">Failed</span>
      {error ? <p className="mt-2 break-words text-[12px] leading-4 text-[#743f2c]">{error}</p> : null}
      {document.status === "failed" && document.retryable && canRetry ? (
        <button
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded px-2 text-[12px] font-bold text-primary hover:bg-[#edf8f1] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={processing}
          onClick={() => onRetry(document)}
          type="button"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry processing
        </button>
      ) : null}
    </div>
  );
}
