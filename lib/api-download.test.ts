import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadSourceDocument } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadSourceDocument", () => {
  it("requests the encoded document endpoint with bearer authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("original file", {
        headers: { "Content-Type": "application/pdf" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const blob = await downloadSourceDocument("admin-token", "document/id");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/documents/document%2Fid/download",
      { headers: { Authorization: "Bearer admin-token" } },
    );
    expect(await blob.text()).toBe("original file");
  });
});
