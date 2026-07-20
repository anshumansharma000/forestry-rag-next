"use client";

import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureFreshAuth, formatApiError, loadStoredSession } from "../../lib/auth-client";
import {
  AuthState,
  DocumentLibraryItem,
  DocumentLibraryResponse,
  listDocuments,
} from "../../lib/api";
import {
  DEFAULT_DOCUMENT_QUERY,
  DocumentLibraryQuery,
  buildDocumentQuery,
  displayMetadata,
  displayTitle,
  formatIndexedDate,
  nextOffset,
  pageBounds,
  parseDocumentQuery,
  previousOffset,
} from "../../lib/document-library";

const DOCUMENT_TYPES = [
  "rules",
  "act",
  "guidelines",
  "circular",
  "notification",
  "order",
  "procedure",
  "faq",
  "document",
];

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function currentUrlQuery() {
  if (typeof window === "undefined") return DEFAULT_DOCUMENT_QUERY;
  return parseDocumentQuery(new URLSearchParams(window.location.search));
}

function writeQuery(query: DocumentLibraryQuery, replace = false) {
  const search = buildDocumentQuery(query).toString();
  const next = `${window.location.pathname}?${search}`;
  if (next === `${window.location.pathname}${window.location.search}`) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", next);
}

export default function DocumentsPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [query, setQuery] = useState<DocumentLibraryQuery>(DEFAULT_DOCUMENT_QUERY);
  const [searchInput, setSearchInput] = useState("");
  const [yearInput, setYearInput] = useState("");
  const [data, setData] = useState<DocumentLibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const authRef = useRef<AuthState | null>(null);
  const dataRef = useRef<DocumentLibraryResponse | null>(null);

  const commitQuery = useCallback(
    (
      update: Partial<DocumentLibraryQuery> | ((value: DocumentLibraryQuery) => DocumentLibraryQuery),
      replace = false,
    ) => {
      setQuery((current) => {
        const next = typeof update === "function" ? update(current) : { ...current, ...update };
        writeQuery(next, replace);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const initialQuery = currentUrlQuery();
    setQuery(initialQuery);
    setSearchInput(initialQuery.search ?? "");
    setYearInput(initialQuery.year ?? "");
    writeQuery(initialQuery, true);

    const onPopState = () => {
      const next = currentUrlQuery();
      setQuery(next);
      setSearchInput(next.search ?? "");
      setYearInput(next.year ?? "");
    };
    window.addEventListener("popstate", onPopState);

    async function loadAuth() {
      try {
        const session = await loadStoredSession();
        if (!session) {
          window.location.assign("/login");
          return;
        }
        if (!cancelled) {
          authRef.current = session;
          setAuth(session);
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatApiError(err, "Unable to load the document library."));
          setLoading(false);
        }
      }
    }

    void loadAuth();
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (searchInput === (query.search ?? "")) return;
    const timer = window.setTimeout(() => {
      commitQuery((current) => ({ ...current, search: searchInput, offset: 0 }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [commitQuery, query.search, searchInput]);

  useEffect(() => {
    if (!auth) return;
    const controller = new AbortController();
    let active = true;

    async function loadDocuments() {
      if (dataRef.current) setUpdating(true);
      else setLoading(true);
      setError(null);

      try {
        const nextAuth = await ensureFreshAuth(authRef.current ?? auth);
        if (!active) return;
        authRef.current = nextAuth;
        setAuth(nextAuth);
        const response = await listDocuments(nextAuth.access_token, query, controller.signal);
        if (!active) return;

        if (response.items.length === 0 && response.pagination.total > 0 && query.offset > 0) {
          const lastOffset = Math.floor((response.pagination.total - 1) / query.limit) * query.limit;
          commitQuery({ offset: lastOffset }, true);
          return;
        }
        dataRef.current = response;
        setData(response);
      } catch (err) {
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(formatApiError(err, "Unable to load documents."));
      } finally {
        if (active) {
          setLoading(false);
          setUpdating(false);
        }
      }
    }

    void loadDocuments();
    return () => {
      active = false;
      controller.abort();
    };
  }, [auth, commitQuery, query, retryKey]);

  const setControl = (update: Partial<DocumentLibraryQuery>) =>
    commitQuery({ ...update, offset: 0 });

  const clearFilters = () =>
    {
      setYearInput("");
      setControl({ kind: undefined, document_type: undefined, year: undefined });
    };

  const clearSearchAndFilters = () => {
    setSearchInput("");
    setYearInput("");
    commitQuery((current) => ({
      ...current,
      search: "",
      kind: undefined,
      document_type: undefined,
      year: undefined,
      offset: 0,
    }));
  };

  const filtersActive = Boolean(query.kind || query.document_type || query.year);
  const searchOrFiltersActive = Boolean(query.search || filtersActive);
  const bounds = pageBounds(
    data?.pagination.offset ?? query.offset,
    data?.items.length ?? 0,
    data?.pagination.total ?? 0,
  );

  return (
    <main className="min-h-screen bg-surface px-4 py-5 text-on-surface sm:px-8 sm:py-7">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col justify-between gap-4 border-b border-outline-variant pb-6 sm:flex-row sm:items-end">
          <div>
            <a className="inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[#4e5966] hover:text-primary" href="/">
              <ArrowLeft className="h-4 w-4" />
              Back to chat
            </a>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-[30px] font-bold leading-9 text-primary">Documents</h1>
              <p className="text-[14px] font-semibold text-[#626b79]" aria-live="polite">
                {data ? `${data.pagination.total.toLocaleString()} indexed documents` : "Indexed document library"}
              </p>
            </div>
          </div>
          <div className="inline-flex min-h-11 w-fit items-center gap-2 rounded border border-[#b7d6c4] bg-[#edf8f1] px-3 text-[13px] font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" />
            {auth?.user.email ?? "Loading"}
          </div>
        </header>

        <section className="mt-6" aria-labelledby="library-controls">
          <h2 className="sr-only" id="library-controls">Document library controls</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b7480]" />
            <input
              aria-label="Search documents by title or filename"
              className="h-14 w-full rounded border border-outline-variant bg-white pl-12 pr-12 text-[16px] shadow-tonal placeholder:text-[#7b8492] focus:border-primary"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by title or filename"
              type="search"
              value={searchInput}
            />
            {searchInput ? (
              <button
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded text-[#626b79] hover:bg-surface-container-low"
                onClick={() => setSearchInput("")}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid gap-3 sm:grid-cols-3 lg:flex lg:flex-wrap">
              <SelectControl label="File type" value={query.kind ?? ""} onChange={(value) => setControl({ kind: (value || undefined) as DocumentLibraryQuery["kind"] })}>
                <option value="">All file types</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
                <option value="txt">TXT</option>
              </SelectControl>
              <SelectControl label="Document type" value={query.document_type ?? ""} onChange={(value) => setControl({ document_type: value || undefined })}>
                <option value="">All document types</option>
                {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
              </SelectControl>
              <label className="sr-only" htmlFor="document-year">Year</label>
              <input
                aria-label="Filter by four-digit year"
                className="h-11 min-w-0 rounded border border-outline-variant bg-white px-3 text-[14px] text-[#323b45] focus:border-primary lg:w-32"
                id="document-year"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => {
                  const value = event.target.value.replace(/\D/g, "").slice(0, 4);
                  setYearInput(value);
                  if (!value || value.length === 4) setControl({ year: value || undefined });
                }}
                placeholder="Year"
                type="text"
                value={yearInput}
              />
              {filtersActive ? (
                <button className="inline-flex h-11 items-center justify-center gap-2 rounded px-3 text-[14px] font-semibold text-primary hover:bg-[#edf8f1]" onClick={clearFilters} type="button">
                  <X className="h-4 w-4" /> Clear all filters
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-[#626b79]" aria-hidden="true" />
              <SelectControl
                label="Sort documents"
                value={`${query.sort_by}:${query.sort_order}`}
                onChange={(value) => {
                  const [sort_by, sort_order] = value.split(":") as [DocumentLibraryQuery["sort_by"], DocumentLibraryQuery["sort_order"]];
                  setControl({ sort_by, sort_order });
                }}
                grow
              >
                <option value="updated_at:desc">Newest indexed</option>
                <option value="updated_at:asc">Oldest indexed</option>
                <option value="title:asc">Title A–Z</option>
                <option value="title:desc">Title Z–A</option>
              </SelectControl>
            </div>
          </div>
        </section>

        {error ? (
          <div className="mt-5 flex flex-col gap-3 rounded border border-[#e6b7a6] bg-[#fff5f1] p-4 text-[#743f2c] sm:flex-row sm:items-center sm:justify-between" role="alert">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="text-[14px] font-semibold">{error}</span>
            </div>
            <button
              className="h-11 rounded border border-[#c98e78] bg-white px-4 text-[14px] font-bold"
              onClick={() => {
                if (auth) setRetryKey((value) => value + 1);
                else window.location.reload();
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}

        <section className="relative mt-5" aria-busy={loading || updating} aria-live="polite">
          {updating ? (
            <div className="mb-2 flex items-center justify-end gap-2 text-[12px] font-semibold text-[#626b79]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating documents
            </div>
          ) : null}

          {loading && !data ? (
            <DocumentSkeleton />
          ) : !data && error ? null : data?.items.length === 0 ? (
            <EmptyState filtered={searchOrFiltersActive} onClear={clearSearchAndFilters} />
          ) : data ? (
            <>
              <DocumentTable documents={data.items} />
              <DocumentCards documents={data.items} />
            </>
          ) : null}
        </section>

        {data && data.items.length > 0 ? (
          <footer className="mt-4 flex flex-col gap-3 border-t border-outline-variant pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[14px] text-[#626b79]">
              <span>Showing {bounds.start.toLocaleString()}–{bounds.end.toLocaleString()} of {data.pagination.total.toLocaleString()} documents</span>
              <label className="sr-only" htmlFor="page-size">Documents per page</label>
              <select
                aria-label="Documents per page"
                className="h-11 rounded border border-outline-variant bg-white px-2 text-[14px]"
                id="page-size"
                onChange={(event) => setControl({ limit: Number(event.target.value) })}
                value={query.limit}
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>
            <div className="flex gap-2">
              <PageButton disabled={query.offset <= 0 || updating} onClick={() => commitQuery({ offset: previousOffset(query.offset, query.limit) })}>
                <ChevronLeft className="h-4 w-4" /> Previous
              </PageButton>
              <PageButton disabled={!data.pagination.has_more || updating} onClick={() => commitQuery({ offset: nextOffset(query.offset, query.limit, data.pagination.total) })}>
                Next <ChevronRight className="h-4 w-4" />
              </PageButton>
            </div>
          </footer>
        ) : null}
      </div>
    </main>
  );
}

function SelectControl({ children, grow = false, label, onChange, value }: {
  children: React.ReactNode;
  grow?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={grow ? "min-w-0 flex-1 sm:min-w-48" : "min-w-0"}>
      <span className="sr-only">{label}</span>
      <select aria-label={label} className="h-11 w-full rounded border border-outline-variant bg-white px-3 text-[14px] text-[#323b45] focus:border-primary" onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </label>
  );
}

function DocumentTable({ documents }: { documents: DocumentLibraryItem[] }) {
  return (
    <div className="hidden overflow-hidden rounded border border-outline-variant bg-white shadow-tonal md:block">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left">
          <thead className="bg-surface-container-low text-[12px] uppercase tracking-wide text-[#626b79]">
            <tr>
              <th className="w-[32%] px-4 py-3 font-bold" scope="col">Document</th>
              <th className="w-[17%] px-4 py-3 font-bold" scope="col">Type</th>
              <th className="w-[22%] px-4 py-3 font-bold" scope="col">Authority / year</th>
              <th className="w-[15%] px-4 py-3 font-bold" scope="col">Size</th>
              <th className="w-[14%] px-4 py-3 font-bold" scope="col">Indexed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {documents.map((document) => (
              <tr className="align-top transition hover:bg-[#fbfcfb]" key={document.id}>
                <td className="px-4 py-4">
                  <p className="break-words text-[14px] font-bold leading-5 text-[#151a18]">{displayTitle(document)}</p>
                  <p className="mt-1 break-all text-[12px] leading-4 text-[#737c88]">{document.filename}</p>
                </td>
                <td className="px-4 py-4"><TypeCell document={document} /></td>
                <td className="px-4 py-4"><AuthorityCell document={document} /></td>
                <td className="px-4 py-4"><SizeCell document={document} /></td>
                <td className="px-4 py-4 text-[13px] text-[#4e5966]">{formatIndexedDate(document.ingested_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentCards({ documents }: { documents: DocumentLibraryItem[] }) {
  return (
    <div className="grid gap-3 md:hidden">
      {documents.map((document) => (
        <article className="rounded border border-outline-variant bg-white p-4 shadow-tonal" key={document.id}>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded bg-[#edf8f1] text-primary"><FileText className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h3 className="break-words text-[15px] font-bold leading-5 text-[#151a18]">{displayTitle(document)}</h3>
              <p className="mt-1 break-all text-[12px] leading-4 text-[#737c88]">{document.filename}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-outline-variant pt-4 text-[13px]">
            <CardDetail label="Type"><TypeCell document={document} /></CardDetail>
            <CardDetail label="Indexed">{formatIndexedDate(document.ingested_at)}</CardDetail>
            <CardDetail label="Authority / year"><AuthorityCell document={document} /></CardDetail>
            <CardDetail label="Size"><SizeCell document={document} /></CardDetail>
          </dl>
        </article>
      ))}
    </div>
  );
}

function TypeCell({ document }: { document: DocumentLibraryItem }) {
  return <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-[#e5eee9] px-2 py-1 text-[11px] font-bold uppercase text-primary">{displayMetadata(document.kind)}</span><span className="text-[13px] text-[#4e5966]">{document.document_type ? titleCase(document.document_type) : "—"}</span></div>;
}

function AuthorityCell({ document }: { document: DocumentLibraryItem }) {
  return <div className="text-[13px] leading-5 text-[#4e5966]"><p>{displayMetadata(document.authority)}</p><p className="text-[12px] text-[#737c88]">{document.years.length ? document.years.join(", ") : "—"}</p></div>;
}

function SizeCell({ document }: { document: DocumentLibraryItem }) {
  return <div className="text-[13px] leading-5 text-[#4e5966]"><p>{document.page_count == null ? "—" : `${document.page_count.toLocaleString()} ${document.page_count === 1 ? "page" : "pages"}`}</p><p className="text-[12px] text-[#737c88]">{document.chunk_count.toLocaleString()} {document.chunk_count === 1 ? "indexed chunk" : "indexed chunks"}</p></div>;
}

function CardDetail({ children, label }: { children: React.ReactNode; label: string }) {
  return <div><dt className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#7b8492]">{label}</dt><dd className="m-0 text-[#4e5966]">{children}</dd></div>;
}

function PageButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return <button className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded border border-outline-variant bg-white px-4 text-[14px] font-bold text-primary hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none" disabled={disabled} onClick={onClick} type="button">{children}</button>;
}

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="rounded border border-dashed border-outline-variant bg-white px-5 py-16 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#edf8f1] text-primary"><FileText className="h-5 w-5" /></span>
      <h2 className="mt-4 text-[17px] font-bold text-[#151a18]">{filtered ? "No documents match your search and filters" : "No indexed documents yet."}</h2>
      {filtered ? <button className="mt-4 h-11 rounded border border-outline-variant bg-white px-4 text-[14px] font-bold text-primary hover:bg-surface-container-low" onClick={onClear} type="button">Clear search and filters</button> : null}
    </div>
  );
}

function DocumentSkeleton() {
  return (
    <div className="overflow-hidden rounded border border-outline-variant bg-white" aria-label="Loading documents" role="status">
      <div className="grid grid-cols-5 gap-4 bg-surface-container-low px-4 py-3">
        {[0, 1, 2, 3, 4].map((item) => <div className="h-3 animate-pulse rounded bg-surface-container-high" key={item} />)}
      </div>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div className="grid grid-cols-5 gap-4 border-t border-outline-variant px-4 py-5" key={row}>
          {[0, 1, 2, 3, 4].map((cell) => <div className={`h-4 animate-pulse rounded bg-surface-container ${cell === 0 ? "w-4/5" : "w-2/3"}`} key={cell} />)}
        </div>
      ))}
      <span className="sr-only">Loading documents</span>
    </div>
  );
}
