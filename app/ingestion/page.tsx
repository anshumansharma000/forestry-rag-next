"use client";

import {
  AlertCircle,
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
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CategorizationFields, useDocumentCategories } from "../../components/categorization-fields";
import { CategorizationDraft, categorizationDraft, categoryLabel, uploadCategorization, validateCategorizationDraft } from "../../lib/document-categorization";
import { SidebarPageShell } from "../../components/app-sidebar";
import {
  ensureFreshAuth,
  formatApiError,
  loadStoredSession,
} from "../../lib/auth-client";
import {
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
  DOCUMENT_UPLOAD_LIMIT_COPY,
  DocumentFlowStatus,
  processDocumentUploads,
  summarizeUploadBatch,
  UploadFlowUpdate,
  validateDocumentUploadBatch,
} from "../../lib/document-upload-flow";
import { prepareWithReplacementConfirmation } from "../../lib/upload-replacement";
import {
  IngestJobPoller,
  readActiveJobs,
  successfulIngestDetail,
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
    return "Page number unavailable";
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
    return "No excerpts found";
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
  uploadProgress: number;
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
      return "Ready for chat";
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
      return `${filename} is waiting to be processed.`;
    case "running":
      return `${filename} is being prepared for search.`;
    case "succeeded":
      return successfulIngestDetail(job) ?? `${filename} is ready for chat.`;
    case "failed":
      return `${filename} could not be processed: ${job.error || "Document processing failed."}`;
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
      return `${filename} is waiting to be processed.`;
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
  const [dragging, setDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [metadataDrafts, setMetadataDrafts] = useState<Record<string, CategorizationDraft>>({});
  const categoryCatalog = useDocumentCategories(auth?.access_token);
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
        error: "Select or upload a document before loading searchable excerpts.",
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
        setError("Select or upload a document before loading searchable excerpts.");
      } else {
        setError(formatApiError(err, "Unable to load searchable excerpts."));
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
          setError(formatApiError(err, "Unable to load document processing."));
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
                  detail: job.status === "failed" ? job.error || "Document processing failed." : successfulIngestDetail(job),
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
          "Unable to refresh processing status.",
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
              uploadProgress: 100,
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
    const validationError = validateDocumentUploadBatch(files);

    setNotice(null);
    lastBatchSummaryRef.current = null;
    if (validationError) {
      setSelectedFiles([]);
      setUploadRows([]);
      setError(validationError);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFiles(files);
    setMetadataDrafts(current => Object.fromEntries(files.map((file, index) => {
      const key = fileKey(file, index);
      return [key, current[key] ?? categorizationDraft()];
    })));
    setUploadRows(
      files.map((file, index) => ({
        key: fileKey(file, index),
        filename: file.name,
        size: file.size,
        status: "selected",
        uploadProgress: 0,
      })),
    );
    setError(null);
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

    const validationError = validateDocumentUploadBatch(selectedFiles);
    if (validationError) {
      setError(validationError);
      return;
    }

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      const draft = metadataDrafts[fileKey(file, index)] ?? categorizationDraft();
      const validation = validateCategorizationDraft(draft, categoryCatalog.categories);
      if (validation || (uploadCategorization(draft) && categoryCatalog.status !== "available")) {
        setError(`${file.name}: ${validation || "Categories are unavailable. Try loading them again before uploading your metadata."}`);
        return;
      }
    }
    setNotice(null);
    setError(null);
    setUploading(true);
    try {
      const token = await getToken();
      const items = selectedFiles.map((file, index) => ({
        key: fileKey(file, index),
        file,
        categorization: uploadCategorization(metadataDrafts[fileKey(file, index)] ?? categorizationDraft()),
      }));
      let hasFailures = false;
      const outcome = await processDocumentUploads(items, {
        presign: async (files) => prepareWithReplacementConfirmation(
          files.length,
          async replaceIndices => (await presignDocumentUploads(token, files.map((file, index) => ({
            filename: file.name,
            size_bytes: file.size,
            content_type: file.type || "application/octet-stream",
            ...(replaceIndices.includes(index) ? { replace_failed: true } : {}),
          })))).uploads,
          message => window.confirm(message),
        ),
        put: putFileToStorage,
        complete: async (upload, categorization) => {
          const response = await completeDocumentUploads(token, [
            { upload_id: upload.upload_id, filename: upload.filename,
              ...(categorization ? { categorization } : {}), ...(upload.replace_failed ? { replace_failed: true } : {}) },
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
            hasFailures = true;
            setError("Some documents could not be uploaded or processed. Check the status beside each file.");
            addActivityUpdate({
              id: `${key}:failed:${update.failureStage}`,
              message: `${filename}: ${update.detail || "Document processing failed."}`,
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

      if (outcome?.cancelled) {
        setNotice("Re-upload cancelled. Existing files were kept.");
        return;
      }
      if (!hasFailures) setNotice("Your documents were uploaded and are now being prepared for search. Review their metadata in Documents when processing finishes.");
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
        detail: formatApiError(err, "Unable to retry document processing."),
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
    <SidebarPageShell activePath="/ingestion" user={user}>
    <main className="document-workspace min-h-[calc(100vh-72px)] bg-surface px-5 py-6 text-on-surface sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm leading-6 text-[#626b79]">Upload department sources and follow their progress until they’re ready for chat.</p>

        {error ? <Banner tone="error" message={error} /> : null}
        {notice ? <Banner tone="success" message={notice} /> : null}
        {canManage ? <p className="mt-4 text-sm leading-6 text-[#626b79]">
          Choose a category now, or review suggestions after processing. Existing documents can be categorized in the <Link className="font-semibold text-primary underline" href="/documents">document library</Link>.
        </p> : null}

        {loading ? (
          <div className="mt-6 flex items-center gap-3 rounded border border-outline-variant bg-white px-4 py-4 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-[15px] font-semibold">
              Loading document processing
            </span>
          </div>
        ) : !canManage ? (
          <section className="mt-6 rounded border border-[#f0c4b6] bg-[#fff5f1] p-5 text-[#743f2c]">
            <h2 className="text-[18px] font-bold">Access required</h2>
            <p className="mt-2 text-[14px] leading-5">
              Uploading documents requires an Admin or Knowledge manager role.
            </p>
          </section>
        ) : (
          <section className="mt-6 grid gap-6">
            <div className="rounded-2xl border border-outline-variant/60 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
                  <Upload className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-bold text-[#151a18]">
                    Source Files
                  </h2>
                  <p className="text-[14px] text-[#626b79]">Document processing</p>
                </div>
              </div>



              <div className="mt-5 grid gap-3">
                <div onDragOver={event => { event.preventDefault(); if (!uploading) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!uploading) selectFiles(event.dataTransfer.files); }} className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${dragging ? "border-primary bg-[#edf8f1]" : "border-[#cbd8cf] bg-[#f8fbf9]"}`}>
                  <Upload className="mx-auto h-8 w-8 text-primary" />
                  <p className="mt-3 text-base font-semibold text-[#263c2e]">Drop your documents here</p>
                  <button className="secondary-button mt-3" disabled={uploading} onClick={() => fileInputRef.current?.click()} type="button">Choose documents</button>
                  <p className="mt-3 text-xs leading-5 text-[#626b79]">PDF, TXT, DOCX, PPT, and PPTX. {DOCUMENT_UPLOAD_LIMIT_COPY}</p>
                </div>
                {categoryCatalog.status === "loading" ? <p className="text-xs text-[#626b79]" role="status">Loading document categories…</p> : null}
                {categoryCatalog.status === "unavailable" ? <div className="rounded bg-[#fff9e9] p-3 text-xs leading-5 text-[#6c551d]" role="status">
                  Categories are temporarily unavailable. You can still upload without metadata.
                  <button className="ml-2 min-h-11 font-semibold underline" onClick={categoryCatalog.retry} type="button">Try again</button>
                </div> : null}
                {selectedFiles.length > 1 && categoryCatalog.status === "available" ? <label className="block text-sm font-semibold text-[#414844]">
                  Apply a category to all selected files
                  <select aria-label="Apply a category to all selected files" className="field mt-1.5" disabled={uploading} defaultValue="placeholder" onChange={event => {
                    const value = event.target.value;
                    setMetadataDrafts(current => Object.fromEntries(selectedFiles.map((file, index) => {
                      const key = fileKey(file, index);
                      return [key, { ...(current[key] ?? categorizationDraft()), document_type: value }];
                    })));
                    event.target.value = "placeholder";
                  }}>
                    <option value="placeholder" disabled>Choose a category for this batch</option>
                    <option value="">Suggest during processing</option>
                    {categoryCatalog.categories.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
                  </select>
                </label> : null}
                {uploadRows.length ? (
                  <div className="rounded border border-outline-variant bg-surface-container-lowest px-3 py-2">
                    <p className="text-[12px] font-semibold uppercase text-[#7b8492]">
                      Upload queue · {uploadRows.length} files
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Queue status">
                      {[
                        ["Uploading", uploadRows.filter(file => ["requesting_upload", "uploading", "finalizing"].includes(file.status)).length],
                        ["Processing", uploadRows.filter(file => ["queued", "processing"].includes(file.status)).length],
                        ["Ready", uploadRows.filter(file => file.status === "indexed").length],
                        ["Needs attention", uploadRows.filter(file => file.status === "failed").length],
                      ].map(([label, count]) => <span key={label} className={`rounded-full px-2.5 py-1 ${label === "Needs attention" && count ? "bg-[#fff3ef] text-[#743f2c]" : "bg-[#edf4ef] text-primary"}`}>{label} · {count}</span>)}
                    </div>
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
                          {file.status === "selected" && categoryCatalog.status === "available" ? <div className="mt-3">
                            <CategorizationFields compact disabled={uploading} categories={categoryCatalog.categories}
                              draft={metadataDrafts[file.key] ?? categorizationDraft()}
                              onChange={draft => setMetadataDrafts(current => ({ ...current, [file.key]: draft }))} />
                          </div> : metadataDrafts[file.key]?.document_type ? <p className="mt-2 text-xs text-[#626b79]">
                            {categoryLabel(metadataDrafts[file.key].document_type, categoryCatalog.categories)}
                          </p> : null}
                          {file.status === "indexed" ? <Link className="mt-2 inline-flex min-h-11 items-center text-xs font-bold text-primary underline"
                            href={`/documents?search=${encodeURIComponent(file.completedFilename ?? file.filename)}`}>View in Documents</Link> : null}
                          {file.status === "uploading" ? (
                            <div className="mt-2 flex items-center gap-2">
                              <div
                                aria-label={`${file.filename} upload progress`}
                                aria-valuemax={100}
                                aria-valuemin={0}
                                aria-valuenow={file.uploadProgress}
                                className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#dfe7e2]"
                                role="progressbar"
                              >
                                <div
                                  className="h-full rounded-full bg-primary transition-[width]"
                                  style={{ width: `${file.uploadProgress}%` }}
                                />
                              </div>
                              <span className="w-9 text-right text-[11px] font-semibold text-[#626b79]">
                                {file.uploadProgress}%
                              </span>
                            </div>
                          ) : null}
                          {file.status === "queued" ||
                          file.status === "processing" ? (
                            <div className="mt-2">
                              <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#626b79]">
                                <span>
                                  {file.status === "queued"
                                    ? "Waiting to be processed"
                                    : file.jobProgress == null
                                      ? "Preparing for search"
                                      : `${file.jobProgress}% processed`}
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
                              <div
                                aria-label={`${file.filename} processing progress`}
                                aria-valuemax={100}
                                aria-valuemin={0}
                                aria-valuenow={file.jobProgress}
                                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#dfe7e2]"
                                role="progressbar"
                              >
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
                              {file.chunks ?? 0} searchable excerpts added
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
                                Retry processing
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
                  {uploading ? "Uploading…" : "Upload and process"}
                </button>
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded border border-outline-variant bg-white px-4 text-[14px] font-semibold text-[#26384d] transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={previewing || uploading || !hasPreviewScope}
                  onClick={() => void loadPreview()}
                  type="button"
                >
                  {previewing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Reload excerpts
                </button>
              </div>

              <details className="mt-5 rounded-xl border border-outline-variant/60 p-4">
                <summary className="cursor-pointer text-sm font-medium text-[#626b79]">Activity log{activeJobCount ? ` · ${activeJobCount} active` : ""}</summary>
                <div aria-live="polite" className="mt-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="inline-flex items-center gap-2 text-[13px] font-bold text-[#26384d]">
                    <Bell className="h-4 w-4 text-primary" />
                    Processing updates
                  </p>
                  <span className="rounded-full bg-[#e5eee9] px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {activeJobCount
                      ? `${activeJobCount} active`
                      : "No documents processing"}
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
                    Upload a document to follow its progress and see any issues
                    here.
                  </p>
                )}
                </div>
              </details>

              {preview ? (
              <div className="mt-5 grid gap-3 text-[13px] leading-5 text-[#4e5966] sm:grid-cols-2">
                <Metric label="Documents" value={preview.documents} />
                <Metric
                  label="Processed"
                  value={preview.documents_processed}
                />
                <Metric
                  label="Excerpts found"
                  value={preview.chunks_seen}
                />
                <Metric
                  label="Shown"
                  value={preview.chunks_returned}
                />
              </div>
              ) : null}

            </div>

            <details className="rounded-xl border border-outline-variant/70 bg-white p-5">
              <summary className="cursor-pointer text-base font-semibold text-primary">Inspect searchable excerpts</summary>
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
                  <Search className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[19px] font-bold text-[#151a18]">
                    Searchable excerpts
                  </h2>
                  <p className="text-[14px] text-[#626b79]">
                    Inspect the excerpts available to answers
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
                    className="h-10 rounded-lg border border-outline-variant/70 bg-white px-3 text-[14px] font-normal text-[#151a18] outline-none transition focus:border-primary"
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
                    <span>Looking across all documents can take longer.</span>
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
                        className="h-10 rounded-lg border border-outline-variant/70 bg-white px-3 text-[14px] font-normal text-[#151a18] outline-none transition focus:border-primary"
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
                    disabled={previewing || !hasPreviewScope}
                    type="submit"
                  >
                    {previewing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Load excerpts
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
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-outline-variant/70 bg-white px-3 text-[13px] font-semibold text-[#26384d] transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-outline-variant/70 bg-white px-3 text-[13px] font-semibold text-[#26384d] transition hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
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
                      Loading excerpts
                    </span>
                  </div>
                ) : null}
                {!previewing && !preview?.chunks.length ? (
                  <p className="rounded border border-dashed border-outline-variant p-4 text-[14px] leading-5 text-[#626b79]">
                    {hasPreviewScope
                      ? "No searchable excerpts match this selection."
                      : "Choose a source file or select All documents to load searchable excerpts."}
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
                          {pageRange(chunk)} · Excerpt {chunk.chunk_index + 1} ·{" "}
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
                      <div className="mt-3 rounded-lg border border-outline-variant/70 bg-white px-3 py-2">
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
            </details>
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
    </SidebarPageShell>
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
