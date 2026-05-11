"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ensureFreshAuth,
  formatApiError,
  loadStoredSession,
} from "../../lib/auth-client";
import {
  API_BASE_URL,
  AuthState,
  AuthUser,
  ChunkPreview,
  IngestJob,
  PreviewChunk,
  getChunkPreview,
  getIngestJob,
  startIngest,
  uploadDocument,
} from "../../lib/api";

function canManageDocuments(user: AuthUser | null) {
  return user?.role === "admin" || user?.role === "knowledge_manager";
}

function pageRange(source: PreviewChunk) {
  if (source.page_start == null && source.page_end == null) {
    return "No page";
  }
  if (source.page_start === source.page_end || source.page_end == null) {
    return `Page ${source.page_start}`;
  }
  return `Pages ${source.page_start}-${source.page_end}`;
}

function formatIngestSummary(job: IngestJob) {
  if (job.status === "failed") {
    return job.error || "Ingest failed.";
  }

  if (job.status === "queued" || job.status === "running") {
    return `Ingest is ${job.status}.`;
  }

  if (!job.result) {
    return "Ingest completed.";
  }

  if (job.result.documents_added === 0) {
    return "No new documents found. Existing indexed documents were left unchanged.";
  }

  return `Indexed ${job.result.documents_added} new document(s), skipped ${job.result.documents_skipped} already indexed document(s), added ${job.result.chunks_added} chunk(s).`;
}

export default function IngestionPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [preview, setPreview] = useState<ChunkPreview | null>(null);
  const [ingestJob, setIngestJob] = useState<IngestJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function getToken() {
    const nextAuth = await ensureFreshAuth(auth);
    setAuth(nextAuth);
    setUser(nextAuth.user);
    return nextAuth.access_token;
  }

  async function loadPreview(tokenOverride?: string) {
    setPreviewing(true);
    try {
      const token = tokenOverride ?? (await getToken());
      setPreview(await getChunkPreview(token));
    } catch (err) {
      setError(formatApiError(err, "Unable to load chunk preview."));
    } finally {
      setPreviewing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const session = await loadStoredSession();
        if (!session) {
          window.location.assign("/login");
          return;
        }

        if (cancelled) {
          return;
        }

        setAuth(session);
        setUser(session.user);

        if (canManageDocuments(session.user)) {
          await loadPreview(session.access_token);
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatApiError(err, "Unable to load ingestion page."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadFile(file: File | null) {
    if (!file || uploading || !canManageDocuments(user)) {
      return;
    }

    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "pdf" && extension !== "docx" && extension !== "txt") {
      setError("Only .pdf, .docx, and .txt files are supported.");
      return;
    }

    setNotice(null);
    setError(null);
    setUploading(true);
    try {
      const token = await getToken();
      await uploadDocument(token, file);
      setNotice("Upload complete. Run ingest to make this document searchable.");
      await loadPreview(token);
    } catch (err) {
      setError(formatApiError(err, "Unable to upload document."));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setUploading(false);
    }
  }

  async function ingestDocuments() {
    if (ingesting || !canManageDocuments(user)) {
      return;
    }

    setNotice(null);
    setError(null);
    setIngesting(true);
    try {
      const token = await getToken();
      const created = await startIngest(token);
      setIngestJob(created.job);

      let current = created.job;
      while (current.status === "queued" || current.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        current = (await getIngestJob(token, current.id)).job;
        setIngestJob(current);
      }

      await loadPreview(token);
    } catch (err) {
      setError(formatApiError(err, "Unable to ingest new documents."));
    } finally {
      setIngesting(false);
    }
  }

  const canManage = canManageDocuments(user);

  return (
    <main className="min-h-screen bg-surface px-5 py-6 text-on-surface sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col justify-between gap-4 border-b border-outline-variant pb-6 sm:flex-row sm:items-end">
          <div>
            <a
              className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#4e5966] hover:text-primary"
              href="/"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to chat
            </a>
            <h1 className="mt-3 text-[30px] font-bold leading-9 text-primary">
              Upload & Ingestion
            </h1>
            <p className="mt-2 text-[14px] text-[#626b79]">
              Upload PDF, DOCX, or TXT sources, run indexing, and inspect the
              chunks that are available to the assistant.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded border border-[#b7d6c4] bg-[#edf8f1] px-3 py-2 text-[13px] font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" />
            {user?.email ?? "Loading"}
          </div>
        </header>

        {error ? <Banner tone="error" message={error} /> : null}
        {notice ? <Banner tone="success" message={notice} /> : null}

        {loading ? (
          <div className="mt-6 flex items-center gap-3 rounded border border-outline-variant bg-white px-4 py-4 shadow-tonal">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-[15px] font-semibold">
              Loading ingestion tools
            </span>
          </div>
        ) : !canManage ? (
          <section className="mt-6 rounded border border-[#f0c4b6] bg-[#fff5f1] p-5 text-[#743f2c]">
            <h2 className="text-[18px] font-bold">Access required</h2>
            <p className="mt-2 text-[14px] leading-5">
              Upload and ingestion require the admin or knowledge_manager role.
            </p>
          </section>
        ) : (
          <section className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded border border-outline-variant bg-white p-5 shadow-tonal">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
                  <Upload className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-bold text-[#151a18]">
                    Source Files
                  </h2>
                  <p className="text-[14px] text-[#626b79]">
                    {API_BASE_URL}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload document
                </button>
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded border border-outline-variant bg-white px-4 text-[14px] font-semibold text-[#26384d] transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={ingesting}
                  onClick={() => void ingestDocuments()}
                  type="button"
                >
                  {ingesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )}
                  Run ingest
                </button>
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded border border-outline-variant bg-white px-4 text-[14px] font-semibold text-[#26384d] transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={previewing}
                  onClick={() => void loadPreview()}
                  type="button"
                >
                  {previewing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh preview
                </button>
              </div>

              <div className="mt-5 grid gap-3 text-[13px] leading-5 text-[#4e5966] sm:grid-cols-2">
                <Metric label="Documents" value={preview?.documents ?? "n/a"} />
                <Metric label="Chunks" value={preview?.chunks.length ?? "n/a"} />
              </div>

              {ingestJob ? (
                <p className="mt-4 rounded bg-[#edf8f1] px-3 py-2 text-[13px] leading-5 text-primary">
                  {formatIngestSummary(ingestJob)}
                </p>
              ) : null}
            </div>

            <section className="rounded border border-outline-variant bg-white p-5 shadow-tonal">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
                  <Search className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-bold text-[#151a18]">
                    Chunk Preview
                  </h2>
                  <p className="text-[14px] text-[#626b79]">
                    First indexed chunks available to retrieval
                  </p>
                </div>
              </div>

              <div className="mt-5 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {previewing ? (
                  <div className="flex items-center gap-3 rounded border border-outline-variant bg-surface-container-lowest p-4 text-[#626b79]">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-[14px] font-semibold">
                      Loading chunks
                    </span>
                  </div>
                ) : null}
                {!previewing && !preview?.chunks.length ? (
                  <p className="rounded border border-dashed border-outline-variant p-4 text-[14px] leading-5 text-[#626b79]">
                    No chunks available yet. Upload documents and run ingest.
                  </p>
                ) : null}
                {preview?.chunks.slice(0, 20).map((chunk) => (
                  <article
                    className="rounded border border-outline-variant/70 bg-surface-container-lowest p-4"
                    key={`${chunk.source}-${chunk.chunk_index}`}
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold text-primary">
                          {chunk.source}
                        </p>
                        <p className="mt-1 text-[12px] font-semibold uppercase text-[#7b8492]">
                          {pageRange(chunk)} · Chunk {chunk.chunk_index}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-4 text-[14px] leading-6 text-[#323b45]">
                      {chunk.content || "No excerpt available."}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </section>
        )}

        <input
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={(event) => void uploadFile(event.target.files?.[0] ?? null)}
          ref={fileInputRef}
          type="file"
        />
      </div>
    </main>
  );
}

function Banner({ message, tone }: { message: string; tone: "error" | "success" }) {
  const error = tone === "error";
  return (
    <div
      className={`mt-5 flex items-start gap-3 rounded border px-4 py-3 ${
        error
          ? "border-[#f0c4b6] bg-[#fff5f1] text-[#743f2c]"
          : "border-[#b7d6c4] bg-[#edf8f1] text-primary"
      }`}
    >
      {error ? (
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
      )}
      <p className="text-[14px] leading-5">{message}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded bg-surface-container-low px-3 py-2">
      <p className="text-[12px] font-semibold uppercase text-[#7b8492]">
        {label}
      </p>
      <p className="mt-1 truncate text-[16px] font-bold text-[#151a18]">
        {value}
      </p>
    </div>
  );
}
