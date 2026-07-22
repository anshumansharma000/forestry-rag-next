"use client";

import {
  AlertCircle,
  ArrowLeft,
  Bell,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
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
  IngestJob,
  PresignedUpload,
  PreviewChunk,
  completeDocumentUploads,
  getChunkPreview,
  getIngestJob,
  presignDocumentUploads,
  startIngest,
} from "../../lib/api";
import {
  DocumentFlowStatus,
  isSupportedDocumentFilename,
  processDocumentUploads,
  summarizeUploadBatch,
  UploadFlowUpdate,
} from "../../lib/document-upload-flow";
import {
  IngestJobPoller,
  readActiveJobs,
  writeActiveJobs,
} from "../../lib/ingestion-polling";

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

type UploadStatus = DocumentFlowStatus | "processing" | "indexed";

type UploadRow = {
  key: string;
  filename: string;
  size: number | null;
  status: UploadStatus;
  progress: number;
  detail?: string;
  completedFilename?: string;
  jobId?: string;
  chunks?: number;
  failureStage?: "upload" | "completion" | "ingestion";
  jobProgress?: number;
  etaSeconds?: number;
  jobStartedAt?: string | null;
  lastCheckedAt?: string;
};

type ActivityUpdate = {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
  createdAt: string;
};

type PreviewParamsResult =
  | { ok: true; params: ChunkPreviewParams }
  | { ok: false; error: string };

function fileKey(file: File, index: number) {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function uploadStatusLabel(status: UploadStatus) {
  switch (status) {
    case "selected":
      return "Selected";
    case "requesting_upload":
      return "Preparing";
    case "uploading":
      return "Uploading";
    case "finalizing":
      return "Finalizing";
    case "queued":
      return "Queued";
    case "processing":
      return "Processing";
    case "indexed":
      return "Indexed";
    case "failed":
      return "Failed";
  }
}

function formatFileSize(bytes: number | null) {
  if (bytes == null) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function numericMetadata(job: IngestJob, keys: string[]) {
  for (const key of keys) {
    const value = job.metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function jobProgress(job: IngestJob) {
  const value = numericMetadata(job, ["progress_percent", "progress"]);
  if (value == null) return undefined;
  const percentage = value <= 1 ? value * 100 : value;
  return Math.round(Math.min(100, Math.max(0, percentage)));
}

function jobEtaSeconds(job: IngestJob) {
  const value = numericMetadata(job, [
    "eta_seconds",
    "estimated_remaining_seconds",
  ]);
  return value == null ? undefined : Math.max(0, Math.round(value));
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function activityMessage(filename: string, job: IngestJob) {
  switch (job.status) {
    case "queued":
      return `${filename} is queued for ingestion.`;
    case "running":
      return `${filename} ingestion is now processing.`;
    case "succeeded":
      return `${filename} was indexed successfully.`;
    case "failed":
      return `${filename} failed: ${job.error || "Ingestion failed."}`;
  }
}

function flowActivityMessage(filename: string, status: DocumentFlowStatus) {
  switch (status) {
    case "selected":
      return `${filename} is ready to upload.`;
    case "requesting_upload":
      return `Preparing a secure upload for ${filename}.`;
    case "uploading":
      return `${filename} is uploading.`;
    case "finalizing":
      return `${filename} uploaded; finalizing storage.`;
    case "queued":
      return `${filename} is queued for ingestion.`;
    case "failed":
      return `${filename} could not continue.`;
  }
}

function isStoredDocumentMissing(message?: string) {
  const normalized = message?.toLowerCase() ?? "";
  return (
    normalized.includes("not found") ||
    normalized.includes("missing from storage") ||
    normalized.includes("stored document was not found")
  );
}

function putFileToStorage(
  upload: PresignedUpload,
  file: File,
  onProgress: (percentage: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", upload.upload_url);
    request.withCredentials = false;
    Object.entries(upload.headers).forEach(([name, value]) =>
      request.setRequestHeader(name, value),
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onerror = () => reject(new Error(`Storage upload failed for ${file.name}.`));
    request.onabort = () => reject(new Error(`Storage upload was cancelled for ${file.name}.`));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(
          new Error(
            request.responseText ||
              `Storage upload failed for ${file.name}: ${request.status}.`,
          ),
        );
      }
    };
    request.send(file);
  });
}

export default function IngestionPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [preview, setPreview] = useState<ChunkPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
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
  const [activityUpdates, setActivityUpdates] = useState<ActivityUpdate[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const authRef = useRef<AuthState | null>(null);
  const pollerRef = useRef<IngestJobPoller | null>(null);
  const announcedUpdatesRef = useRef(new Set<string>());
  const lastBatchSummaryRef = useRef<string | null>(null);

  function addActivityUpdate(update: ActivityUpdate) {
    if (announcedUpdatesRef.current.has(update.id)) return;
    announcedUpdatesRef.current.add(update.id);
    setActivityUpdates((updates) => [update, ...updates].slice(0, 6));
  }

  async function getToken() {
    const nextAuth = await ensureFreshAuth(authRef.current ?? auth);
    authRef.current = nextAuth;
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
        authRef.current = session;
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

  useEffect(() => {
    const hasActiveJob = uploadRows.some(
      (row) => row.status === "queued" || row.status === "processing",
    );
    if (!hasActiveJob) return;
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [uploadRows]);

  useEffect(() => {
    const summary = summarizeUploadBatch(uploadRows);
    if (!summary) {
      lastBatchSummaryRef.current = null;
      return;
    }
    if (lastBatchSummaryRef.current === summary.message) return;
    lastBatchSummaryRef.current = summary.message;

    if (summary.tone === "success") {
      setError(null);
      setNotice(summary.message);
    } else {
      setNotice(null);
      setError(summary.message);
    }
  }, [uploadRows]);

  useEffect(() => {
    if (!user) return;

    const poller = new IngestJobPoller(
      async (jobId) => {
        const token = await getToken();
        return (await getIngestJob(token, jobId)).job;
      },
      (filename, job) => {
        const checkedAt = new Date().toISOString();
        setUploadRows((rows) =>
          rows.map((row) =>
            row.jobId === job.id
              ? {
                  ...row,
                  status:
                    job.status === "running"
                      ? "processing"
                      : job.status === "succeeded"
                        ? "indexed"
                        : job.status,
                  detail: job.status === "failed" ? job.error || "Ingestion failed." : undefined,
                  chunks: job.status === "succeeded" ? job.result?.chunks_added ?? job.result?.chunks : undefined,
                  failureStage: job.status === "failed" ? "ingestion" : undefined,
                  jobProgress: jobProgress(job),
                  etaSeconds: jobEtaSeconds(job),
                  jobStartedAt: job.started_at,
                  lastCheckedAt: checkedAt,
                }
              : row,
          ),
        );

        addActivityUpdate({
          id: `${job.id}:${job.status}`,
          message: activityMessage(filename, job),
          tone:
            job.status === "failed"
              ? "error"
              : job.status === "succeeded"
                ? "success"
                : "info",
          createdAt: checkedAt,
        });

        if (job.status === "succeeded" || job.status === "failed") {
          const remaining = readActiveJobs(user.id).filter(
            (active) => active.jobId !== job.id,
          );
          writeActiveJobs(user.id, remaining);
        }
        if (job.status === "succeeded") {
          setSourceFilter(filename);
          setAllSources(false);
        }
      },
      (filename, jobId, pollingError) => {
        const message = formatApiError(
          pollingError,
          "Unable to refresh ingestion status.",
        );
        setUploadRows((rows) =>
          rows.map((row) =>
            row.completedFilename === filename &&
            (row.status === "queued" || row.status === "processing")
              ? {
                  ...row,
                  detail: `${message} Retrying automatically.`,
                }
              : row,
          ),
        );
        addActivityUpdate({
          id: `${jobId}:polling-error`,
          message: `${filename}: ${message} Status checks will retry automatically.`,
          tone: "error",
          createdAt: new Date().toISOString(),
        });
      },
    );
    pollerRef.current = poller;

    const activeJobs = readActiveJobs(user.id);
    if (activeJobs.length) {
      setUploadRows((rows) => {
        const knownIds = new Set(rows.map((row) => row.jobId));
        return [
          ...rows,
          ...activeJobs
            .filter(({ jobId }) => !knownIds.has(jobId))
            .map(({ filename, jobId }) => ({
              key: `resumed-${jobId}`,
              filename,
              completedFilename: filename,
              jobId,
              size: null,
              progress: 100,
              status: "queued" as const,
              detail: "Resuming status checks",
            })),
        ];
      });
      activeJobs.forEach((active) => poller.start(active, true));
    }

    return () => {
      poller.stopAll();
      if (pollerRef.current === poller) pollerRef.current = null;
    };
    // Polling is deliberately scoped to the authenticated user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function selectFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    setSelectedFiles(files);
    setUploadRows(
      files.map((file, index) => ({
        key: fileKey(file, index),
        filename: file.name,
        size: file.size,
        status: "selected",
        progress: 0,
      })),
    );
    setNotice(null);
    setError(null);
    lastBatchSummaryRef.current = null;
  }

  function updateUploadRow(
    key: string,
    update: Omit<UploadFlowUpdate, "status"> & {
      status?: UploadStatus;
      jobId?: string;
    },
  ) {
    setUploadRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...update } : row)),
    );
  }

  function registerJob(key: string, filename: string, job: IngestJob) {
    updateUploadRow(key, {
      status:
        job.status === "running"
          ? "processing"
          : job.status === "succeeded"
            ? "indexed"
            : job.status,
      completedFilename: filename,
      job,
    });
    setUploadRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, jobId: job.id } : row)),
    );
    const terminal = job.status === "succeeded" || job.status === "failed";
    if (user && !terminal) {
      const active = readActiveJobs(user.id).filter(
        ({ jobId }) => jobId !== job.id,
      );
      writeActiveJobs(user.id, [...active, { jobId: job.id, filename }]);
    }
    if (!terminal) pollerRef.current?.start({ jobId: job.id, filename });
    addActivityUpdate({
      id: `${job.id}:${job.status}`,
      message: activityMessage(filename, job),
      tone:
        job.status === "failed"
          ? "error"
          : job.status === "succeeded"
            ? "success"
            : "info",
      createdAt: new Date().toISOString(),
    });
  }

  async function uploadSelectedFiles() {
    if (selectedFiles.length === 0 || uploading || !canManageDocuments(user)) {
      return;
    }

    const unsupportedFile = selectedFiles.find(
      (file) => !isSupportedDocumentFilename(file.name),
    );
    if (unsupportedFile) {
      setError("Only .pdf, .docx, .txt, .ppt, and .pptx files are supported.");
      return;
    }

    setNotice(null);
    setError(null);
    setUploading(true);
    try {
      const token = await getToken();
      const items = selectedFiles.map((file, index) => ({
        key: fileKey(file, index),
        file,
      }));
      await processDocumentUploads(items, {
        presign: async (files) =>
          (
            await presignDocumentUploads(
              token,
              files.map((file) => ({
                filename: file.name,
                size_bytes: file.size,
                content_type: file.type || "application/octet-stream",
              })),
            )
          ).uploads,
        put: putFileToStorage,
        complete: async (upload) => {
          const response = await completeDocumentUploads(token, [
            { upload_id: upload.upload_id, filename: upload.filename },
          ]);
          const completed = response.files[0];
          if (!completed) throw new Error("The upload service did not finalize this file.");
          return completed;
        },
        startIngest: async (source) => (await startIngest(token, source)).job,
        onUpdate: (key, update) => {
          updateUploadRow(key, update);
          const filename =
            items.find((item) => item.key === key)?.file.name ?? "Document";
          if (update.status && update.status !== "failed") {
            addActivityUpdate({
              id: `${key}:${update.status}`,
              message: flowActivityMessage(filename, update.status),
              tone: "info",
              createdAt: new Date().toISOString(),
            });
          }
          if (update.status === "failed") {
            addActivityUpdate({
              id: `${key}:failed:${update.failureStage}`,
              message: `${filename}: ${update.detail || "The ingestion flow failed."}`,
              tone: "error",
              createdAt: new Date().toISOString(),
            });
          }
          if (update.job && update.completedFilename) {
            registerJob(key, update.completedFilename, update.job);
          }
        },
        errorMessage: formatApiError,
      });

      setNotice("Each finalized document has been sent to its own ingestion job.");
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to upload document."));
    } finally {
      setUploading(false);
    }
  }

  async function retryIngestion(row: UploadRow) {
    if (!row.completedFilename || row.status !== "failed" || !canManageDocuments(user)) {
      return;
    }
    setError(null);
    setNotice(null);
    lastBatchSummaryRef.current = null;
    updateUploadRow(row.key, { status: "queued", detail: undefined });
    try {
      const token = await getToken();
      const created = await startIngest(token, row.completedFilename);
      registerJob(row.key, row.completedFilename, created.job);
    } catch (err) {
      updateUploadRow(row.key, {
        status: "failed",
        detail: formatApiError(err, "Unable to retry document ingestion."),
        failureStage: "ingestion",
      });
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
  const activeJobCount = uploadRows.filter(
    (row) => row.status === "queued" || row.status === "processing",
  ).length;

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
              Upload PDF, DOCX, TXT, PPT, or PPTX sources, run indexing, and
              inspect the chunks that are available to the assistant.
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

              <div
                aria-live="polite"
                className="mt-5 rounded border border-outline-variant bg-surface-container-lowest p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="inline-flex items-center gap-2 text-[13px] font-bold text-[#26384d]">
                    <Bell className="h-4 w-4 text-primary" />
                    Admin updates
                  </p>
                  <span className="rounded-full bg-[#e5eee9] px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {activeJobCount
                      ? `${activeJobCount} active`
                      : "No active jobs"}
                  </span>
                </div>
                {activityUpdates.length ? (
                  <ul className="mt-2 space-y-2">
                    {activityUpdates.map((update) => (
                      <li className="flex items-start gap-2" key={update.id}>
                        {update.tone === "error" ? (
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#a34f35]" />
                        ) : update.tone === "success" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#626b79]" />
                        )}
                        <span className="min-w-0 text-[12px] leading-4 text-[#4e5966]">
                          <span className="block break-words">{update.message}</span>
                          <time className="text-[11px] text-[#7b8492]">
                            {new Date(update.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[12px] leading-4 text-[#626b79]">
                    Upload a document to see preparation, ingestion, and error
                    updates here.
                  </p>
                )}
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
                        <li
                          className="min-w-0 border-b border-outline-variant/60 py-2 last:border-b-0"
                          key={file.key}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate">{file.filename}</span>
                              <span className="block text-[11px] text-[#7b8492]">
                                {formatFileSize(file.size)}
                              </span>
                            </span>
                            <span
                              className={`shrink-0 text-[12px] font-semibold ${
                                file.status === "failed"
                                  ? "text-[#743f2c]"
                                  : file.status === "indexed"
                                    ? "text-primary"
                                    : "text-[#626b79]"
                              }`}
                            >
                              {file.status === "processing" ? (
                                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                              ) : null}
                              {uploadStatusLabel(file.status)}
                            </span>
                          </div>
                          {file.status === "uploading" ? (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#dfe7e2]">
                                <div
                                  className="h-full rounded-full bg-primary transition-[width]"
                                  style={{ width: `${file.progress}%` }}
                                />
                              </div>
                              <span className="w-9 text-right text-[11px] font-semibold text-[#626b79]">
                                {file.progress}%
                              </span>
                            </div>
                          ) : null}
                          {file.status === "queued" ||
                          file.status === "processing" ? (
                            <div className="mt-2">
                              <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#626b79]">
                                <span>
                                  {file.status === "queued"
                                    ? "Waiting for a worker"
                                    : file.jobProgress == null
                                      ? "Indexing in progress"
                                      : `${file.jobProgress}% indexed`}
                                </span>
                                <span>
                                  {file.etaSeconds != null
                                    ? `ETA ${formatDuration(file.etaSeconds)}`
                                    : file.jobStartedAt
                                      ? `${formatDuration(
                                          (now -
                                            new Date(file.jobStartedAt).getTime()) /
                                            1000,
                                        )} elapsed`
                                      : "ETA pending"}
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#dfe7e2]">
                                {file.jobProgress != null ? (
                                  <div
                                    className="h-full rounded-full bg-primary transition-[width]"
                                    style={{ width: `${file.jobProgress}%` }}
                                  />
                                ) : (
                                  <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                                )}
                              </div>
                              {file.lastCheckedAt ? (
                                <p className="mt-1 text-[11px] text-[#7b8492]">
                                  Status last checked at{" "}
                                  {new Date(file.lastCheckedAt).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {file.status === "indexed" ? (
                            <p className="text-[12px] text-primary">
                              {file.chunks ?? 0} chunks indexed
                            </p>
                          ) : null}
                          {file.detail ? (
                            <p
                              className={`text-[12px] ${
                                file.status === "failed"
                                  ? "text-[#743f2c]"
                                  : "text-[#626b79]"
                              }`}
                            >
                              {file.detail}
                            </p>
                          ) : null}
                          {file.status === "failed" &&
                          file.failureStage === "ingestion" &&
                          file.completedFilename ? (
                            isStoredDocumentMissing(file.detail) ? (
                              <p className="mt-1 text-[12px] font-semibold text-[#743f2c]">
                                Select this file again to re-upload it.
                              </p>
                            ) : (
                              <button
                                className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                                onClick={() => void retryIngestion(file)}
                                type="button"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Retry ingestion
                              </button>
                            )
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
          accept=".pdf,.docx,.txt,.ppt,.pptx"
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
