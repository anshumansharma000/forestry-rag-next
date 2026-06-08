"use client";

import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
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
  ApiError,
  AuthState,
  AuthUser,
  ChunkPreviewParams,
  ChunkPreview,
  DocumentUpload,
  IngestJob,
  PreviewChunk,
  completeDocumentUploads,
  getChunkPreview,
  getIngestJob,
  presignDocumentUploads,
  startIngest,
  uploadDocuments,
} from "../../lib/api";

const PREVIEW_LIMIT = 50;
const DEFAULT_MAX_CONTENT_CHARS = 1000;
const MAX_CONTENT_CHARS = 5000;

function canManageDocuments(user: AuthUser | null) {
  return user?.role === "admin" || user?.role === "knowledge_manager";
}

function pageRange(source: PreviewChunk) {
  if (source.page_start == null && source.page_end == null) {
    return "No page";
  }
  if (source.page_start == null) {
    return `Page ${source.page_end}`;
  }
  if (source.page_start === source.page_end || source.page_end == null) {
    return `Page ${source.page_start}`;
  }
  return `Pages ${source.page_start}-${source.page_end}`;
}

function previewRange(preview: ChunkPreview | null) {
  if (!preview || preview.chunks_returned === 0) {
    return "No chunks returned";
  }

  const start = preview.offset + 1;
  const end = preview.offset + preview.chunks_returned;
  return `Showing ${start}-${end}`;
}

function normalizeSource(source: string) {
  const value = source.trim();
  return value || undefined;
}

function boundedContentChars(value: number) {
  return Math.min(Math.max(value, 1), MAX_CONTENT_CHARS);
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

type UploadStatus =
  | "queued"
  | "presigning"
  | "uploading"
  | "completing"
  | "done"
  | "failed";

type UploadRow = {
  key: string;
  filename: string;
  status: UploadStatus;
  detail?: string;
};

type UploadQueueItem = UploadRow & {
  file: File;
};

type PreviewParamsResult =
  | { ok: true; params: ChunkPreviewParams }
  | { ok: false; error: string };

function fileKey(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function uploadStatusLabel(status: UploadStatus) {
  switch (status) {
    case "queued":
      return "Queued";
    case "presigning":
      return "Preparing";
    case "uploading":
      return "Uploading";
    case "completing":
      return "Completing";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
  }
}

function isNonR2StorageConfigError(err: unknown) {
  if (!(err instanceof ApiError)) {
    return false;
  }

  const message = err.message.toLowerCase();
  const code = err.code.toLowerCase();
  const referencesBackend = message.includes("document_storage_backend");
  const referencesR2Mismatch =
    message.includes("not r2") || message.includes("must be r2");
  return (
    referencesBackend &&
    referencesR2Mismatch &&
    (code.includes("config") || err.status === 400 || err.status === 422)
  );
}

async function putFileToStorage(upload: DocumentUpload, file: File) {
  const response = await fetch(upload.upload_url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      text ||
        `Storage upload failed for ${file.name}: ${response.status} ${response.statusText}`,
    );
  }
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
  const [previewOffset, setPreviewOffset] = useState(0);
  const [sourceFilter, setSourceFilter] = useState("");
  const [allSources, setAllSources] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [maxContentChars, setMaxContentChars] = useState(
    DEFAULT_MAX_CONTENT_CHARS,
  );
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function getToken() {
    const nextAuth = await ensureFreshAuth(auth);
    setAuth(nextAuth);
    setUser(nextAuth.user);
    return nextAuth.access_token;
  }

  function previewParams(
    overrides: Partial<ChunkPreviewParams> = {},
  ): PreviewParamsResult {
    const includeContent = overrides.include_content ?? showContent;
    const source = normalizeSource(overrides.source ?? sourceFilter);
    const includeAllSources = overrides.all_sources ?? allSources;

    if (source && includeAllSources) {
      return {
        ok: false,
        error: "Choose a source filename or All documents, not both.",
      };
    }

    if (!source && !includeAllSources) {
      return {
        ok: false,
        error: "Select or upload a document before loading chunk preview.",
      };
    }

    return {
      ok: true,
      params: {
        limit: Math.min(overrides.limit ?? PREVIEW_LIMIT, 200),
        offset: Math.max(overrides.offset ?? previewOffset, 0),
        source,
        all_sources: includeAllSources,
        include_content: includeContent,
        max_content_chars: includeContent
          ? boundedContentChars(overrides.max_content_chars ?? maxContentChars)
          : undefined,
      },
    };
  }

  async function loadPreview(
    tokenOverride?: string,
    overrides: Partial<ChunkPreviewParams> = {},
  ) {
    setError(null);
    const nextParams = previewParams(overrides);
    if (!nextParams.ok) {
      setError(nextParams.error);
      return;
    }

    setPreviewing(true);
    try {
      const token = tokenOverride ?? (await getToken());
      const nextPreview = await getChunkPreview(token, nextParams.params);
      setPreview(nextPreview);
      setPreviewOffset(nextPreview.offset);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message.toLowerCase() : "";
      if (message.includes("source") && message.includes("required")) {
        setError("Select or upload a document before loading chunk preview.");
      } else {
        setError(formatApiError(err, "Unable to load chunk preview."));
      }
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

  function selectFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    setSelectedFiles(files);
    setUploadRows(
      files.map((file, index) => ({
        key: fileKey(file, index),
        filename: file.name,
        status: "queued",
      })),
    );
    setNotice(null);
    setError(null);
  }

  function updateUploadRows(
    keys: string[],
    status: UploadStatus,
    detail?: string,
  ) {
    setUploadRows((rows) =>
      rows.map((row) =>
        keys.includes(row.key) ? { ...row, status, detail } : row,
      ),
    );
  }

  async function uploadWithMultipartFallback(token: string, files: File[]) {
    const keys = files.map(fileKey);
    updateUploadRows(keys, "uploading", "Using server upload");
    const response = await uploadDocuments(token, files);
    updateUploadRows(keys, "done", "Uploaded through server");
    return response.files.map((file) => file.filename);
  }

  async function uploadWithDirectR2(token: string, files: File[]) {
    const queueItems: UploadQueueItem[] = files.map((file, index) => ({
      key: fileKey(file, index),
      file,
      filename: file.name,
      status: "queued",
    }));
    const keys = queueItems.map((item) => item.key);

    updateUploadRows(keys, "presigning");
    const { uploads } = await presignDocumentUploads(
      token,
      files.map((file) => ({
        filename: file.name,
        size_bytes: file.size,
        content_type: file.type || "application/octet-stream",
      })),
    );

    const filesByName = new Map<string, UploadQueueItem[]>();
    for (const item of queueItems) {
      filesByName.set(item.filename, [
        ...(filesByName.get(item.filename) ?? []),
        item,
      ]);
    }

    const uploadPairs = uploads.map((upload) => {
      const matches = filesByName.get(upload.filename) ?? [];
      const item = matches.shift();
      filesByName.set(upload.filename, matches);
      if (!item) {
        throw new Error(`Unable to match presigned upload for ${upload.filename}.`);
      }
      return { item, upload };
    });

    await Promise.all(
      uploadPairs.map(async ({ item, upload }) => {
        updateUploadRows([item.key], "uploading");
        try {
          await putFileToStorage(upload, item.file);
        } catch (err) {
          updateUploadRows(
            [item.key],
            "failed",
            formatApiError(err, "Unable to upload document."),
          );
          throw err;
        }
        updateUploadRows([item.key], "completing");
      }),
    );

    await completeDocumentUploads(
      token,
      uploads.map((upload) => ({
        upload_id: upload.upload_id,
        filename: upload.filename,
      })),
    );

    updateUploadRows(keys, "done");
    return uploads.map((upload) => upload.filename);
  }

  async function uploadSelectedFiles() {
    if (selectedFiles.length === 0 || uploading || !canManageDocuments(user)) {
      return;
    }

    const unsupportedFile = selectedFiles.find((file) => {
      const extension = file.name.toLowerCase().split(".").pop();
      return extension !== "pdf" && extension !== "docx" && extension !== "txt";
    });
    if (unsupportedFile) {
      setError("Only .pdf, .docx, and .txt files are supported.");
      return;
    }

    setNotice(null);
    setError(null);
    setUploading(true);
    try {
      const token = await getToken();
      let uploadedFilenames: string[];
      try {
        uploadedFilenames = await uploadWithDirectR2(token, selectedFiles);
      } catch (err) {
        if (!isNonR2StorageConfigError(err)) {
          const selectedKeys = selectedFiles.map(fileKey);
          updateUploadRows(
            selectedKeys,
            "failed",
            formatApiError(err, "Unable to upload document."),
          );
          throw err;
        }

        uploadedFilenames = await uploadWithMultipartFallback(token, selectedFiles);
      }

      const filenames = uploadedFilenames.join(", ");
      const previewFilename = uploadedFilenames[0];
      setNotice(
        `Upload complete: ${filenames}. Run ingest to index these documents before they are searchable.`,
      );
      setSourceFilter(previewFilename);
      setAllSources(false);
      setShowContent(false);
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await loadPreview(token, {
        source: previewFilename,
        all_sources: false,
        offset: 0,
        include_content: false,
      });
    } catch (err) {
      setError(formatApiError(err, "Unable to upload document."));
    } finally {
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

      if (normalizeSource(sourceFilter) || allSources) {
        await loadPreview(token, { offset: 0 });
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to ingest new documents."));
    } finally {
      setIngesting(false);
    }
  }

  function handleSourceChange(value: string) {
    setSourceFilter(value);
    setAllSources(false);
    setShowContent(false);
    setPreviewOffset(0);
    setPreview(null);
  }

  function handleAllSourcesChange(value: boolean) {
    setAllSources(value);
    setShowContent(false);
    setPreviewOffset(0);
    setPreview(null);
    if (value) {
      setSourceFilter("");
    }
  }

  async function applyPreviewControls(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await loadPreview(undefined, {
      offset: 0,
      source: normalizeSource(sourceFilter),
      all_sources: allSources,
      include_content: showContent,
      max_content_chars: showContent ? maxContentChars : undefined,
    });
  }

  async function toggleContent(nextShowContent: boolean) {
    setShowContent(nextShowContent);
    await loadPreview(undefined, {
      offset: preview?.offset ?? previewOffset,
      source: normalizeSource(sourceFilter),
      all_sources: allSources,
      include_content: nextShowContent,
      max_content_chars: nextShowContent ? maxContentChars : undefined,
    });
  }

  async function goToPreviewPage(nextOffset: number) {
    await loadPreview(undefined, {
      offset: Math.max(nextOffset, 0),
      source: normalizeSource(sourceFilter),
      all_sources: allSources,
      include_content: showContent,
      max_content_chars: showContent ? maxContentChars : undefined,
    });
  }

  const canManage = canManageDocuments(user);
  const hasPreviewScope = Boolean(normalizeSource(sourceFilter) || allSources);
  const scopeDirty =
    allSources !== (preview?.all_sources ?? false) ||
    (!allSources &&
      normalizeSource(sourceFilter) !== (preview?.source ?? undefined));
  const canGoBack = Boolean(
    preview && !scopeDirty && preview.offset > 0 && !previewing,
  );
  const canGoForward = Boolean(preview?.has_more && !scopeDirty && !previewing);

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
                  className="inline-flex h-11 items-center justify-center gap-2 rounded border border-outline-variant bg-white px-4 text-[14px] font-semibold text-[#26384d] transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Upload className="h-4 w-4" />
                  Choose documents
                </button>
                {uploadRows.length ? (
                  <div className="rounded border border-outline-variant bg-surface-container-lowest px-3 py-2">
                    <p className="text-[12px] font-semibold uppercase text-[#7b8492]">
                      Files
                    </p>
                    <ul className="mt-2 space-y-1 text-[13px] leading-5 text-[#323b45]">
                      {uploadRows.map((file) => (
                        <li className="min-w-0" key={file.key}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate">{file.filename}</span>
                            <span
                              className={`shrink-0 text-[12px] font-semibold ${
                                file.status === "failed"
                                  ? "text-[#743f2c]"
                                  : file.status === "done"
                                    ? "text-primary"
                                    : "text-[#626b79]"
                              }`}
                            >
                              {uploadStatusLabel(file.status)}
                            </span>
                          </div>
                          {file.detail ? (
                            <p className="truncate text-[12px] text-[#626b79]">
                              {file.detail}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={uploading || selectedFiles.length === 0}
                  onClick={() => void uploadSelectedFiles()}
                  type="button"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? "Uploading..." : "Upload selected"}
                </button>
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded border border-outline-variant bg-white px-4 text-[14px] font-semibold text-[#26384d] transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={ingesting || uploading}
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
                  disabled={previewing || uploading}
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
                <Metric
                  label="Processed"
                  value={preview?.documents_processed ?? "n/a"}
                />
                <Metric
                  label="Chunks seen"
                  value={preview?.chunks_seen ?? "n/a"}
                />
                <Metric
                  label="Page rows"
                  value={preview?.chunks_returned ?? "n/a"}
                />
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

              <form
                className="mt-5 grid gap-3 rounded border border-outline-variant bg-surface-container-lowest p-3"
                onSubmit={(event) => void applyPreviewControls(event)}
              >
                <label className="grid gap-1 text-[13px] font-semibold text-[#26384d]">
                  Source filename
                  <input
                    className="h-10 rounded border border-outline-variant bg-white px-3 text-[14px] font-normal text-[#151a18] outline-none transition focus:border-primary"
                    disabled={allSources}
                    onChange={(event) => handleSourceChange(event.target.value)}
                    placeholder="Exact filename"
                    type="text"
                    value={sourceFilter}
                  />
                </label>

                <label className="inline-flex min-h-10 items-center gap-2 text-[14px] font-semibold text-[#26384d]">
                  <input
                    checked={allSources}
                    className="h-4 w-4 accent-primary"
                    disabled={previewing}
                    onChange={(event) =>
                      handleAllSourcesChange(event.target.checked)
                    }
                    type="checkbox"
                  />
                  All documents
                </label>

                {allSources ? (
                  <div className="flex items-start gap-2 rounded border border-[#f0d8a8] bg-[#fff8e8] px-3 py-2 text-[13px] leading-5 text-[#6b4b13]">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Corpus-wide preview can be slower.</span>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <label className="inline-flex min-h-10 items-center gap-2 text-[14px] font-semibold text-[#26384d]">
                    <input
                      checked={showContent}
                      className="h-4 w-4 accent-primary"
                      disabled={!hasPreviewScope || previewing}
                      onChange={(event) =>
                        void toggleContent(event.target.checked)
                      }
                      type="checkbox"
                    />
                    {showContent ? (
                      <Eye className="h-4 w-4 text-primary" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-[#626b79]" />
                    )}
                    Show content
                  </label>

                  {showContent ? (
                    <label className="grid gap-1 text-[13px] font-semibold text-[#26384d] sm:w-44">
                      Max chars
                      <input
                        className="h-10 rounded border border-outline-variant bg-white px-3 text-[14px] font-normal text-[#151a18] outline-none transition focus:border-primary"
                        max={MAX_CONTENT_CHARS}
                        min={1}
                        onChange={(event) =>
                          setMaxContentChars(
                            boundedContentChars(Number(event.target.value) || 1),
                          )
                        }
                        type="number"
                        value={maxContentChars}
                      />
                    </label>
                  ) : null}

                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded bg-primary px-4 text-[14px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={previewing}
                    type="submit"
                  >
                    {previewing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Apply
                  </button>
                </div>
              </form>

              <div className="mt-4 flex flex-col gap-3 border-b border-outline-variant pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[13px] leading-5 text-[#4e5966]">
                  <p className="font-semibold text-[#26384d]">
                    {previewRange(preview)}
                  </p>
                  <p>
                    Offset {preview?.offset ?? previewOffset} · Limit{" "}
                    {preview?.limit ?? PREVIEW_LIMIT} ·{" "}
                    {preview?.all_sources
                      ? "All documents"
                      : preview?.source || "No document selected"}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2">
                  <button
                    className="inline-flex h-9 items-center justify-center gap-1 rounded border border-outline-variant bg-white px-3 text-[13px] font-semibold text-[#26384d] transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canGoBack}
                    onClick={() =>
                      void goToPreviewPage(
                        (preview?.offset ?? previewOffset) -
                          (preview?.limit ?? PREVIEW_LIMIT),
                      )
                    }
                    type="button"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    className="inline-flex h-9 items-center justify-center gap-1 rounded border border-outline-variant bg-white px-3 text-[13px] font-semibold text-[#26384d] transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canGoForward}
                    onClick={() =>
                      void goToPreviewPage(
                        (preview?.offset ?? previewOffset) +
                          (preview?.limit ?? PREVIEW_LIMIT),
                      )
                    }
                    type="button"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
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
                {preview?.chunks.map((chunk) => (
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
                          {pageRange(chunk)} · Chunk {chunk.chunk_index} ·{" "}
                          {chunk.chunk_type}
                        </p>
                      </div>
                    </div>
                    <dl className="mt-3 grid gap-2 text-[13px] leading-5 text-[#4e5966] sm:grid-cols-2">
                      <div>
                        <dt className="font-semibold text-[#26384d]">Section</dt>
                        <dd className="truncate">
                          {chunk.section_heading || "No section"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#26384d]">Tokens</dt>
                        <dd>{chunk.token_estimate}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#26384d]">
                          Content chars
                        </dt>
                        <dd>{chunk.content_chars}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-[#26384d]">Pages</dt>
                        <dd>{pageRange(chunk)}</dd>
                      </div>
                    </dl>
                    {chunk.content_omitted ? (
                      <div className="mt-3 inline-flex items-center gap-2 rounded border border-dashed border-outline-variant bg-white px-3 py-2 text-[13px] font-semibold text-[#626b79]">
                        <EyeOff className="h-4 w-4" />
                        Content hidden
                      </div>
                    ) : (
                      <div className="mt-3 rounded border border-outline-variant bg-white px-3 py-2">
                        <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#323b45]">
                          {chunk.content || "No content returned."}
                        </p>
                        {chunk.content_truncated ? (
                          <p className="mt-2 inline-flex rounded bg-[#fff5f1] px-2 py-1 text-[12px] font-semibold text-[#743f2c]">
                            Content truncated at{" "}
                            {preview?.max_content_chars ?? maxContentChars} chars
                          </p>
                        ) : null}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </section>
        )}

        <input
          accept=".pdf,.docx,.txt"
          className="hidden"
          disabled={uploading}
          multiple
          onChange={(event) => selectFiles(event.target.files)}
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
