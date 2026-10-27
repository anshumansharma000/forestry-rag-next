import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, deleteDocument } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("deleteDocument", () => {
  it("sends an authenticated DELETE using the document ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "deleted", document_id: "doc/id" })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteDocument("admin-token", "doc/id")).resolves.toEqual({ status: "deleted", document_id: "doc/id" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8000/documents/doc%2Fid");
    expect(options.method).toBe("DELETE");
    expect(options.headers.get("Authorization")).toBe("Bearer admin-token");
  });
  it.each([403, 409, 503])("surfaces %s failures so the dialog stays open for retry", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "Please retry.", code: "conflict", details: {} } }), { status })));
    await expect(deleteDocument("token", "doc")).rejects.toBeInstanceOf(ApiError);
  });
});
