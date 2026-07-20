import type { IngestJob } from "./api";

export type ActiveIngestJob = { jobId: string; filename: string };

type Timer = ReturnType<typeof setTimeout>;

const INITIAL_POLL_DELAY_MS = 5_000;
const STEADY_POLL_DELAY_MS = 10_000;
const POLL_ERROR_DELAY_MS = 15_000;
const BACKGROUND_POLL_DELAY_MS = 30_000;

export class IngestJobPoller {
  private active = new Map<string, { startedAt: number; timer?: Timer }>();
  private stopped = false;

  constructor(
    private readonly getJob: (jobId: string) => Promise<IngestJob>,
    private readonly onJob: (filename: string, job: IngestJob) => void,
    private readonly onError: (
      filename: string,
      jobId: string,
      error: unknown,
    ) => void,
  ) {}

  start({ filename, jobId }: ActiveIngestJob, immediate = false) {
    if (this.stopped || this.active.has(jobId)) return;
    this.active.set(jobId, { startedAt: Date.now() });
    this.schedule(filename, jobId, immediate ? 0 : INITIAL_POLL_DELAY_MS);
  }

  private schedule(filename: string, jobId: string, delay: number) {
    const state = this.active.get(jobId);
    if (!state || this.stopped) return;
    state.timer = setTimeout(() => void this.poll(filename, jobId), delay);
  }

  private async poll(filename: string, jobId: string) {
    const state = this.active.get(jobId);
    if (!state || this.stopped) return;
    try {
      const job = await this.getJob(jobId);
      if (!this.active.has(jobId) || this.stopped) return;
      this.onJob(filename, job);
      if (job.status === "succeeded" || job.status === "failed") {
        this.active.delete(jobId);
        return;
      }
      const elapsed = Date.now() - state.startedAt;
      const pageIsHidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";
      this.schedule(
        filename,
        jobId,
        pageIsHidden
          ? BACKGROUND_POLL_DELAY_MS
          : elapsed >= 30_000
            ? STEADY_POLL_DELAY_MS
            : INITIAL_POLL_DELAY_MS,
      );
    } catch (error) {
      if (!this.active.has(jobId) || this.stopped) return;
      this.onError(filename, jobId, error);
      this.schedule(filename, jobId, POLL_ERROR_DELAY_MS);
    }
  }

  stopAll() {
    this.stopped = true;
    this.active.forEach(({ timer }) => timer && clearTimeout(timer));
    this.active.clear();
  }
}

export function activeJobsStorageKey(userId: string) {
  return `aranyabodh-active-ingest-jobs:${userId}`;
}

function legacyActiveJobsStorageKey(userId: string) {
  return `forest-rag-active-ingest-jobs:${userId}`;
}

export function readActiveJobs(userId: string): ActiveIngestJob[] {
  if (typeof window === "undefined") return [];
  try {
    const storageKey = activeJobsStorageKey(userId);
    const legacyStorageKey = legacyActiveJobsStorageKey(userId);
    const raw =
      window.localStorage.getItem(storageKey) ??
      window.localStorage.getItem(legacyStorageKey) ??
      "[]";
    if (raw !== "[]" && !window.localStorage.getItem(storageKey)) {
      window.localStorage.setItem(storageKey, raw);
      window.localStorage.removeItem(legacyStorageKey);
    }
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter(
          (item): item is ActiveIngestJob =>
            typeof item?.jobId === "string" &&
            typeof item?.filename === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export function writeActiveJobs(userId: string, jobs: ActiveIngestJob[]) {
  window.localStorage.setItem(activeJobsStorageKey(userId), JSON.stringify(jobs));
  window.localStorage.removeItem(legacyActiveJobsStorageKey(userId));
}
