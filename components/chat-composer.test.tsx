import React, { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./chat-composer";

function renderComposer(value: string, disabled = false, sending = false) {
  return renderToStaticMarkup(<ChatComposer value={value} disabled={disabled} sending={sending} onChange={vi.fn()} onSend={vi.fn()} inputRef={createRef<HTMLTextAreaElement>()} onHeightChange={vi.fn()} />);
}

describe("chat composer availability", () => {
  it("keeps blank prompts from being sent and explains keyboard controls", () => {
    const markup = renderComposer("   ");
    expect(markup).toMatch(/<button[^>]*disabled=""/);
    expect(markup).toContain("Enter to send · Shift + Enter for a new line");
  });

  it("allows a draft to be sent", () => {
    const markup = renderComposer("What are the clearance rules?");
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain("What are the clearance rules?");
  });

  it("distinguishes a saved unresolved message from an active search", () => {
    const blocked = renderComposer("Saved question", true);
    expect(blocked).toContain("Retry or discard the saved message to continue.");
    expect(blocked).not.toContain("Searching your documents");
    expect(blocked).toMatch(/<textarea[^>]*disabled=""/);
    const busy = renderComposer("Saved question", true, true);
    expect(busy).toContain('aria-label="Sending prompt"');
    expect(busy).toContain("Searching your documents");
  });
});
