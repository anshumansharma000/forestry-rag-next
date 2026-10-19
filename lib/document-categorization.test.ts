import { afterEach, describe, expect, it, vi } from "vitest";
import { completeDocumentUploads, listDocuments, uploadDocument, uploadDocuments } from "./api";
import type { IngestJob } from "./api";
import {
  categorizationDraft, categorizationPatch, getDocumentCategorization,
  listDocumentCategories, saveDocumentCategorization, uploadCategorization, validateCategorizationDraft,
} from "./document-categorization";
import { buildDocumentQuery, DEFAULT_DOCUMENT_QUERY, parseDocumentQuery } from "./document-library";
import { processDocumentUploads } from "./document-upload-flow";

afterEach(() => vi.unstubAllGlobals());
const categories = [{ value: "rules" as const, label: "Rules" }];

describe("optional upload metadata", () => {
  it("keeps blank uploads unchanged rather than sending null overrides", () => {
    expect(uploadCategorization(categorizationDraft())).toBeUndefined();
    const draft = categorizationDraft({ document_type: "rules", subjects: ["FCA"], issued_date: "2023-01-01" });
    draft.issuing_authority = " MoEFCC ";
    expect(uploadCategorization(draft)).toEqual({ document_type: "rules", subjects: ["FCA"], issued_date: "2023-01-01", issuing_authority: "MoEFCC" });
  });

  it("validates dates, category values, and backend list limits", () => {
    const draft = categorizationDraft({ document_type: "rules", issued_date: "2023-02-29" });
    expect(validateCategorizationDraft(draft, categories)).toMatch(/valid issue date/);
    draft.issued_date = "2024-02-29";
    expect(validateCategorizationDraft(draft, categories)).toBeNull();
    draft.subjects = Array(31).fill("FCA").join("\n");
    expect(validateCategorizationDraft(draft, categories)).toMatch(/30 entries/);
    expect(validateCategorizationDraft(categorizationDraft({ document_type: "act" }), categories)).toMatch(/available category/);
  });

  it("preserves per-file metadata through normalized direct-upload filenames", async () => {
    const files = [{ key: "one", file: { name: "Forest Rules.pdf", size: 10 } as File, categorization: { document_type: "rules" as const } },
      { key: "two", file: { name: "notes.txt", size: 20 } as File }];
    const complete = vi.fn(async upload => ({ status: "ok" as const, filename: upload.filename, path: "/file" }));
    const startIngest = vi.fn(async () => ({ id: "job", status: "queued" }) as IngestJob);
    await processDocumentUploads(files, {
      presign: async () => files.map((item, index) => ({ upload_id: String(index), filename: index ? item.file.name : "Forest_Rules.pdf",
        upload_url: "/put", method: "PUT", headers: {}, expires_in_seconds: 600, max_bytes: 100 })),
      put: async () => undefined, complete, startIngest, onUpdate: vi.fn(), errorMessage: () => "Failed",
    });
    expect(complete.mock.calls[0]).toEqual([expect.objectContaining({ filename: "Forest_Rules.pdf" }), { document_type: "rules" }]);
    expect(complete.mock.calls[1]).toHaveLength(1);
    expect(startIngest).toHaveBeenCalledWith("Forest_Rules.pdf");
  });
});

describe("review corrections", () => {
  const original = { document_type: "rules" as const, issued_date: "2023-01-01", subjects: ["FCA"], state: "Kerala" };
  it("sends only changed fields and preserves explicit clears", () => {
    const draft = categorizationDraft(original);
    draft.issued_date = ""; draft.subjects = ""; draft.state = "Karnataka";
    expect(categorizationPatch(draft, original)).toEqual({ issued_date: null, subjects: [], state: "Karnataka" });
  });
  it("accepts existing suggestions without inventing values for missing fields", () => {
    expect(categorizationPatch(categorizationDraft(original), original)).toEqual({});
    expect(categorizationPatch(categorizationDraft(original), original, true)).toEqual(original);
  });
});

describe("category API contracts", () => {
  function mockFetch(data: unknown) {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(data), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }
  it("keeps the old direct-completion request and adds metadata only when supplied", async () => {
    const fetch = mockFetch({ files: [] });
    const upload = { upload_id: "id", filename: "rules.pdf" };
    await completeDocumentUploads("token", [upload]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ files: [upload] });
    await completeDocumentUploads("token", [{ ...upload, categorization: { document_type: "rules" } }]);
    expect(JSON.parse(fetch.mock.calls[1][1].body).files[0].categorization).toEqual({ document_type: "rules" });
  });
  it("supports optional single and batch multipart metadata", async () => {
    const fetch = mockFetch({ files: [] });
    const file = new File(["Rules"], "rules.txt", { type: "text/plain" });
    await uploadDocument("token", file);
    expect((fetch.mock.calls[0][1].body as FormData).has("categorization")).toBe(false);
    await uploadDocument("token", file, { document_type: "rules" });
    expect((fetch.mock.calls[1][1].body as FormData).get("categorization")).toBe('{"document_type":"rules"}');
    await uploadDocuments("token", [file], { "rules.txt": { document_type: "rules" } });
    expect(JSON.parse((fetch.mock.calls[2][1].body as FormData).get("categorizations") as string)).toEqual({ "rules.txt": { document_type: "rules" } });
  });
  it("loads and saves with authorization and safe document paths", async () => {
    const fetch = mockFetch({ document_id: "id", categorization: null, categories });
    await listDocumentCategories("token");
    await getDocumentCategorization("token", "id/other");
    await saveDocumentCategorization("token", "id/other", { issued_date: null });
    expect(fetch.mock.calls[1][0]).toContain("/documents/id%2Fother/categorization");
    expect(new Headers(fetch.mock.calls[2][1].headers).get("Authorization")).toBe("Bearer token");
    expect(fetch.mock.calls[2][1].method).toBe("PATCH");
    expect(fetch.mock.calls[2][1].body).toBe('{"issued_date":null}');
  });
  it("round trips the new category filter alongside the legacy type filter", async () => {
    const query = { ...DEFAULT_DOCUMENT_QUERY, category: "consolidated_guidelines" as const, document_type: "guidelines" };
    expect(parseDocumentQuery(buildDocumentQuery(query))).toEqual(query);
    expect(parseDocumentQuery(new URLSearchParams("category=invalid")).category).toBeUndefined();
    const fetch = mockFetch({ items: [], pagination: {} });
    await listDocuments("token", query);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get("category")).toBe("consolidated_guidelines");
    expect(url.searchParams.get("document_type")).toBe("guidelines");
  });
});
