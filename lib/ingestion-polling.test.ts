import { afterEach, describe, expect, it, vi } from "vitest";
import type { IngestJob } from "./api";
import { IngestJobPoller, successfulIngestDetail } from "./ingestion-polling";

const job = (status: IngestJob["status"]): IngestJob => ({
  id: "job-1", kind: "ingest", status, actor_user_id: null,
  created_at: "now", updated_at: "now", started_at: null, finished_at: null,
  metadata: {}, result: null, error: null,
});

afterEach(() => vi.useRealTimers());

describe("ingestion recovery", () => {
  it("continues polling when recovery moves running back to queued", async () => {
    vi.useFakeTimers();
    const updates: string[] = [];
    const poller = new IngestJobPoller(
      vi.fn().mockResolvedValueOnce(job("running")).mockResolvedValueOnce(job("queued")).mockResolvedValueOnce(job("succeeded")),
      (_filename, value) => updates.push(value.status),
      () => undefined,
    );
    poller.start({ filename: "rules.pdf", jobId: "job-1" }, true);
    await vi.advanceTimersByTimeAsync(20_001);
    expect(updates).toEqual(["running", "queued", "succeeded"]);
  });

  it("reports an all-skipped ingestion as successful", () => {
    expect(successfulIngestDetail({ ...job("succeeded"), result: { documents: 1, documents_added: 0, documents_skipped: 1, chunks: 0, chunks_added: 0, source: "rules.pdf", storage: "db" } })).toContain("skipped successfully");
  });
});
