import { describe, expect, it, vi } from "vitest";
import type { IngestJob } from "./api";
import { canIngestDocuments, DocumentRetryProcessor } from "./document-retry";

function job(status: IngestJob["status"], error: string | null = null): IngestJob {
  return {
    id: "job-1",
    kind: "document",
    status,
    actor_user_id: "user-1",
    created_at: "2026-08-04T00:00:00Z",
    updated_at: "2026-08-04T00:00:00Z",
    started_at: null,
    finished_at: null,
    metadata: { source: "rules.pdf" },
    result: null,
    error,
  };
}

describe("document retry authorization", () => {
  it("allows only ingestion roles", () => {
    expect(canIngestDocuments("admin")).toBe(true);
    expect(canIngestDocuments("knowledge_manager")).toBe(true);
    expect(canIngestDocuments("officer")).toBe(false);
    expect(canIngestDocuments("viewer")).toBe(false);
  });
});

describe("document retry processing", () => {
  it("submits only the stored source and polls through success", async () => {
    const startIngest = vi.fn().mockResolvedValue(job("queued"));
    const getJob = vi.fn()
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValueOnce(job("succeeded"));
    const onUpdate = vi.fn();
    const onFinished = vi.fn();
    const processor = new DocumentRetryProcessor({
      startIngest,
      getJob,
      onUpdate,
      onFinished,
      onSubmissionError: vi.fn(),
      wait: async () => undefined,
    });

    await expect(processor.retry("rules.pdf")).resolves.toBe(true);
    expect(startIngest).toHaveBeenCalledWith("rules.pdf");
    expect(startIngest).toHaveBeenCalledTimes(1);
    expect(getJob).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith("rules.pdf", {
      status: "running",
      error: null,
    });
    expect(onFinished).toHaveBeenCalledWith("rules.pdf", expect.objectContaining({ status: "succeeded" }));
  });

  it("shows the terminal job error", async () => {
    const onUpdate = vi.fn();
    const onFinished = vi.fn();
    const processor = new DocumentRetryProcessor({
      startIngest: async () => job("queued"),
      getJob: async () => job("failed", "The PDF is encrypted."),
      onUpdate,
      onFinished,
      onSubmissionError: vi.fn(),
      wait: async () => undefined,
    });

    await processor.retry("rules.pdf");
    expect(onUpdate).toHaveBeenLastCalledWith("rules.pdf", {
      status: "failed",
      error: "The PDF is encrypted.",
    });
    expect(onFinished).toHaveBeenCalledWith("rules.pdf", expect.objectContaining({ status: "failed" }));
  });

  it("prevents a duplicate click while submission is pending", async () => {
    let release!: (value: IngestJob) => void;
    const startIngest = vi.fn(() => new Promise<IngestJob>((resolve) => { release = resolve; }));
    const processor = new DocumentRetryProcessor({
      startIngest,
      getJob: async () => job("succeeded"),
      onUpdate: vi.fn(),
      onFinished: vi.fn(),
      onSubmissionError: vi.fn(),
      wait: async () => undefined,
    });

    const first = processor.retry("rules.pdf");
    await expect(processor.retry("rules.pdf")).resolves.toBe(false);
    expect(startIngest).toHaveBeenCalledTimes(1);
    release(job("succeeded"));
    await first;
  });

  it("routes a structured submission failure to row error handling", async () => {
    const submissionError = { code: "source_missing", message: "Stored file not found." };
    const onSubmissionError = vi.fn();
    const processor = new DocumentRetryProcessor({
      startIngest: async () => { throw submissionError; },
      getJob: async () => job("succeeded"),
      onUpdate: vi.fn(),
      onFinished: vi.fn(),
      onSubmissionError,
    });

    await processor.retry("rules.pdf");
    expect(onSubmissionError).toHaveBeenCalledWith("rules.pdf", submissionError);
  });

  it("caps polling backoff while waiting for a terminal job", async () => {
    const delays: number[] = [];
    const getJob = vi.fn()
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValueOnce(job("running"))
      .mockResolvedValueOnce(job("succeeded"));
    const processor = new DocumentRetryProcessor({
      startIngest: async () => job("queued"),
      getJob,
      onUpdate: vi.fn(),
      onFinished: vi.fn(),
      onSubmissionError: vi.fn(),
      wait: async (delay) => { delays.push(delay); },
    });

    await processor.retry("rules.pdf");
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 10_000, 10_000]);
  });
});
