"use client";

import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { safeHttpsUrl } from "../lib/answer-provenance";

export const SEARCH_SUGGESTIONS_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";
export const SEARCH_SUGGESTIONS_CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

// Preserve provider CSS, branding and inline SVG. Never put this HTML in the host DOM.
// The opaque-origin sandbox and CSP are independent layers in addition to sanitization.
export function searchSuggestionsDocument(html: string) {
  const fragment = DOMPurify.sanitize(html, {
    FORCE_BODY: true,
    USE_PROFILES: { html: true, svg: true },
    ADD_TAGS: ["style"],
    FORBID_TAGS: ["form", "input", "button", "textarea", "select", "iframe", "object", "embed", "img", "image", "use", "foreignObject", "animate", "set"],
    FORBID_ATTR: ["src", "srcset", "action", "formaction", "xlink:href"],
    RETURN_DOM_FRAGMENT: true,
  });
  fragment.querySelectorAll("a").forEach(link => {
    const href = safeHttpsUrl(link.getAttribute("href"));
    if (href) {
      link.setAttribute("href", href);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    } else {
      link.removeAttribute("href");
      link.removeAttribute("target");
    }
  });
  const container = document.createElement("div");
  container.append(fragment);
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SEARCH_SUGGESTIONS_CSP}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${container.innerHTML}</body></html>`;
}

export function GoogleSearchSuggestions({ html }: { html: string }) {
  const [rendered, setRendered] = useState<{ html: string; document: string } | null>(null);
  useEffect(() => {
    setRendered({ html, document: searchSuggestionsDocument(html) });
  }, [html]);
  return <iframe
    title="Google Search Suggestions"
    className="mt-4 h-48 w-full border-0"
    sandbox={SEARCH_SUGGESTIONS_SANDBOX}
    referrerPolicy="no-referrer"
    srcDoc={rendered?.html === html ? rendered.document : undefined}
  />;
}
