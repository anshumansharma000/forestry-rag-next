import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Source } from "../lib/api";
import { SourceDrawer } from "../components/source-drawer";

const source: Source = {
  citation_number: 1,
  document_id: "document-123",
  source: "forest-rules.pdf",
  display_source: "Forest Rules.pdf",
  page_start: 4,
  page_end: 5,
  chunk_index: 2,
  section_heading: "Permits",
  score: 0.91,
  evidence_role: "matched",
  text: "Matched source text.",
};

describe("cited source downloads", () => {
  it("shows the download action to admins", () => {
    const markup = renderToStaticMarkup(
      <SourceDrawer
        canDownload
        downloading={false}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        source={source}
      />,
    );

    expect(markup).toContain("Download source file");
    expect(markup).not.toContain(' disabled=""');
  });

  it("does not render a download action for other roles", () => {
    const markup = renderToStaticMarkup(
      <SourceDrawer
        canDownload={false}
        downloading={false}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        source={source}
      />,
    );

    expect(markup).not.toContain("Download source file");
  });

  it("disables the admin action for a legacy citation without a document ID", () => {
    const markup = renderToStaticMarkup(
      <SourceDrawer
        canDownload
        downloading={false}
        onClose={vi.fn()}
        onDownload={vi.fn()}
        source={{ ...source, document_id: undefined }}
      />,
    );

    expect(markup).toContain("Download source file");
    expect(markup).toContain(' disabled=""');
  });
});
