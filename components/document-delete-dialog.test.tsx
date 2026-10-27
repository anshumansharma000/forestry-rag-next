// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentLibraryItem } from "../lib/api";
import { DocumentDeleteDialog } from "./document-delete-dialog";

const documentFile = { id: "doc-1", filename: "rules.pdf" } as DocumentLibraryItem;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
const buttons = () => Array.from(host.querySelectorAll("button"));
const confirm = () => buttons().find(button => button.textContent === "Delete permanently")!;

describe("document deletion confirmation", () => {
  it("shows the exact file and consequences, and cancel sends no deletion", async () => {
    const remove = vi.fn(); const close = vi.fn();
    await act(async () => root.render(<DocumentDeleteDialog document={documentFile} onClose={close} onDelete={remove} />));
    expect(host.textContent).toContain("rules.pdf");
    expect(host.textContent).toContain("cannot be undone");
    expect(host.textContent).toContain("Existing chat messages remain");
    expect(document.activeElement?.getAttribute("aria-label")).toContain("Close");
    act(() => buttons().find(button => button.textContent === "Cancel")!.click());
    expect(close).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });
  it("prevents duplicate requests and closing while deletion runs", async () => {
    let finish!: () => void;
    const remove = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const close = vi.fn();
    await act(async () => root.render(<DocumentDeleteDialog document={documentFile} onClose={close} onDelete={remove} />));
    act(() => { confirm().click(); confirm().click(); });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(buttons().every(button => button.disabled)).toBe(true);
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish());
  });
  it("keeps errors visible and permits retry", async () => {
    const remove = vi.fn().mockRejectedValueOnce(new Error("Processing is running.")).mockResolvedValueOnce(undefined);
    await act(async () => root.render(<DocumentDeleteDialog document={documentFile} onClose={vi.fn()} onDelete={remove} />));
    await act(async () => confirm().click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Processing is running.");
    expect(confirm().disabled).toBe(false);
    await act(async () => confirm().click());
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
