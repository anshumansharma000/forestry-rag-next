"use client";

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SidebarPageShell } from "../../components/app-sidebar";
import { useDocumentCategories } from "../../components/categorization-fields";
import { DocumentMetadataReview } from "../../components/document-metadata-review";
import { categoryLabel, DocumentCategory } from "../../lib/document-categorization";
import { ensureFreshAuth, formatApiError, loadStoredSession } from "../../lib/auth-client";
import {
  AuthState,
  DocumentLibraryItem,
  DocumentLibraryResponse,
  getIngestJob,
  listDocuments,
  startIngest,
} from "../../lib/api";
import {
  DEFAULT_DOCUMENT_QUERY,
  DocumentLibraryQuery,
  buildDocumentQuery,
  displayMetadata,
  displayTitle,
  nextOffset,
  pageBounds,
  parseDocumentQuery,
  previousOffset,
} from "../../lib/document-library";
import {
  canIngestDocuments,
  DocumentRetryProcessor,
  RetryUpdate,
} from "../../lib/document-retry";
import { DocumentStatus } from "./document-status";
import { LegalReview } from "./legal-review";
import {
  AnnotatedDocument, canReviewLegalMetadata, filterLegalPage, InstrumentType,
  instrumentTypes, LegalProfile, LegalReviewStatus, listLegalProfiles, joinLegalProfiles,
} from "../../lib/legal";

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
  const [retryStates, setRetryStates] = useState<Record<string, RetryUpdate>>({});
  const [legalProfiles, setLegalProfiles] = useState<Record<string, LegalProfile>>({});
  const [legalNamespace, setLegalNamespace] = useState<string | null>(null);
  const [legalError, setLegalError] = useState<string | null>(null);
  const [legalAnnotationsReady, setLegalAnnotationsReady] = useState(false);
  const [instrumentFilter, setInstrumentFilter] = useState<InstrumentType | "">("");
  const [reviewFilter, setReviewFilter] = useState<LegalReviewStatus | "" | "needs_review">("");
  const [legalDocument, setLegalDocument] = useState<DocumentLibraryItem | null>(null);
  const [metadataDocument, setMetadataDocument] = useState<DocumentLibraryItem | null>(null);
  const categoryCatalog = useDocumentCategories(auth?.access_token);
  const authRef = useRef<AuthState | null>(null);
  const dataRef = useRef<DocumentLibraryResponse | null>(null);
  const retryProcessorRef = useRef<DocumentRetryProcessor | null>(null);

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

  const getMetadataToken = useCallback(async () => {
    const nextAuth = await ensureFreshAuth(authRef.current);
    authRef.current = nextAuth;
    setAuth(nextAuth);
    return nextAuth.access_token;
  }, []);

  useEffect(() => {
    if (categoryCatalog.status === "unavailable" && query.category) commitQuery({ category: undefined, offset: 0 }, true);
  }, [categoryCatalog.status, commitQuery, query.category]);

  useEffect(() => () => retryProcessorRef.current?.stop(), []);

  useEffect(() => {
    if (!auth || !canReviewLegalMetadata(auth.user.role)) return;
    const controller = new AbortController(); let active = true;
    void (async () => {
      try {
        const nextAuth = await ensureFreshAuth(authRef.current ?? auth); if (!active) return;
        authRef.current = nextAuth; setAuth(nextAuth);
        const response = await listLegalProfiles(nextAuth.access_token, controller.signal); if (!active) return;
        setLegalProfiles(response.profiles ?? {}); setLegalNamespace(response.namespace); setLegalError(null); setLegalAnnotationsReady(true);
      } catch (err) {
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return;
        setLegalAnnotationsReady(false); setLegalError(formatApiError(err, "Legal annotations are unavailable. The document library is still usable."));
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [auth?.user.id, auth?.user.role, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const response = await listDocuments(nextAuth.access_token, { ...query, category: categoryCatalog.status === "available" ? query.category : undefined }, controller.signal);
        if (!active) return;

        if (response.items.length === 0 && response.pagination.total > 0 && query.offset > 0) {
          const lastOffset = Math.floor((response.pagination.total - 1) / query.limit) * query.limit;
          commitQuery({ offset: lastOffset }, true);
          return;
        }
        dataRef.current = response;
        setData(response);
        setRetryStates((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([source]) =>
              retryProcessorRef.current?.isActive(source),
            ),
          ),
        );
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
  }, [auth, categoryCatalog.status, commitQuery, query, retryKey]);

  const setControl = (update: Partial<DocumentLibraryQuery>) =>
    commitQuery({ ...update, offset: 0 });

  const setStatus = (status: DocumentLibraryQuery["status"]) => {
    dataRef.current = null;
    setData(null);
    setControl({ status });
  };

  const retryDocument = (document: DocumentLibraryItem) => {
    if (!canIngestDocuments(authRef.current?.user.role) || !document.retryable) return;

    if (!retryProcessorRef.current) {
      retryProcessorRef.current = new DocumentRetryProcessor({
        startIngest: async (source) => {
          const nextAuth = await ensureFreshAuth(authRef.current);
          authRef.current = nextAuth;
          setAuth(nextAuth);
          return (await startIngest(nextAuth.access_token, source)).job;
        },
        getJob: async (jobId) => {
          const nextAuth = await ensureFreshAuth(authRef.current);
          authRef.current = nextAuth;
          setAuth(nextAuth);
          return (await getIngestJob(nextAuth.access_token, jobId)).job;
        },
        onUpdate: (source, update) => {
          setRetryStates((current) => ({ ...current, [source]: update }));
        },
        onFinished: () => setRetryKey((value) => value + 1),
        onSubmissionError: (source, retryError) => {
          setRetryStates((current) => ({
            ...current,
            [source]: {
              status: "failed",
              error: formatApiError(retryError, "Unable to retry document processing."),
            },
          }));
        },
      });
    }

    void retryProcessorRef.current.retry(document.filename);
  };

  const clearFilters = () =>
    {
      setYearInput("");
      setControl({ kind: undefined, document_type: undefined, category: undefined, year: undefined });
    };

  const clearSearchAndFilters = () => {
    setSearchInput("");
    setYearInput("");
    commitQuery((current) => ({
      ...current,
      search: "",
      kind: undefined,
      document_type: undefined,
      category: undefined,
      year: undefined,
      offset: 0,
    }));
  };

  const filtersActive = Boolean(query.kind || query.document_type || query.category || query.year);
  const searchOrFiltersActive = Boolean(query.search || filtersActive);
  const bounds = pageBounds(
    data?.pagination.offset ?? query.offset,
    data?.items.length ?? 0,
    data?.pagination.total ?? 0,
  );
  const legalAdmin = canReviewLegalMetadata(auth?.user.role);
  const annotatedDocuments = data ? joinLegalProfiles(data.items, legalProfiles) : [];
  const visibleDocuments = legalAdmin && legalAnnotationsReady ? filterLegalPage(annotatedDocuments, instrumentFilter, reviewFilter) : annotatedDocuments;

  return (
    <SidebarPageShell activePath="/documents" user={auth?.user ?? null}>
    <main className="document-workspace min-h-[calc(100vh-72px)] bg-surface px-4 py-5 text-on-surface sm:px-8 sm:py-7">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-6 text-[#626b79]">Find department sources, review metadata, and check readiness for chat.</p>
          {auth && canIngestDocuments(auth.user.role) ? <a className="primary-button" href="/ingestion">Upload documents</a> : null}
        </div>

        <section className="mt-6" aria-labelledby="library-controls">
          <h2 className="sr-only" id="library-controls">Document library controls</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6b7480]" />
            <input
              aria-label="Search documents by title or filename"
              className="h-14 w-full rounded border border-outline-variant bg-white pl-12 pr-12 text-[16px] shadow-sm placeholder:text-[#7b8492] focus:border-primary"
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
            <div className="flex flex-wrap items-start gap-3">
              <SelectControl label="Processing status" value={query.status} onChange={(value) => setStatus(value as DocumentLibraryQuery["status"])}>
                <option value="indexed">Ready for chat</option>
                <option value="failed">Processing failed</option>
              </SelectControl>

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
                <option value="updated_at:desc">Newest processed</option>
                <option value="updated_at:asc">Oldest processed</option>
                <option value="title:asc">Title A–Z</option>
                <option value="title:desc">Title Z–A</option>
              </SelectControl>
            </div>
          </div>
          <div className="mt-3">
            <details className="relative rounded-xl border border-outline-variant/70 bg-white p-3">
              <summary className="cursor-pointer text-sm font-medium text-primary">Filters{filtersActive ? " · Active" : ""}</summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SelectControl label="File type" value={query.kind ?? ""} onChange={(value) => setControl({ kind: (value || undefined) as DocumentLibraryQuery["kind"] })}>
                <option value="">All file types</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
                <option value="txt">TXT</option>
                <option value="ppt">PPT</option>
                <option value="pptx">PPTX</option>
              </SelectControl>
              <SelectControl label="Document type" value={query.document_type ?? ""} onChange={(value) => setControl({ document_type: value || undefined })}>
                <option value="">All document types</option>
                {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
              </SelectControl>
              <SelectControl label="Category" value={query.category ?? ""} disabled={categoryCatalog.status !== "available"}
                onChange={value => setControl({ category: (value || undefined) as DocumentCategory | undefined })}>
                <option value="">All categories</option>
                {categoryCatalog.categories.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
              </SelectControl>
              <label className="sr-only" htmlFor="document-year">Year</label>
              <input
                aria-label="Filter by four-digit year"
                className="h-11 min-w-0 rounded-lg border border-outline-variant/70 bg-white px-3 text-[14px] text-[#323b45] focus:border-primary lg:w-32"
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
            </details>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Document results and active filters">
          <span className="mr-2 text-[#626b79]" aria-live="polite">{data ? `${data.pagination.total.toLocaleString()} documents` : "Loading documents…"}</span>
          {query.search ? <button className="filter-chip" onClick={() => setSearchInput("")} aria-label="Remove search filter">Search: {query.search}<X className="h-3.5 w-3.5" /></button> : null}
          {(["kind", "document_type", "category", "year"] as const).map(key => query[key] ? <button key={key} className="filter-chip" aria-label={`Remove ${key.replaceAll("_", " ")} filter`} onClick={() => { if (key === "year") setYearInput(""); setControl({ [key]: undefined }); }}>{key === "category" ? categoryLabel(query.category!, categoryCatalog.categories) : key === "kind" ? query.kind?.toUpperCase() : key === "document_type" ? titleCase(query.document_type!) : query.year}<X className="h-3.5 w-3.5" /></button> : null)}
        </div>

        {categoryCatalog.status === "unavailable" ? <p className="mt-3 text-sm text-[#626b79]" role="status">
          Category editing is temporarily unavailable. You can continue using the document library.
          <button className="ml-2 min-h-11 font-semibold text-primary underline" type="button" onClick={categoryCatalog.retry}>Try again</button>
        </p> : null}

        {legalAdmin ? <details className="mt-4 rounded-xl border border-outline-variant/70 bg-white p-4" aria-label="Legal review filters">
          <summary className="cursor-pointer text-sm font-medium text-primary">Legal metadata review <span className="ml-2 text-xs font-normal text-[#626b79]">Filters this page only{instrumentFilter || reviewFilter ? " · Active" : ""}</span></summary>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="mt-1 text-xs text-[#626b79]">Registry namespace: <strong>{legalNamespace ?? "Unavailable"}</strong>. Legal filters apply only to the {data?.items.length ?? 0} documents loaded on this page.</p></div>{legalAnnotationsReady ? <div className="flex flex-wrap gap-2"><SelectControl label="Instrument type" value={instrumentFilter} onChange={value => setInstrumentFilter(value as InstrumentType | "")}><option value="">All instruments</option>{instrumentTypes.map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</SelectControl><SelectControl label="Review status" value={reviewFilter} onChange={value => setReviewFilter(value as typeof reviewFilter)}><option value="">All review states</option><option value="needs_review">Unreviewed (includes no profile)</option><option value="no_profile">No profile</option><option value="unreviewed">Unreviewed profile</option><option value="reviewed">Reviewed</option></SelectControl><button className="secondary-button" onClick={() => { setInstrumentFilter("unknown"); setReviewFilter(""); }}>Unknown classification</button></div> : null}</div>
          {legalError ? <p className="mt-3 text-sm text-[#8d3f27]" role="status">{legalError}</p> : null}
        </details> : null}

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
            <EmptyState filtered={searchOrFiltersActive} onClear={clearSearchAndFilters} status={query.status} />
          ) : visibleDocuments.length === 0 ? (
            <div className="rounded border border-dashed border-outline-variant bg-white p-8 text-center"><h2 className="font-bold">No documents on this page match the legal filters</h2><p className="mt-2 text-sm text-[#626b79]">Clear the page-scoped legal filters or move to another document page.</p></div>
          ) : data ? (
            <>
              <DocumentTable canRetry={canIngestDocuments(auth?.user.role)} documents={visibleDocuments} legalAdmin={legalAdmin} legalReady={legalAnnotationsReady} onLegalReview={setLegalDocument} onMetadataReview={canIngestDocuments(auth?.user.role) && categoryCatalog.status === "available" ? setMetadataDocument : undefined} onRetry={retryDocument} retryStates={retryStates} />
              <DocumentCards canRetry={canIngestDocuments(auth?.user.role)} documents={visibleDocuments} legalAdmin={legalAdmin} legalReady={legalAnnotationsReady} onLegalReview={setLegalDocument} onMetadataReview={canIngestDocuments(auth?.user.role) && categoryCatalog.status === "available" ? setMetadataDocument : undefined} onRetry={retryDocument} retryStates={retryStates} />
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
      {metadataDocument && auth ? <DocumentMetadataReview key={metadataDocument.id} document={metadataDocument}
        categories={categoryCatalog.categories} getToken={getMetadataToken} onClose={() => setMetadataDocument(null)}
        onSaved={categorization => {
          setData(current => {
            if (!current) return current;
            const updated = { ...current, items: current.items.map(item => item.id === metadataDocument.id ? { ...item, categorization } : item) };
            dataRef.current = updated;
            return updated;
          });
          setRetryKey(value => value + 1);
        }} /> : null}
      {legalAdmin && legalDocument && auth ? <LegalReview key={legalDocument.id} document={legalDocument} documents={data?.items ?? []} profile={legalProfiles[legalDocument.id] ?? null} profiles={legalProfiles} token={auth.access_token} onClose={() => setLegalDocument(null)} onOpenOwner={setLegalDocument} onSaved={saved => setLegalProfiles(current => ({ ...current, [legalDocument.id]: saved }))} /> : null}
    </main>
    </SidebarPageShell>
  );
}

function SelectControl({ children, disabled = false, grow = false, label, onChange, value }: {
  disabled?: boolean;
  children: React.ReactNode;
  grow?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className={grow ? "min-w-0 flex-1 sm:min-w-48" : "min-w-0"}>
      <span className="sr-only">{label}</span>
      <select disabled={disabled} aria-label={label} className="h-11 w-full rounded-lg border border-outline-variant/70 bg-white px-3 text-[14px] text-[#323b45] focus:border-primary" onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </label>
  );
}

function DocumentTable({ canRetry, documents, legalAdmin, legalReady, onLegalReview, onMetadataReview, onRetry, retryStates }: {
  canRetry: boolean;
  documents: AnnotatedDocument[];
  legalAdmin: boolean;
  legalReady: boolean;
  onLegalReview: (document: DocumentLibraryItem) => void;
  onMetadataReview?: (document: DocumentLibraryItem) => void;
  onRetry: (document: DocumentLibraryItem) => void;
  retryStates: Record<string, RetryUpdate>;
}) {
  return (
    <div className="hidden overflow-hidden rounded border border-outline-variant bg-white shadow-sm md:block">
      <div className="overflow-x-auto">
        <table className={`w-full table-fixed border-collapse text-left ${legalAdmin ? "min-w-[1120px]" : "min-w-[940px]"}`}>
          <thead className="bg-surface-container-low text-[12px] uppercase tracking-wide text-[#626b79]">
            <tr>
              <th className="w-[300px] px-4 py-3 font-bold" scope="col">Document</th>
              <th className="w-[140px] px-4 py-3 font-bold" scope="col">Type</th>
              <th className="w-[160px] px-4 py-3 font-bold" scope="col">Authority / year</th>
              <th className="w-[120px] px-4 py-3 font-bold" scope="col">Content</th>
              <th className="w-[170px] px-4 py-3 font-bold" scope="col">Status</th>
              {legalAdmin ? <th className="w-[200px] px-4 py-3 font-bold" scope="col">Legal review</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {documents.map((document) => (
              <tr className="align-top transition hover:bg-[#fbfcfb]" key={document.id}>
                <td className="px-4 py-4">
                  <p className="break-words text-[14px] font-bold leading-5 text-[#151a18]">{displayTitle(document)}</p>
                  <p className="mt-1 break-all text-[12px] leading-4 text-[#737c88]">{document.filename}</p>
                </td>
                <td className="px-4 py-4"><TypeCell document={document} onMetadataReview={onMetadataReview} /></td>
                <td className="px-4 py-4"><AuthorityCell document={document} /></td>
                <td className="px-4 py-4"><SizeCell document={document} /></td>
                <td className="px-4 py-4"><DocumentStatus document={document} canRetry={canRetry} onRetry={onRetry} retryState={retryStates[document.filename]} /></td>
                {legalAdmin ? <td className="px-4 py-4"><LegalCell document={document} ready={legalReady} onReview={() => onLegalReview(document)} /></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentCards({ canRetry, documents, legalAdmin, legalReady, onLegalReview, onMetadataReview, onRetry, retryStates }: {
  canRetry: boolean;
  documents: AnnotatedDocument[];
  legalAdmin: boolean;
  legalReady: boolean;
  onLegalReview: (document: DocumentLibraryItem) => void;
  onMetadataReview?: (document: DocumentLibraryItem) => void;
  onRetry: (document: DocumentLibraryItem) => void;
  retryStates: Record<string, RetryUpdate>;
}) {
  return (
    <div className="grid gap-3 md:hidden">
      {documents.map((document) => (
        <article className="rounded-xl border border-outline-variant/60 bg-white p-4 shadow-sm" key={document.id}>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded bg-[#edf8f1] text-primary"><FileText className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h3 className="break-words text-[15px] font-bold leading-5 text-[#151a18]">{displayTitle(document)}</h3>
              <p className="mt-1 break-all text-[12px] leading-4 text-[#737c88]">{document.filename}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-outline-variant pt-4 text-[13px]">
            <CardDetail label="Type"><TypeCell document={document} onMetadataReview={onMetadataReview} /></CardDetail>
            <CardDetail label="Status"><DocumentStatus document={document} canRetry={canRetry} onRetry={onRetry} retryState={retryStates[document.filename]} /></CardDetail>
            <CardDetail label="Authority / year"><AuthorityCell document={document} /></CardDetail>
            <CardDetail label="Content"><SizeCell document={document} /></CardDetail>
            {legalAdmin ? <CardDetail label="Legal review"><LegalCell document={document} ready={legalReady} onReview={() => onLegalReview(document)} /></CardDetail> : null}
          </dl>
        </article>
      ))}
    </div>
  );
}

function TypeCell({ document, onMetadataReview }: { document: DocumentLibraryItem; onMetadataReview?: (document: DocumentLibraryItem) => void }) {
  const category = document.categorization?.values.document_type;
  return <div>
    <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-[#e5eee9] px-2 py-1 text-[11px] font-bold uppercase text-primary">{displayMetadata(document.kind)}</span>
      <span className="text-[13px] text-[#4e5966]">{category ? categoryLabel(category) : document.document_type ? titleCase(document.document_type) : "Uncategorized"}</span>
    </div>
    {onMetadataReview ? <button className="mt-1 min-h-11 text-left text-xs font-semibold text-primary underline" type="button" onClick={() => onMetadataReview(document)}>
      {document.categorization?.review_required ? "Review metadata" : category ? "Edit metadata" : "Add category"}
    </button> : null}
  </div>;
}

function AuthorityCell({ document }: { document: DocumentLibraryItem }) {
  const values = document.categorization?.values;
  const authority = values && "issuing_authority" in values ? values.issuing_authority : document.authority;
  return <div className="text-[13px] leading-5 text-[#4e5966]"><p>{displayMetadata(authority)}</p>
    <p className="text-[12px] text-[#737c88]">{values?.issued_date ? `Issued ${values.issued_date}` : document.years.length ? document.years.join(", ") : "—"}</p>
    {values?.state || values?.jurisdiction ? <p className="mt-1 text-xs text-[#737c88]">{[values.state, values.jurisdiction].filter(Boolean).join(" · ")}</p> : null}
  </div>;
}

function SizeCell({ document }: { document: DocumentLibraryItem }) {
  return <div className="text-[13px] leading-5 text-[#4e5966]"><p>{document.page_count == null ? "Page number unavailable" : `${document.page_count.toLocaleString()} ${document.page_count === 1 ? "page" : "pages"}`}</p><p className="text-[12px] text-[#737c88]">{document.chunk_count.toLocaleString()} searchable {document.chunk_count === 1 ? "excerpt" : "excerpts"}</p></div>;
}

function LegalCell({ document, onReview, ready }: { document: AnnotatedDocument; onReview: () => void; ready: boolean }) {
  if (!ready) return <span className="text-[12px] text-[#626b79]">Annotations unavailable</span>;
  const status = document.legalStatus === "no_profile" ? "No profile" : document.legalStatus === "reviewed" ? "Reviewed" : "Unreviewed";
  return <div className="text-[12px]"><p className="font-bold text-[#414844]">{document.legalProfile?.instrument_type === "unknown" ? "Unknown" : document.legalProfile ? titleCase(document.legalProfile.instrument_type) : "—"}</p><p className="mt-1 text-[#626b79]">{status} · {document.legalProfile?.relationships.length ?? 0} relationships</p><button className="mt-2 min-h-11 font-bold text-primary underline" onClick={onReview}>Open legal review</button></div>;
}

function CardDetail({ children, label }: { children: React.ReactNode; label: string }) {
  return <div><dt className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[#7b8492]">{label}</dt><dd className="m-0 text-[#4e5966]">{children}</dd></div>;
}

function PageButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return <button className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded border border-outline-variant bg-white px-4 text-[14px] font-bold text-primary hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none" disabled={disabled} onClick={onClick} type="button">{children}</button>;
}

function EmptyState({ filtered, onClear, status }: { filtered: boolean; onClear: () => void; status: DocumentLibraryQuery["status"] }) {
  return (
    <div className="rounded border border-dashed border-outline-variant bg-white px-5 py-16 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#edf8f1] text-primary"><FileText className="h-5 w-5" /></span>
      <h2 className="mt-4 text-[17px] font-bold text-[#151a18]">{status === "failed" ? "No processing failures" : filtered ? "No documents match your search and filters" : "No documents are ready for chat yet."}</h2>
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
