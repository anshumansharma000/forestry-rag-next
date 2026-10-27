import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadSourceDocument, getDocumentPreview } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("document preview requests", () => {
  it("uses the authenticated paginated document endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sections: [], next_offset: null })));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await getDocumentPreview("admin-token", "doc/id", 40, controller.signal);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8000/documents/doc%2Fid/preview?offset=40&limit=40");
    expect(options.headers.get("Authorization")).toBe("Bearer admin-token");
    expect(options.signal).toBe(controller.signal);
  });
  it("allows closing the modal to cancel original-file retrieval", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("original"));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await downloadSourceDocument("token", "doc", controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
