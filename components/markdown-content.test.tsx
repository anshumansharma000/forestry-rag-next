import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Source } from "../lib/api";
import {
  MarkdownContent,
  citedSourcesForMessage,
  sourcesForAskResponse,
} from "./markdown-content";

function source(citationNumber: number, name = `Document ${citationNumber}.pdf`): Source {
  return {
    citation_number: citationNumber,
    document_id: `document-${citationNumber}`,
    source: name.toLowerCase().replaceAll(" ", "-"),
    display_source: name,
    page_start: citationNumber,
    page_end: citationNumber + 1,
    chunk_index: 0,
    section_heading: "Relevant section",
    score: 0.9,
    evidence_role: "matched",
    text: `Excerpt ${citationNumber}`,
  };
}

function render(content: string, sources: Source[] = [], revealing = false) {
  return renderToStaticMarkup(
    <MarkdownContent content={content} onSelectSource={vi.fn()} sources={sources} revealing={revealing} />,
  );
}

describe("assistant Markdown", () => {
  it("renders GitHub-Flavored Markdown blocks, nesting, and inline formatting", () => {
    const markup = render(`# Heading

**Bold** and *italic* with \`inline code\`.

1. First
   - Nested bullet
2. Second

> Quoted evidence

| Name | Value |
| --- | --- |
| Oak | 2 |`);

    expect(markup).toContain("<h1>Heading</h1>");
    expect(markup).toContain("<strong>Bold</strong>");
    expect(markup).toContain("<em>italic</em>");
    expect(markup).toContain("<code>inline code</code>");
    expect(markup).toContain("<ol>");
    expect(markup).toContain("<ul>");
    expect(markup).toContain("<blockquote>");
    expect(markup).toContain("<table>");
    expect(markup).toContain("<th>Name</th>");
  });

  it("renders a final follow-up sentence as ordinary Markdown", () => {
    const markup = render("The answer is above.\n\n**Would you like another example?**");
    expect(markup).toContain("<p><strong>Would you like another example?</strong></p>");
  });

  it("decodes HTML entities without rendering raw HTML or scripts", () => {
    const markup = render("Forest&#x20;rules <script>alert('unsafe')</script> <b>not raw</b> [bad](javascript:alert(1))");
    expect(markup).toContain("Forest rules");
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("<b>");
    expect(markup).not.toContain('href="javascript:');
  });
});

describe("answer citations", () => {
  it("renders single and grouped citation markers using citation_number", () => {
    const markup = render("One [7] and grouped [7, 3].", [source(3), source(7)]);

    expect(markup).toContain("Open source 7: Document 7.pdf");
    expect(markup).toContain("Open source 3: Document 3.pdf");
    expect(markup.match(/Open source 7/g)).toHaveLength(2);
  });

  it("orders historical sources by first citation appearance", () => {
    const sources = [source(1), source(3), source(8)];
    expect(citedSourcesForMessage("Supported [8, 1].", sources)).toEqual([
      sources[2],
      sources[0],
    ]);
  });

  it("leaves unresolved legacy references non-clickable instead of using array position", () => {
    const legacy = [{ ...source(8), citation_number: null }, source(2)];
    expect(citedSourcesForMessage("Legacy [1], explicit [2].", legacy)).toEqual([legacy[1]]);
    const markup = render("Legacy [1], explicit [2].", legacy);
    expect(markup).not.toContain("Open source 1");
    expect(markup).toContain("Open source 2");
  });

  it("uses cited_sources as authoritative instead of presenting retrieved evidence as cited", () => {
    const allSources = [source(1), source(2)];
    const citedSources = [source(2)];

    expect(sourcesForAskResponse({ answer: "Answer [2].", sources: allSources, cited_sources: citedSources })).toBe(citedSources);
    expect(sourcesForAskResponse({ answer: "Answer [2].", sources: allSources, cited_sources: [] })).toEqual([]);
    expect(sourcesForAskResponse({ answer: "No citations.", sources: allSources, cited_sources: [] })).toEqual([]);
  });
});


describe("verified answer reveal", () => {
  it("keeps complete Markdown structure and citation targets during the reveal", () => {
    const content = "# Forestry guidance\n\nA **verified answer** [1].\n\n- First step\n- Second step\n\n| Rule | Value |\n| --- | --- |\n| Oak | 2 |\n\n```text\n  preserve  spacing\n```";
    const markup = render(content, [source(1)], true);
    expect(markup).toContain('<h1 class="answer-reveal-block"');
    expect(markup).toContain("<strong>");
    expect(markup).toContain("<table>");
    expect(markup).toContain("<ul>");
    expect(markup).toContain('Open source 1: Document 1.pdf');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/data-answer-reveal-last="true"/g)).toHaveLength(1);
    expect(markup).toContain('animation-delay:0ms');
    expect(markup).not.toContain("Show full answer");
  });

  it("renders history immediately without animation or hidden content", () => {
    const markup = render("An existing answer.");
    expect(markup).not.toContain("answer-reveal-word");
    expect(markup).not.toContain('aria-hidden="true"');
    expect(markup).toContain("<p>An existing answer.</p>");
  });
});
