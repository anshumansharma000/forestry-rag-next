// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { GoogleSearchSuggestions, searchSuggestionsDocument, SEARCH_SUGGESTIONS_CSP, SEARCH_SUGGESTIONS_SANDBOX } from "./google-search-suggestions";

beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());

function parse(html: string) { return new DOMParser().parseFromString(searchSuggestionsDocument(html), "text/html"); }

describe("isolated Google Search Suggestions", () => {
  it("preserves the provider's CSS, branding and suggestion text", () => {
    const css = ".container { display: flex; } @media (prefers-color-scheme: dark) { .container { color: white; } }";
    const doc = parse(`<style>${css}</style><div class="container"><svg viewBox="0 0 10 10"><path d="M0 0h10v10" fill="#4285f4" /></svg><a href="https://www.google.com/search?q=forests">Forests</a></div>`);
    expect(doc.querySelector("style")?.textContent).toBe(css);
    expect(doc.querySelector("svg path")?.getAttribute("fill")).toBe("#4285f4");
    expect(doc.querySelector("a")?.textContent).toBe("Forests");
    expect(doc.querySelector("a")?.getAttribute("target")).toBe("_blank");
    expect(doc.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("removes executable HTML, navigation overrides, unsafe links and external resources", () => {
    const doc = parse(`<meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test"><script>alert(1)</script><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input></form><img src="https://evil.test/pixel" onerror="alert(1)"><a href="javascript:alert(1)" onclick="alert(1)">Bad</a><a href="http://google.com">HTTP</a><svg><a href="data:text/html,bad">SVG bad</a></svg>`);
    expect(doc.querySelector("script, iframe, form, input, img, [onclick], [onerror]")).toBeNull();
    expect(doc.querySelector('meta[http-equiv="refresh"]')).toBeNull();
    expect(doc.querySelector("base[href]")).toBeNull();
    expect(doc.querySelector("a[href]")).toBeNull();
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content")).toBe(SEARCH_SUGGESTIONS_CSP);
    expect(SEARCH_SUGGESTIONS_CSP).toContain("connect-src 'none'");
  });

  it("mounts only a sandboxed opaque-origin frame and updates it when the answer changes", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<GoogleSearchSuggestions html='<a href="https://google.com/search?q=first">First</a>' />));
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe(SEARCH_SUGGESTIONS_SANDBOX);
    expect(frame.getAttribute("sandbox")).not.toMatch(/allow-scripts|allow-same-origin|allow-top-navigation/);
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.srcdoc).toContain("First");
    expect(container.querySelector("a")).toBeNull();
    await act(async () => root.render(<GoogleSearchSuggestions html="<div>Second</div>" />));
    expect(frame.srcdoc).toContain("Second");
    expect(frame.srcdoc).not.toContain("First");
    await act(async () => root.unmount());
  });
});
