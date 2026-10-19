import type { IngestJob } from "./api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, completeDocumentUploads, presignDocumentUploads } from "./api";
import { processDocumentUploads } from "./document-upload-flow";
import {
  prepareWithReplacementConfirmation, recoverableUploadConflicts, UploadReplacementCancelled,
} from "./upload-replacement";

afterEach(() => vi.unstubAllGlobals());
const conflict = (index = 0, filename = "failed.pdf") => ({ index, filename, state: "failed", can_replace_failed: true, requires_confirmation: true });
const error = (conflicts: unknown[] = [conflict()], canReplace = true) => new ApiError({
  status: 409, code: "conflict", message: "A duplicate exists.", details: { conflicts, can_replace_failed: canReplace },
});

describe("confirmed failed-upload recovery", () => {
  it("does not prompt or add replacement flags to ordinary uploads", async () => {
    const request = vi.fn().mockResolvedValue("ready");
    const confirm = vi.fn();
    expect(await prepareWithReplacementConfirmation(2, request, confirm)).toBe("ready");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith([]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("names the duplicate and retries only explicitly confirmed file indices", async () => {
    const request = vi.fn().mockRejectedValueOnce(error([conflict(1, "Forest_Rules.pdf")])).mockResolvedValueOnce("ready");
    const confirm = vi.fn((message: string) => Boolean(message));
    expect(await prepareWithReplacementConfirmation(2, request, confirm)).toBe("ready");
    expect(request.mock.calls).toEqual([[[]], [[1]]]);
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toContain("Forest_Rules.pdf");
    expect(confirm.mock.calls[0][0]).toContain("Replace their stored files");
  });

  it("does not retry after cancellation", async () => {
    const request = vi.fn().mockRejectedValue(error());
    await expect(prepareWithReplacementConfirmation(1, request, () => false)).rejects.toBeInstanceOf(UploadReplacementCancelled);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["indexed", "processing"])("never offers to overwrite a %s document", async state => {
    const rejected = error([{ ...conflict(), state, can_replace_failed: false, requires_confirmation: false }], false);
    const request = vi.fn().mockRejectedValue(rejected);
    const confirm = vi.fn((message: string) => Boolean(message));
    await expect(prepareWithReplacementConfirmation(1, request, confirm)).rejects.toBe(rejected);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not authorize mixed batches or unknown/legacy conflict responses", () => {
    expect(recoverableUploadConflicts(error([conflict(), { ...conflict(1), state: "indexed", can_replace_failed: false }]), 2)).toBeNull();
    expect(recoverableUploadConflicts(error([conflict(4)]), 1)).toBeNull();
    expect(recoverableUploadConflicts(error([conflict(), conflict()]), 1)).toBeNull();
    expect(recoverableUploadConflicts(new ApiError({ status: 409, code: "conflict", message: "File exists.", details: {} }), 1)).toBeNull();
  });

  it("propagates a new conflict after confirmation without repeatedly prompting", async () => {
    const changed = error([{ ...conflict(), state: "processing", can_replace_failed: false }], false);
    const request = vi.fn().mockRejectedValueOnce(error()).mockRejectedValueOnce(changed);
    const confirm = vi.fn((message: string) => Boolean(message));
    await expect(prepareWithReplacementConfirmation(1, request, confirm)).rejects.toBe(changed);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("keeps selected files ready and queues nothing when the user cancels", async () => {
    const put = vi.fn(); const complete = vi.fn(); const startIngest = vi.fn(); const updates = vi.fn();
    const outcome = await processDocumentUploads([{ key: "failed", file: { name: "failed.pdf", size: 10 } as File }], {
      presign: async () => { throw new UploadReplacementCancelled(); }, put, complete, startIngest,
      onUpdate: updates, errorMessage: () => "Error",
    });
    expect(outcome).toEqual({ cancelled: true });
    expect(updates).toHaveBeenLastCalledWith("failed", { status: "selected", detail: "Re-upload cancelled. Existing files were kept." });
    expect(put).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled(); expect(startIngest).not.toHaveBeenCalled();
  });

  it("serializes confirmation per file on both preparation and completion", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response('{"uploads":[],"files":[]}', { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await presignDocumentUploads("token", [{ filename: "failed.pdf", size_bytes: 12, content_type: "application/pdf", replace_failed: true }]);
    await completeDocumentUploads("token", [{ upload_id: "upload", filename: "failed.pdf", replace_failed: true, categorization: { document_type: "rules" } }]);
    expect(JSON.parse(fetch.mock.calls[0][1].body).files[0].replace_failed).toBe(true);
    expect(JSON.parse(fetch.mock.calls[1][1].body).files[0]).toEqual({
      upload_id: "upload", filename: "failed.pdf", replace_failed: true, categorization: { document_type: "rules" },
    });
  });
});

  it("finishes a recovery batch before ingestion starts and serializes source replacements", async () => {
    const events: string[] = [];
    let completing = false;
    const items = ["a.pdf", "b.pdf"].map(name => ({ key: name, file: { name, size: 10 } as File }));
    const updates = vi.fn();
    await processDocumentUploads(items, {
      presign: async () => items.map(item => ({ upload_id: item.key, filename: item.file.name, upload_url: "/put", method: "PUT",
        headers: {}, expires_in_seconds: 60, max_bytes: 100, replace_failed: true })),
      put: async () => undefined,
      complete: async upload => {
        expect(completing).toBe(false);
        completing = true;
        events.push(`complete:${upload.filename}`);
        await Promise.resolve();
        completing = false;
        return { status: "ok", filename: upload.filename, path: "/file" };
      },
      startIngest: async source => { events.push(`ingest:${source}`); return { id: source, status: "queued" } as IngestJob; },
      onUpdate: updates, errorMessage: error => String(error),
    });
    expect(events).toEqual(["complete:a.pdf", "complete:b.pdf", "ingest:a.pdf", "ingest:b.pdf"]);
    expect(updates.mock.calls.filter(([, update]) => update.status === "failed")).toHaveLength(0);
  });
