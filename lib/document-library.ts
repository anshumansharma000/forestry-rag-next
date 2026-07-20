import type { DocumentLibraryItem, DocumentLibraryParams } from "./api";

export type DocumentLibraryQuery = DocumentLibraryParams;

export const DEFAULT_DOCUMENT_QUERY: DocumentLibraryQuery = {
  search: "",
  kind: undefined,
  document_type: undefined,
  year: undefined,
  sort_by: "updated_at",
  sort_order: "desc",
  offset: 0,
  limit: 25,
};

const kinds = new Set(["pdf", "docx", "txt"]);
const sortFields = new Set([
  "updated_at",
  "created_at",
  "title",
  "source",
  "page_count",
]);

function integerParam(value: string | null, fallback: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function parseDocumentQuery(params: URLSearchParams): DocumentLibraryQuery {
  const kind = params.get("kind") ?? "";
  const sortBy = params.get("sort_by") ?? "";
  const sortOrder = params.get("sort_order");
  const year = params.get("year") ?? "";

  return {
    search: params.get("search")?.trim() ?? "",
    kind: kinds.has(kind) ? (kind as DocumentLibraryQuery["kind"]) : undefined,
    document_type: params.get("document_type")?.trim() || undefined,
    year: /^\d{4}$/.test(year) ? year : undefined,
    sort_by: sortFields.has(sortBy)
      ? (sortBy as DocumentLibraryQuery["sort_by"])
      : DEFAULT_DOCUMENT_QUERY.sort_by,
    sort_order: sortOrder === "asc" || sortOrder === "desc"
      ? sortOrder
      : DEFAULT_DOCUMENT_QUERY.sort_order,
    offset: integerParam(params.get("offset"), 0),
    limit: Math.min(100, Math.max(1, integerParam(params.get("limit"), 25))),
  };
}

export function buildDocumentQuery(query: DocumentLibraryQuery) {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.kind) params.set("kind", query.kind);
  if (query.document_type) params.set("document_type", query.document_type);
  if (query.year) params.set("year", query.year);
  params.set("sort_by", query.sort_by);
  params.set("sort_order", query.sort_order);
  params.set("offset", String(Math.max(0, query.offset)));
  params.set("limit", String(Math.min(100, Math.max(1, query.limit))));
  return params;
}

export function pageBounds(offset: number, count: number, total: number) {
  if (count === 0 || total === 0) return { start: 0, end: 0 };
  return {
    start: Math.min(total, Math.max(0, offset) + 1),
    end: Math.min(total, Math.max(0, offset) + count),
  };
}

export function previousOffset(offset: number, limit: number) {
  return Math.max(0, offset - Math.max(1, limit));
}

export function nextOffset(
  offset: number,
  limit: number,
  total: number,
) {
  if (total <= 0) return 0;
  const pageSize = Math.max(1, limit);
  const lastPageOffset = Math.floor((total - 1) / pageSize) * pageSize;
  return Math.min(offset + pageSize, lastPageOffset);
}

export function displayTitle(document: Pick<DocumentLibraryItem, "title" | "filename">) {
  return document.title?.trim() || document.filename;
}

export function displayMetadata(value: string | number | null | undefined) {
  return value == null || value === "" ? "—" : String(value);
}

export function formatIndexedDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
