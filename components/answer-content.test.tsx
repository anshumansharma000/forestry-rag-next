import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnswerContent } from "./answer-content";
import { AssistantMessage } from "./assistant-message";
const WEB_ANSWER_DISCLOSURE = "The available documents did not provide enough verified evidence. This answer uses internet sources and has not been verified against the document database.";
import type { WebSource } from "../lib/answer-provenance";
import type { ChatMessage, Source } from "../lib/api";

const source: Source = { citation_number: 1, document_id: "doc", source: "candidate.pdf", display_source: "Candidate.pdf", page_start: 1, page_end: 1, chunk_index: 0, section_heading: null, score: .95, evidence_role: "matched", text: "Candidate" };
const message: ChatMessage = { id: "a", session_id: "s", role: "assistant", content: `${WEB_ANSWER_DISCLOSURE}\n\nAn answer [Web 1](https://example.com/article). [1]`, sources: [source], metadata: { answer_origin: "web", outcome: "answered", abstained: false, retrieval_confidence: .95, cited_sources: [source], web_sources: [{ citation_number: 1, title: "Article", url: "https://example.com/article" }], web_search_entry_point: "<div>Search suggestions</div>" }, created_at: "now" };

describe("internet answers across views", () => {
  it("shows a single disclosure and linked web sources for a standalone answer", () => {
    const markup = renderToStaticMarkup(<AnswerContent answer={message.content} answer_origin="web" web_sources={message.metadata.web_sources as WebSource[]} cited_sources={[source]} onSelectSource={vi.fn()} />);
    expect(markup.match(/Internet-sourced answer/g)).toHaveLength(1);
    expect(markup.split(WEB_ANSWER_DISCLOSURE)).toHaveLength(2);
    expect(markup).toContain('[Web 1] Article');
    expect(markup).toContain("Web sources");
    expect(markup).toContain('href="https://example.com/article"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).not.toContain("Open source 1");
  });

  it("renders saved metadata without document candidates or confidence", () => {
    const markup = renderToStaticMarkup(<AssistantMessage message={message} onSelectSource={vi.fn()} />);
    expect(markup).toContain("Internet-sourced answer");
    expect(markup).toContain("Google Search Suggestions");
    expect(markup).not.toContain("Candidate.pdf");
    expect(markup).not.toContain("Evidence match");
    expect(markup).not.toContain("0.950");
    expect(markup).not.toContain("Insufficient evidence");
  });


  it("keeps the provenance warning and suggestions visible while revealing a new reply", () => {
    const markup = renderToStaticMarkup(<AssistantMessage message={message} onSelectSource={vi.fn()} animate />);
    expect(markup).toContain('role="note"');
    expect(markup).toContain("Internet-sourced answer");
    expect(markup).toContain("Google Search Suggestions");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("Candidate.pdf");
  });


  it("preserves arbitrary backend disclosure wording without inventing a warning", () => {
    const disclosure = "Internet information is unverified; the documents could not support this answer.";
    const markup = renderToStaticMarkup(<AnswerContent answer={`${disclosure}\n\nAnswer.`} answer_origin="web" cited_sources={[]} onSelectSource={vi.fn()} />);
    expect(markup.split(disclosure)).toHaveLength(2);
    expect(markup).not.toContain(WEB_ANSWER_DISCLOSURE);
    expect(markup).toContain("Internet-sourced answer");
  });

  it.each(["out_of_scope", "clarification_required"] as const)("renders %s normally with no evidence panels", outcome => {
    const label = outcome === "out_of_scope" ? "Outside supported topics" : "More details needed";
    const props = { ...message, content: "Backend guidance [1].", metadata: { ...message.metadata, outcome, abstained: true } };
    const markup = renderToStaticMarkup(<AssistantMessage message={props} onSelectSource={vi.fn()} />);
    expect(markup).toContain(label);
    expect(markup).toContain("Backend guidance [1].");
    expect(markup).not.toContain("Candidate.pdf");
    expect(markup).not.toContain("Evidence match");
    expect(markup).not.toContain("Retrieved evidence");
    expect(markup).not.toContain("Internet-sourced answer");
    expect(markup).not.toContain("iframe");
    expect(markup).not.toContain("bg-[#fff8f5]");
    const standalone = renderToStaticMarkup(<AnswerContent answer="Backend guidance [1]." outcome={outcome} cited_sources={[source]} onSelectSource={vi.fn()} />);
    expect(standalone).toContain(label);
    expect(standalone).not.toContain("Open source 1");
  });

  it.each(["http://example.com", "javascript:alert(1)", "data:text/html,bad", "//example.com", "https://user:password@example.com", "https://example.com\\@evil.com"])("disables unsafe web links: %s", url => {
    const markup = renderToStaticMarkup(<AnswerContent answer={`[Web 1](${url})`} answer_origin="web" web_sources={[{ citation_number: 1, title: "Unsafe source", url }]} cited_sources={[]} onSelectSource={vi.fn()} />);
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain("Unsafe source");
  });

  it("preserves legacy document citations and the source drawer action", () => {
    const markup = renderToStaticMarkup(<AssistantMessage message={{ ...message, content: "Document answer [1].", metadata: {} }} onSelectSource={vi.fn()} />);
    expect(markup).toContain("Open source 1: Candidate.pdf");
    expect(markup).toContain("Source 1: Candidate.pdf");
    expect(markup).not.toContain("Internet-sourced");
    expect(markup).not.toContain("iframe");
  });

  it("preserves insufficient-evidence presentation and retrieval diagnostics", () => {
    const markup = renderToStaticMarkup(<AssistantMessage message={{ ...message, content: "Not enough evidence.", metadata: { outcome: "insufficient_evidence", abstained: true, retrieval_confidence: .2 } }} onSelectSource={vi.fn()} />);
    expect(markup).toContain("Insufficient evidence");
    expect(markup).toContain("Evidence match 0.200");
    expect(markup).toContain("not validated as answer support");
    expect(markup).not.toContain("Open source 1");
  });
});


describe("conversational assistant rendering", () => {
  it.each(["Hello! How can I help?", "You’re welcome!"])("renders %s as an ordinary assistant message", content => {
    const markup = renderToStaticMarkup(<AssistantMessage message={{ ...message, content, sources: [], metadata: { outcome: "conversational", answer_origin: "conversational", abstained: false, retrieval_confidence: null, cited_sources: [] } }} onSelectSource={vi.fn()} />);
    expect(markup).toContain(content);
    expect(markup).toContain("Aranyabodh AI");
    expect(markup).not.toMatch(/Evidence match|Sources|Web sources|Internet-sourced|abstention|Insufficient evidence|not enough evidence|Open source|iframe/);
  });

  it.each([
    { outcome: "conversational" },
    { answer_origin: "conversational" },
  ])("suppresses stale evidence and abstention metadata when marked by %j", conversational => {
    const metadata = { ...message.metadata, outcome: "insufficient_evidence", abstained: true, retrieval_confidence: .9, ...conversational };
    const markup = renderToStaticMarkup(<AssistantMessage message={{ ...message, content: "Hello! [1]", metadata }} onSelectSource={vi.fn()} />);
    expect(markup).toContain("Hello! [1]");
    expect(markup).toContain("Aranyabodh AI");
    expect(markup).not.toMatch(/Evidence match|Candidate.pdf|Internet-sourced|abstention|Insufficient evidence|Open source|iframe/);
  });

  it("keeps citations on an ordinary forestry answer", () => {
    const markup = renderToStaticMarkup(<AssistantMessage message={{ ...message, content: "A forestry management plan describes silvicultural operations [1].", metadata: { outcome: "answered", answer_origin: "documents", abstained: false, retrieval_confidence: .95, cited_sources: [source] } }} onSelectSource={vi.fn()} />);
    expect(markup).toContain("A forestry management plan");
    expect(markup).toContain("Open source 1: Candidate.pdf");
    expect(markup).toContain("Source 1: Candidate.pdf");
    expect(markup).not.toContain("Internet-sourced");
  });
});
