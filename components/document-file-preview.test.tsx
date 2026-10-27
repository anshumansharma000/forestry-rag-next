// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentLibraryItem } from "../lib/api";
import { downloadSourceDocument, getDocumentPreview } from "../lib/api";
import { DocumentFilePreview } from "./document-file-preview";

vi.mock("../lib/api", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/api")>(),
  downloadSourceDocument: vi.fn(), getDocumentPreview: vi.fn(),
}));
const getToken = vi.fn(async () => "admin-token");
const createUrl = vi.fn(() => "blob:preview");
const revokeUrl = vi.fn();
let host: HTMLDivElement;
let root: Root;
const file = (kind: string) => ({ id: "doc-1", filename: `rules.${kind}`, kind } as DocumentLibraryItem);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(downloadSourceDocument).mockReset();
  vi.mocked(getDocumentPreview).mockReset();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const NativeURL = URL;
  vi.stubGlobal("URL", class extends NativeURL {
    static createObjectURL = createUrl;
    static revokeObjectURL = revokeUrl;
  });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const clickText = (text: string) => Array.from(host.querySelectorAll("button")).find(button => button.textContent === text)!.click();

async function render(kind: string) {
  await act(async () => root.render(<DocumentFilePreview document={file(kind)} getToken={getToken} onClose={vi.fn()} />));
}

describe("authenticated document preview", () => {
  it("shows PDFs in a large modal with a new-tab link and releases the file URL", async () => {
    vi.mocked(downloadSourceDocument).mockResolvedValue(new Blob(["pdf bytes"], { type: "text/html" }));
    await render("pdf");
    expect(downloadSourceDocument).toHaveBeenCalledWith("admin-token", "doc-1", expect.any(AbortSignal));
    expect(host.querySelector("iframe")?.title).toBe("Preview of rules.pdf");
    expect(host.querySelector("iframe")?.getAttribute("src")).toBe("blob:preview");
    expect((createUrl.mock.calls[0] as unknown as [Blob])[0].type).toBe("application/pdf");
    expect(host.querySelector('a[target="_blank"]')?.getAttribute("rel")).toBe("noopener noreferrer");
    await act(async () => root.render(null));
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview");
  });

  it("displays text as escaped content rather than executable HTML", async () => {
    vi.mocked(downloadSourceDocument).mockResolvedValue({ text: async () => '<script>attack()</script>\nOriginal rules' } as Blob);
    await render("txt");
    expect(host.querySelector("pre")?.textContent).toContain('<script>attack()</script>');
    expect(host.querySelector("script")).toBeNull();
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("loads indexed Word or PowerPoint text in pages without downloading the original", async () => {
    vi.mocked(getDocumentPreview)
      .mockResolvedValueOnce({ document_id: "doc-1", filename: "rules.pptx", next_offset: 40,
        sections: [{ chunk_index: 0, content: "First slide", section_heading: "Rules", page_start: 1, page_end: 1 }] })
      .mockResolvedValueOnce({ document_id: "doc-1", filename: "rules.pptx", next_offset: null,
        sections: [{ chunk_index: 40, content: "Last slide", section_heading: null, page_start: 2, page_end: 2 }] });
    await render("pptx");
    expect(host.textContent).toContain("Indexed text preview");
    expect(host.textContent).toContain("Slide 1");
    expect(downloadSourceDocument).not.toHaveBeenCalled();
    await act(async () => clickText("Load more"));
    expect(getDocumentPreview).toHaveBeenLastCalledWith("admin-token", "doc-1", 40, expect.any(AbortSignal));
    expect(host.textContent).toContain("First slide");
    expect(host.textContent).toContain("Last slide");
    expect(host.textContent).not.toContain("Load more");
  });

  it("offers retry for missing or inaccessible originals", async () => {
    vi.mocked(downloadSourceDocument).mockRejectedValueOnce(new Error("Original file not found."))
      .mockResolvedValueOnce({ text: async () => "Available again" } as Blob);
    await render("txt");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Original file not found.");
    await act(async () => clickText("Try again"));
    expect(host.querySelector("pre")?.textContent).toBe("Available again");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("aborts requests on close and ignores a response that arrives after closing", async () => {
    let finish!: (file: Blob) => void;
    vi.mocked(downloadSourceDocument).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render("pdf");
    const signal = vi.mocked(downloadSourceDocument).mock.calls[0][2]!;
    expect(host.textContent).toContain("Opening document");
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
    await act(async () => finish(new Blob(["late pdf"])));
    expect(createUrl).not.toHaveBeenCalled();
  });
});
