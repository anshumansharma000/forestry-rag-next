import type { IngestJob } from "./api";

export type ActiveIngestJob = { jobId: string; filename: string };

type Timer = ReturnType<typeof setTimeout>;

export class IngestJobPoller {
  private active = new Map<string, { startedAt: number; timer?: Timer }>();
  private stopped = false;

  constructor(
    private readonly getJob: (jobId: string) => Promise<IngestJob>,
    private readonly onJob: (filename: string, job: IngestJob) => void,
    private readonly onError: (filename: string, error: unknown) => void,
  ) {}

  start({ filename, jobId }: ActiveIngestJob, immediate = false) {
    if (this.stopped || this.active.has(jobId)) return;
    this.active.set(jobId, { startedAt: Date.now() });
    this.schedule(filename, jobId, immediate ? 0 : 2_000);
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
      this.schedule(filename, jobId, elapsed >= 30_000 ? 5_000 : 2_000);
    } catch (error) {
      if (!this.active.has(jobId) || this.stopped) return;
      this.onError(filename, error);
      this.schedule(filename, jobId, 5_000);
    }
  }

  stopAll() {
    this.stopped = true;
    this.active.forEach(({ timer }) => timer && clearTimeout(timer));
    this.active.clear();
  }
}

export function activeJobsStorageKey(userId: string) {
  return `forest-rag-active-ingest-jobs:${userId}`;
}

export function readActiveJobs(userId: string): ActiveIngestJob[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(
      window.localStorage.getItem(activeJobsStorageKey(userId)) ?? "[]",
    );
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
}
