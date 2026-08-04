import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DocumentLibraryItem } from "../../lib/api";
import { DocumentStatus } from "./document-status";

const failedDocument: DocumentLibraryItem = {
  id: "document-1",
  filename: "encrypted-rules.pdf",
  title: "Encrypted rules",
  kind: "pdf",
  page_count: null,
  document_type: "rules",
  authority: null,
  years: [],
  chunk_count: 0,
  status: "failed",
  ingest_error: "The PDF is encrypted.",
  retryable: true,
  ingested_at: null,
  created_at: "2026-08-04T00:00:00Z",
  updated_at: "2026-08-04T00:00:00Z",
};

describe("failed document status rendering", () => {
  it("renders the badge, error, and authorized retry action", () => {
    const markup = renderToStaticMarkup(
      <DocumentStatus
        canRetry
        document={failedDocument}
        onRetry={vi.fn()}
      />,
    );

    expect(markup).toContain("Failed");
    expect(markup).toContain("The PDF is encrypted.");
    expect(markup).toContain("Retry processing");
  });

  it("hides retry without permission or while processing", () => {
    const unauthorized = renderToStaticMarkup(
      <DocumentStatus
        canRetry={false}
        document={failedDocument}
        onRetry={vi.fn()}
      />,
    );
    const processing = renderToStaticMarkup(
      <DocumentStatus
        canRetry
        document={failedDocument}
        onRetry={vi.fn()}
        retryState={{ status: "running", error: null }}
      />,
    );

    expect(unauthorized).not.toContain("Retry processing");
    expect(processing).toContain("Processing");
    expect(processing).not.toContain("Retry processing");
  });
});
