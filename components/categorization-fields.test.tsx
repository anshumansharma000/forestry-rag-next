import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { categorizationDraft } from "../lib/document-categorization";
import { CategorizationFields } from "./categorization-fields";

describe("category fields", () => {
  it("offers automatic suggestions and optional fields before upload", () => {
    const markup = renderToStaticMarkup(<CategorizationFields compact draft={categorizationDraft()}
      categories={[{ value: "rules", label: "Rules" }]} onChange={vi.fn()} />);
    expect(markup).toContain("Suggest during processing");
    expect(markup).toContain("Optional metadata");
    expect(markup).toContain("Consolidated as of");
    expect(markup).not.toContain("required=");
  });
  it("shows source evidence, escapes excerpt text, and distinguishes accepted values", () => {
    const markup = renderToStaticMarkup(<CategorizationFields draft={categorizationDraft({ document_type: "rules" })}
      categories={[{ value: "rules", label: "Rules" }]} onChange={vi.fn()} evidence={{ version: 1, values: {},
        field_sources: { document_type: "manual", issued_date: "inferred" },
        evidence: { issued_date: [{ page: 6, text: "Dated: 1 January 2023 <script>untrusted</script>" }] } }} />);
    expect(markup).toContain("Entered or accepted");
    expect(markup).toContain("Suggested — check the source");
    expect(markup).toContain("Page 6");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>");
  });
});
