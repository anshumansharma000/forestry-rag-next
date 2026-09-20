import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canAccessRagLab, copyTrialRetrieval, defaultRagLabConfig, listRagLabChunks, makeRagLabUpload, PUBLISH_CONFIRMATION_POINTS,
  publishRagLabRevision, queryRagLabRevision, RagLabJobPoller, ragLabWorkspaceHref,
  ragSourceLabel, uploadRagLabFiles, validateRagLabConfig, validateRagLabFiles,
} from "./rag-lab";
import type { IngestJob } from "./api";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("RAG Lab role navigation", () => {
  it("is visible only to admins and builds an encoded workspace URL", () => {
    expect(canAccessRagLab("admin")).toBe(true);
    expect(["viewer", "officer", "knowledge_manager"].every(role => !canAccessRagLab(role as never))).toBe(true);
    expect(ragLabWorkspaceHref("id/with space")).toBe("/admin/rag-lab/workspace?experimentId=id%2Fwith%20space");
  });
});

describe("RAG Lab configuration validation", () => {
  it("accepts defaults and enforces all coupled bounds", () => {
    expect(validateRagLabConfig(defaultRagLabConfig)).toEqual({});
    const invalid = structuredClone(defaultRagLabConfig);
    invalid.chunking.max_tokens = 100;
    invalid.chunking.overlap_tokens = 100;
    invalid.retrieval.top_k = 20;
    invalid.retrieval.candidate_count = 19;
    expect(validateRagLabConfig(invalid).overlap_tokens).toContain("smaller");
    expect(validateRagLabConfig(invalid).candidate_count).toContain("at least");
  });
});

describe("private multipart upload", () => {
  it("appends every file under files and validates batch limits", () => {
    const files = [new File(["a"], "one.pdf"), new File(["b"], "two.PPTX")];
    expect(Array.from(makeRagLabUpload(files).keys())).toEqual(["files", "files"]);
    expect(validateRagLabFiles(files)).toBeNull();
    expect(validateRagLabFiles([{ name: "empty.txt", size: 0 } as File])).toContain("Empty");
    expect(validateRagLabFiles([{ name: "a.pdf", size: 100 * 1024 * 1024 }, { name: "b.pdf", size: 51 * 1024 * 1024 }] as File[])).toContain("combined");
  });

  it("uses only RAG Lab endpoints for upload, query, and publish", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      paths.push(String(input));
      const body = String(input).endsWith("/publish") ? { job: { id: "j" } } : String(input).endsWith("/query") ? { trial: { id: "t" } } : {};
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    await uploadRagLabFiles("token", "experiment", [new File(["x"], "one.pdf")]);
    await queryRagLabRevision("token", "revision", "Question?", defaultRagLabConfig.retrieval);
    await publishRagLabRevision("token", "revision");
    expect(paths).toEqual(expect.arrayContaining([
      expect.stringContaining("/admin/rag-lab/experiments/experiment/files"),
      expect.stringContaining("/admin/rag-lab/revisions/revision/query"),
      expect.stringContaining("/admin/rag-lab/revisions/revision/publish"),
    ]));
    expect(paths.some(path => /\/ingest\/?$/.test(path))).toBe(false);
  });
});

const job = (status: IngestJob["status"], error: string | null = null): IngestJob => ({
  id: "job", kind: "rag_lab.build", status, actor_user_id: null, created_at: "2026-01-01", updated_at: "2026-01-01",
  started_at: null, finished_at: null, metadata: {}, result: null, error,
});

describe("job polling", () => {
  it("continues when a recovered build moves from running back to queued", async () => {
    vi.useFakeTimers(); const updates: string[] = [];
    const poller = new RagLabJobPoller(vi.fn().mockResolvedValueOnce(job("running")).mockResolvedValueOnce(job("queued")).mockResolvedValueOnce(job("succeeded")), update => updates.push(update.state), 10);
    const done = poller.start("job"); await vi.advanceTimersByTimeAsync(30); await done;
    expect(updates).toEqual(["running", "queued", "succeeded"]);
  });

  it("reports a failed build and retains the backend error", async () => {
    vi.useFakeTimers(); const updates: string[] = [];
    const poller = new RagLabJobPoller(vi.fn().mockResolvedValueOnce(job("running")).mockResolvedValueOnce(job("failed", "Parser failed")), update => updates.push(`${update.state}:${update.job?.error ?? ""}`), 10);
    const done = poller.start("job"); await vi.advanceTimersByTimeAsync(20); await done;
    expect(updates).toEqual(["running:", "failed:Parser failed"]);
  });

  it("stops cleanly so route changes cannot start another request", async () => {
    vi.useFakeTimers(); const getJob = vi.fn().mockResolvedValue(job("running"));
    const poller = new RagLabJobPoller(getJob, vi.fn(), 10); void poller.start("job"); await vi.advanceTimersByTimeAsync(1); poller.stop(); await vi.advanceTimersByTimeAsync(100);
    expect(getJob).toHaveBeenCalledTimes(1);
  });
});

describe("citations and publication safety", () => {
  it("keeps historical trials without fabricating an outcome", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{
      id: "old", revision_id: "revision", actor_user_id: null, question: "Old?",
      retrieval_config: defaultRagLabConfig.retrieval, answer: "Old answer", sources: [],
      confidence: null, abstained: false, latency_ms: null, created_at: "2025-01-01",
    }] }), { status: 200 })));
    const { listRagLabTrials } = await import("./rag-lab");
    const result = await listRagLabTrials("token", "revision");
    expect(result.items[0].outcome).toBeUndefined();
  });

  it("formats complete citation evidence and requires explicit confirmation copy", () => {
    expect(ragSourceLabel({ citation_number: 1, document_id: "doc", source: "a", display_source: "Forest Rules", page_start: 2, page_end: 4, chunk_index: 3, section_heading: "Approval", score: .8, evidence_role: "matched", text: "Evidence" })).toBe("Forest Rules · Pages 2–4 · Approval");
    expect(PUBLISH_CONFIRMATION_POINTS.join(" ")).toContain("no unpublish or rollback");
    expect(PUBLISH_CONFIRMATION_POINTS.join(" ")).toContain("regular chat");
  });

  it("reuses saved settings without mutating defaults or issuing a query", () => {
    const trial = { retrieval_config: { ...defaultRagLabConfig.retrieval, top_k: 9 } };
    const copied = copyTrialRetrieval(defaultRagLabConfig, trial);
    expect(copied.retrieval.top_k).toBe(9);
    expect(defaultRagLabConfig.retrieval.top_k).toBe(5);
  });
});

describe("revision-scoped chunk pagination", () => {
  it("encodes the selected revision and server offset in each request", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      paths.push(String(input));
      return new Response(JSON.stringify({ items: [], pagination: { offset: 0, limit: 50, total: 0, has_more: false } }), { status: 200 });
    }));
    await listRagLabChunks("token", "revision-a", 0, 50);
    await listRagLabChunks("token", "revision-b", 50, 50);
    expect(paths[0]).toContain("/revisions/revision-a/chunks?offset=0&limit=50");
    expect(paths[1]).toContain("/revisions/revision-b/chunks?offset=50&limit=50");
  });
});
