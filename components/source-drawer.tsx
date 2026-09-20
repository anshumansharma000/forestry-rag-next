import React, { useEffect, useRef } from "react";
import { ChevronDown, Download, Loader2, X } from "lucide-react";
import type { Source } from "../lib/api";

function pageRange(source: Source) {
  if (source.page_start == null && source.page_end == null) return "Page number unavailable";
  if (source.page_start === source.page_end || source.page_end == null) {
    return `Page ${source.page_start}`;
  }
  return `Pages ${source.page_start}-${source.page_end}`;
}

function evidenceRoleLabel(source: Source) {
  return source.evidence_role === "neighbor" ? "Nearby context" : "Matched";
}

export function SourceDrawer({
  canDownload,
  downloading,
  onClose,
  onDownload,
  source,
}: {
  canDownload: boolean;
  downloading: boolean;
  onClose: () => void;
  onDownload: (source: Source) => void;
  source: Source | null;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!source) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose, source]);

  if (!source) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
    <aside
      aria-label={`Source excerpt: ${source.display_source}`}
      aria-modal="true"
      className="h-full w-full border-l border-outline-variant bg-white shadow-2xl sm:w-[480px]"
      role="dialog"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-outline-variant/70 px-5 py-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase text-[#7b8492]">
              Source Excerpt
            </p>
            <h3 className="mt-1 truncate text-[19px] font-bold text-primary">
              {source.display_source}
            </h3>
          </div>
          <button
            aria-label="Close source excerpt"
            className="grid h-9 w-9 shrink-0 place-items-center rounded border border-outline-variant hover:bg-surface-container-low"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {canDownload ? (
              <button
                className="mb-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-[15px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-55"
                disabled={downloading || !source.document_id}
                onClick={() => onDownload(source)}
                title={
                  source.document_id
                    ? "Download the original source file"
                    : "Download will be available after the backend supplies a document ID"
                }
                type="button"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {downloading ? "Downloading…" : "Download source file"}
              </button>
            ) : null}
            <details
              className="rounded border border-outline-variant/70 bg-surface-container-lowest p-4"
              open
            >
              <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-semibold uppercase text-[#626b79]">
                Excerpt
                <ChevronDown className="h-4 w-4" />
              </summary>
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-[#202625]">
                {source.text}
              </p>
            </details>

            <details className="mt-4 rounded border border-outline-variant/70 bg-white p-4" open>
              <summary className="cursor-pointer text-[14px] font-semibold text-primary">
                Source details
              </summary>
              <div className="mt-4 grid grid-cols-2 gap-3 text-[13px] leading-5">
                <DrawerMetric label="File" value={source.source} />
                <DrawerMetric label="Pages" value={pageRange(source)} />
                {source.section_heading ? (
                  <DrawerMetric label="Section" value={source.section_heading} />
                ) : null}
                <DrawerMetric label="Evidence" value={evidenceRoleLabel(source)} />
                <DrawerMetric label="Excerpt" value={source.chunk_index + 1} />
                <DrawerMetric label="Retrieval score" value={source.score.toFixed(3)} />
              </div>
            </details>
          </div>
      </div>
    </aside>
    </div>
  );
}

function DrawerMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded bg-surface-container-low p-3">
      <p className="text-[12px] font-semibold uppercase text-[#7b8492]">{label}</p>
      <p className="mt-1 break-words text-[14px] font-semibold text-[#151a18]">{value}</p>
    </div>
  );
}
