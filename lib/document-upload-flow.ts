import type { CompletedUpload, IngestJob, PresignedUpload } from "./api";

export type DocumentFlowStatus =
  | "selected"
  | "requesting_upload"
  | "uploading"
  | "finalizing"
  | "queued"
  | "failed";

export type UploadFlowFile = {
  key: string;
  file: File;
};

export type UploadFlowUpdate = {
  status?: DocumentFlowStatus;
  progress?: number;
  detail?: string;
  completedFilename?: string;
  job?: IngestJob;
  failureStage?: "upload" | "completion" | "ingestion";
};

export type UploadFlowDependencies = {
  presign: (files: File[]) => Promise<PresignedUpload[]>;
  put: (
    upload: PresignedUpload,
    file: File,
    onProgress: (percentage: number) => void,
  ) => Promise<void>;
  complete: (upload: PresignedUpload) => Promise<CompletedUpload>;
  startIngest: (source: string) => Promise<IngestJob>;
  onUpdate: (key: string, update: UploadFlowUpdate) => void;
  errorMessage: (error: unknown, fallback: string) => string;
};

export type UploadBatchSummary = {
  tone: "success" | "error";
  message: string;
};

export function summarizeUploadBatch(
  files: Array<{ filename: string; status: string }>,
): UploadBatchSummary | null {
  if (
    files.length === 0 ||
    files.some(({ status }) => status !== "indexed" && status !== "failed")
  ) {
    return null;
  }

  const failed = files.filter(({ status }) => status === "failed");
  const succeededCount = files.length - failed.length;

  if (failed.length === 0) {
    return {
      tone: "success",
      message: `${succeededCount} ${succeededCount === 1 ? "document" : "documents"} ingested successfully.`,
    };
  }

  const failedNames = failed.map(({ filename }) => filename).join(", ");
  const successMessage = succeededCount
    ? ` ${succeededCount} ${succeededCount === 1 ? "document was" : "documents were"} ingested successfully.`
    : "";

  return {
    tone: "error",
    message: `${failed.length} of ${files.length} ${files.length === 1 ? "document" : "documents"} failed: ${failedNames}.${successMessage}`,
  };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await task(item);
      }
    },
  );
  await Promise.all(workers);
}

export async function processDocumentUploads(
  items: UploadFlowFile[],
  dependencies: UploadFlowDependencies,
) {
  const { complete, errorMessage, onUpdate, presign, put, startIngest } =
    dependencies;

  items.forEach(({ key }) => onUpdate(key, { status: "requesting_upload" }));

  let uploads: PresignedUpload[];
  try {
    uploads = await presign(items.map(({ file }) => file));
  } catch (error) {
    const detail = errorMessage(error, "Unable to prepare direct upload.");
    items.forEach(({ key }) =>
      onUpdate(key, { status: "failed", detail, failureStage: "upload" }),
    );
    return;
  }

  if (uploads.length !== items.length) {
    const detail = "The upload service returned an unexpected number of URLs.";
    items.forEach(({ key }) =>
      onUpdate(key, { status: "failed", detail, failureStage: "upload" }),
    );
    return;
  }

  await runWithConcurrency(
    items.map((item, index) => ({ item, upload: uploads[index] })),
    2,
    async ({ item, upload }) => {
      try {
        onUpdate(item.key, { status: "uploading", progress: 0 });
        await put(upload, item.file, (progress) =>
          onUpdate(item.key, { progress }),
        );
      } catch (error) {
        onUpdate(item.key, {
          status: "failed",
          detail: errorMessage(error, "Unable to upload document to storage."),
          failureStage: "upload",
        });
        return;
      }

      let completed: CompletedUpload;
      try {
        onUpdate(item.key, { status: "finalizing", progress: 100 });
        completed = await complete(upload);
      } catch (error) {
        onUpdate(item.key, {
          status: "failed",
          detail: errorMessage(error, "Unable to finalize document upload."),
          failureStage: "completion",
        });
        return;
      }

      try {
        const { filename } = completed;
        const job = await startIngest(filename);
        onUpdate(item.key, {
          status: "queued",
          completedFilename: filename,
          job,
          detail: undefined,
        });
      } catch (error) {
        onUpdate(item.key, {
          status: "failed",
          completedFilename: completed.filename,
          detail: errorMessage(error, "Unable to start document ingestion."),
          failureStage: "ingestion",
        });
      }
    },
  );
}
