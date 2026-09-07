"use client";

import { apiRequest, IngestJob } from "./api";
import type { Role } from "./api";

export type RagLabChunkingConfig = {
  strategy: "structure_aware_v1";
  profile: "auto" | "section" | "faq" | "procedure";
  max_tokens: number;
  overlap_tokens: number;
};

export type RagLabRetrievalConfig = {
  top_k: number;
  candidate_count: number;
  max_per_source: number;
  duplicate_threshold: number;
  min_context_score: number;
  expand_neighbors: boolean;
};

export type RagLabConfig = { chunking: RagLabChunkingConfig; retrieval: RagLabRetrievalConfig };
export type RagLabExperimentStatus = "draft" | "building" | "ready" | "publishing" | "published" | "failed" | "archived";
export type RagLabRevisionStatus = "queued" | "building" | "ready" | "publishing" | "published" | "failed";

export type RagLabExperiment = {
  id: string; name: string; description: string | null; status: RagLabExperimentStatus;
  owner_user_id: string | null; config: RagLabConfig; published_revision_id: string | null;
  metadata: Record<string, unknown>; created_at: string; updated_at: string;
};
export type RagLabFile = {
  id: string; experiment_id: string; filename: string; kind: "pdf" | "docx" | "txt" | "ppt" | "pptx" | string;
  checksum_sha256: string; size_bytes: number; extraction_metadata: { title?: string; page_count?: number | null; document_metadata?: Record<string, unknown> };
  created_at: string; updated_at: string;
};
export type RagLabRevision = {
  id: string; experiment_id: string; revision_number: number; status: RagLabRevisionStatus;
  config: RagLabConfig; chunk_count: number; error: string | null; created_by: string | null;
  created_at: string; updated_at: string; published_at: string | null;
};
export type RagLabChunk = {
  id: string; revision_id: string; file_id: string; source: string; chunk_index: number; chunk_type: string;
  section_heading: string | null; page_start: number | null; page_end: number | null; token_estimate: number;
  content?: string; metadata: Record<string, unknown>;
};
export type RagSource = {
  source: string; display_source: string; page_start: number | null; page_end: number | null; chunk_index: number;
  section_heading: string | null; score: number; evidence_role: "matched" | "neighbor"; text: string;
};
export type RagLabTrial = {
  id: string; revision_id: string; actor_user_id: string | null; question: string; retrieval_config: RagLabRetrievalConfig;
  answer: string; sources: RagSource[]; confidence: number | null; abstained: boolean; latency_ms: number | null; created_at: string;
};
export type Pagination = { offset: number; limit: number; total: number; has_more: boolean };
export type RagLabExperimentListResponse = { items: RagLabExperiment[]; pagination: Pagination };
export type RagLabExperimentDetailResponse = { experiment: RagLabExperiment; files: RagLabFile[]; revisions: RagLabRevision[] };
export type RagLabChunkListResponse = { items: RagLabChunk[]; pagination: Pagination };
export type RagLabQueryResponse = { trial: RagLabTrial; answer: string; sources: RagSource[]; confidence: number; latency_ms: number };

export const defaultRagLabConfig: RagLabConfig = {
  chunking: { strategy: "structure_aware_v1", profile: "auto", max_tokens: 600, overlap_tokens: 100 },
  retrieval: { top_k: 5, candidate_count: 40, max_per_source: 0, duplicate_threshold: 0.82, min_context_score: 0, expand_neighbors: true },
};

export const canAccessRagLab = (role?: Role | null) => role === "admin";
export const ragLabWorkspaceHref = (experimentId: string) => `/admin/rag-lab/workspace?experimentId=${encodeURIComponent(experimentId)}`;
export const ragSourceLabel = (source: RagSource) => {
  const page = source.page_start == null ? "Page number unavailable" : source.page_end != null && source.page_end !== source.page_start ? `Pages ${source.page_start}–${source.page_end}` : `Page ${source.page_start}`;
  return [source.display_source, page, source.section_heading].filter(Boolean).join(" · ");
};
export const copyTrialRetrieval = (config: RagLabConfig, trial: Pick<RagLabTrial, "retrieval_config">): RagLabConfig => ({
  ...config,
  retrieval: structuredClone(trial.retrieval_config),
});
export const PUBLISH_CONFIRMATION_POINTS = [
  "The selected revision's documents will become available to regular chat.",
  "Draft revisions remain isolated.",
  "There is currently no unpublish or rollback action in this interface.",
  "Publishing a newer revision for the same experiment updates its production sources.",
];

export function validateRagLabFiles(files: Array<Pick<File, "name" | "size">>) {
  const supported = new Set(["pdf", "docx", "txt", "ppt", "pptx"]);
  if (!files.length) return "Choose at least one file.";
  if (files.length > 50) return "Choose no more than 50 files.";
  if (files.some(file => !supported.has(file.name.split(".").pop()?.toLowerCase() ?? ""))) return "Only PDF, DOCX, TXT, PPT, and PPTX files are supported.";
  if (files.some(file => file.size === 0)) return "Empty files cannot be uploaded.";
  if (files.some(file => file.size > 150 * 1024 * 1024)) return "Each file must be 150 MiB or smaller.";
  if (files.reduce((total, file) => total + file.size, 0) > 150 * 1024 * 1024) return "The combined upload must be 150 MiB or smaller.";
  return null;
}

export function validateRagLabConfig(config: RagLabConfig) {
  const errors: Record<string, string> = {};
  const integer = (value: number, min: number, max: number, key: string, label: string) => {
    if (!Number.isInteger(value) || value < min || value > max) errors[key] = `${label} must be an integer from ${min} to ${max}.`;
  };
  integer(config.chunking.max_tokens, 100, 2000, "max_tokens", "Maximum tokens");
  integer(config.chunking.overlap_tokens, 0, 500, "overlap_tokens", "Overlap tokens");
  if (config.chunking.overlap_tokens >= config.chunking.max_tokens) errors.overlap_tokens = "Overlap tokens must be smaller than maximum tokens.";
  integer(config.retrieval.top_k, 1, 20, "top_k", "Results");
  integer(config.retrieval.candidate_count, 1, 200, "candidate_count", "Candidate pool");
  if (config.retrieval.candidate_count < config.retrieval.top_k) errors.candidate_count = "Candidate pool must be at least as large as results.";
  integer(config.retrieval.max_per_source, 0, 20, "max_per_source", "Maximum results per source");
  if (config.retrieval.duplicate_threshold < 0 || config.retrieval.duplicate_threshold > 1) errors.duplicate_threshold = "Duplicate threshold must be from 0 to 1.";
  if (config.retrieval.min_context_score < 0 || config.retrieval.min_context_score > 1) errors.min_context_score = "Minimum context score must be from 0 to 1.";
  return errors;
}

export function makeRagLabUpload(files: File[]) {
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  return body;
}

const enc = encodeURIComponent;
export const listRagLabExperiments = (token: string, offset = 0, limit = 25, signal?: AbortSignal) => apiRequest<RagLabExperimentListResponse>(`/admin/rag-lab/experiments?offset=${offset}&limit=${limit}`, { token, signal });
export const createRagLabExperiment = async (token: string, payload: { name: string; description?: string | null; config?: RagLabConfig }) => {
  const response = await apiRequest<RagLabExperiment | { experiment: RagLabExperiment }>("/admin/rag-lab/experiments", { method: "POST", token, body: JSON.stringify(payload) });
  return "experiment" in response ? response.experiment : response;
};
export const getRagLabExperiment = (token: string, id: string, signal?: AbortSignal) => apiRequest<RagLabExperimentDetailResponse>(`/admin/rag-lab/experiments/${enc(id)}`, { token, signal });
export const updateRagLabExperiment = async (token: string, id: string, payload: Partial<Pick<RagLabExperiment, "name" | "description" | "config">>) => {
  const response = await apiRequest<RagLabExperiment | { experiment: RagLabExperiment }>(`/admin/rag-lab/experiments/${enc(id)}`, { method: "PATCH", token, body: JSON.stringify(payload) });
  return "experiment" in response ? response.experiment : response;
};
export const uploadRagLabFiles = (token: string, id: string, files: File[]) => apiRequest<unknown>(`/admin/rag-lab/experiments/${enc(id)}/files`, { method: "POST", token, body: makeRagLabUpload(files) });
export const createRagLabRevision = (token: string, id: string, config: RagLabConfig) => apiRequest<{ revision: RagLabRevision; job: IngestJob }>(`/admin/rag-lab/experiments/${enc(id)}/revisions`, { method: "POST", token, body: JSON.stringify({ config }) });
export const listRagLabChunks = (token: string, revisionId: string, offset = 0, limit = 50, signal?: AbortSignal) => apiRequest<RagLabChunkListResponse>(`/admin/rag-lab/revisions/${enc(revisionId)}/chunks?offset=${offset}&limit=${limit}&include_content=true`, { token, signal });
export const queryRagLabRevision = (token: string, revisionId: string, question: string, retrieval: RagLabRetrievalConfig) => apiRequest<RagLabQueryResponse>(`/admin/rag-lab/revisions/${enc(revisionId)}/query`, { method: "POST", token, body: JSON.stringify({ question, retrieval }) });
export const listRagLabTrials = (token: string, revisionId: string, signal?: AbortSignal) => apiRequest<{ items: RagLabTrial[] }>(`/admin/rag-lab/revisions/${enc(revisionId)}/queries?limit=50`, { token, signal });
export const publishRagLabRevision = (token: string, revisionId: string) => apiRequest<{ job: IngestJob }>(`/admin/rag-lab/revisions/${enc(revisionId)}/publish`, { method: "POST", token });

export type PollUpdate = { state: "queued" | "running" | "reconnecting" | "succeeded" | "failed"; job?: IngestJob; error?: string };
export class RagLabJobPoller {
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly getJob: (id: string) => Promise<IngestJob>, private readonly onUpdate: (update: PollUpdate) => void, private readonly delay = 1750) {}
  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.timer = null; }
  async start(jobId: string) {
    this.stop(); this.stopped = false; let failures = 0;
    while (!this.stopped) {
      try {
        const job = await this.getJob(jobId);
        if (this.stopped) return;
        failures = 0;
        this.onUpdate({ state: job.status, job });
        if (job.status === "succeeded" || job.status === "failed") return;
      } catch (error) {
        if (this.stopped) return;
        failures += 1;
        this.onUpdate({ state: "reconnecting", error: error instanceof Error ? error.message : "Connection lost." });
      }
      await new Promise<void>((resolve) => { this.timer = setTimeout(resolve, Math.min(this.delay * Math.max(1, failures), 8000)); });
    }
  }
}
