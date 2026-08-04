import type { IngestJob, Role } from "./api";

export type RetryStatus = "queued" | "running" | "succeeded" | "failed";

export type RetryUpdate = {
  status: RetryStatus;
  error: string | null;
};

type RetryDependencies = {
  startIngest: (source: string) => Promise<IngestJob>;
  getJob: (jobId: string) => Promise<IngestJob>;
  onUpdate: (source: string, update: RetryUpdate) => void;
  onFinished: (source: string, job: IngestJob) => void;
  onSubmissionError: (source: string, error: unknown) => void;
  wait?: (delayMs: number) => Promise<void>;
};

const POLL_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 10_000] as const;

export function canIngestDocuments(role: Role | undefined) {
  return role === "admin" || role === "knowledge_manager";
}

function defaultWait(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

/** Coordinates source-only ingestion retries and rejects a duplicate active retry. */
export class DocumentRetryProcessor {
  private readonly activeSources = new Set<string>();
  private stopped = false;

  constructor(private readonly dependencies: RetryDependencies) {}

  isActive(source: string) {
    return this.activeSources.has(source);
  }

  async retry(source: string) {
    if (this.stopped || this.activeSources.has(source)) return false;

    this.activeSources.add(source);
    this.dependencies.onUpdate(source, { status: "queued", error: null });

    try {
      let job = await this.dependencies.startIngest(source);
      if (this.stopped) return true;
      this.publish(source, job);

      let attempt = 0;
      while (job.status !== "succeeded" && job.status !== "failed") {
        const delay = POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)];
        attempt += 1;
        await (this.dependencies.wait ?? defaultWait)(delay);
        if (this.stopped) return true;

        try {
          job = await this.dependencies.getJob(job.id);
          this.publish(source, job);
        } catch {
          // A transient polling error keeps the row processing and retries at a
          // capped delay. Terminal job errors are delivered by the job payload.
        }
      }

      this.dependencies.onFinished(source, job);
      return true;
    } catch (error) {
      if (!this.stopped) this.dependencies.onSubmissionError(source, error);
      return true;
    } finally {
      this.activeSources.delete(source);
    }
  }

  stop() {
    this.stopped = true;
    this.activeSources.clear();
  }

  private publish(source: string, job: IngestJob) {
    this.dependencies.onUpdate(source, {
      status: job.status,
      error: job.status === "failed" ? job.error || "Ingestion failed." : null,
    });
  }
}
