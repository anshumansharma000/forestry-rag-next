import { afterEach, describe, expect, it, vi } from "vitest";
import { listDocuments } from "./api";
import {
  DEFAULT_DOCUMENT_QUERY,
  buildDocumentQuery,
  displayMetadata,
  displayTitle,
  formatIndexedDate,
  nextOffset,
  pageBounds,
  parseDocumentQuery,
  previousOffset,
} from "./document-library";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("document library query parameters", () => {
  it("constructs every supported server parameter and trims search", () => {
    const params = buildDocumentQuery({
      search: "  forest rules  ",
      kind: "pdf",
      document_type: "rules",
      year: "2024",
      sort_by: "title",
      sort_order: "asc",
      offset: 50,
      limit: 25,
    });

    expect(Object.fromEntries(params)).toEqual({
      search: "forest rules",
      kind: "pdf",
      document_type: "rules",
      year: "2024",
      sort_by: "title",
      sort_order: "asc",
      offset: "50",
      limit: "25",
    });
  });

  it("uses safe defaults and bounds invalid URL values", () => {
    const parsed = parseDocumentQuery(
      new URLSearchParams("kind=xlsx&year=24&sort_by=nope&offset=-2&limit=500"),
    );

    expect(parsed).toEqual({ ...DEFAULT_DOCUMENT_QUERY, limit: 100 });
  });
});

describe("document library pagination", () => {
  it("handles first, last, and empty page boundaries", () => {
    expect(previousOffset(0, 25)).toBe(0);
    expect(previousOffset(25, 25)).toBe(0);
    expect(nextOffset(975, 25, 1_000)).toBe(975);
    expect(pageBounds(975, 25, 1_000)).toEqual({ start: 976, end: 1_000 });
    expect(pageBounds(0, 0, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe("document library responses", () => {
  it("supports an empty corpus response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          pagination: { offset: 0, limit: 25, total: 0, has_more: false },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );

    const response = await listDocuments("token", DEFAULT_DOCUMENT_QUERY);
    expect(response.items).toEqual([]);
    expect(response.pagination.total).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/documents?sort_by=updated_at&sort_order=desc&offset=0&limit=25",
      expect.objectContaining({
        headers: expect.objectContaining({}),
      }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(request.headers).get("Authorization")).toBe("Bearer token");
  });

  it("surfaces the API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "documents_unavailable",
              message: "The document index is temporarily unavailable.",
              details: { retryable: true },
            },
          }),
          { status: 503 },
        ),
      ),
    );

    await expect(listDocuments("token", DEFAULT_DOCUMENT_QUERY)).rejects.toMatchObject({
      code: "documents_unavailable",
      message: "The document index is temporarily unavailable.",
      status: 503,
    });
  });

  it("uses restrained fallbacks for missing optional metadata", () => {
    expect(displayTitle({ title: "  ", filename: "fallback.pdf" })).toBe("fallback.pdf");
    expect(displayMetadata(null)).toBe("—");
    expect(displayMetadata(undefined)).toBe("—");
    expect(formatIndexedDate(null)).toBe("—");
    expect(formatIndexedDate("not-a-date")).toBe("—");
  });
});
