"use client";

import { Loader2 } from "lucide-react";
import { RagLabConfig, RagLabExperimentStatus, RagLabRevisionStatus } from "../../../lib/rag-lab";

const labels: Record<RagLabExperimentStatus | RagLabRevisionStatus, string> = {
  draft: "Draft", queued: "Queued", building: "Building", ready: "Ready to test", publishing: "Publishing",
  published: "Published", failed: "Failed", archived: "Archived",
};
const tones: Record<string, string> = {
  draft: "border-[#ccd2ce] bg-[#f3f4f5] text-[#4e5966]", queued: "border-[#c8d3e7] bg-[#f2f6ff] text-[#345078]",
  building: "border-[#c8d3e7] bg-[#f2f6ff] text-[#345078]", ready: "border-[#b7d6c4] bg-[#edf8f1] text-primary",
  publishing: "border-[#e0cfa9] bg-[#fff9e9] text-[#6c551d]", published: "border-[#9bc9ad] bg-[#e7f7ed] text-primary",
  failed: "border-[#f0c4b6] bg-[#fff5f1] text-[#743f2c]", archived: "border-[#ccd2ce] bg-[#f3f4f5] text-[#4e5966]",
};

export function StatusBadge({ status }: { status: RagLabExperimentStatus | RagLabRevisionStatus }) {
  const active = status === "building" || status === "publishing" || status === "queued";
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${tones[status]}`}>
    {active ? <Loader2 className="h-3 w-3 animate-spin" /> : null}{labels[status]}
  </span>;
}

export function ConfigEditor({ config, disabled, errors = {}, onChange, retrievalOnly = false }: {
  config: RagLabConfig; disabled?: boolean; errors?: Record<string, string>; onChange: (config: RagLabConfig) => void; retrievalOnly?: boolean;
}) {
  const chunk = <K extends keyof RagLabConfig["chunking"]>(key: K, value: RagLabConfig["chunking"][K]) => onChange({ ...config, chunking: { ...config.chunking, [key]: value } });
  const retrieval = <K extends keyof RagLabConfig["retrieval"]>(key: K, value: RagLabConfig["retrieval"][K]) => onChange({ ...config, retrieval: { ...config.retrieval, [key]: value } });
  const numberProps = (key: string) => ({ "aria-describedby": errors[key] ? `${key}-error` : undefined, "aria-invalid": Boolean(errors[key]) });
  return <div className={retrievalOnly ? "" : "grid gap-6 lg:grid-cols-2"}>
    {!retrievalOnly ? <fieldset className="space-y-4" disabled={disabled}>
      <legend className="text-lg font-bold text-primary">Chunking</legend>
      <Field label="Strategy" help="Controls how each document is divided into searchable pieces. Structure-aware v1 keeps headings, lists, and related paragraphs together where possible."><input className="field bg-surface-container-low" readOnly value="Structure-aware v1" /></Field>
      <Field label="Profile" help="Tells the system what kind of document structure to expect. Auto is the safest choice when your files contain a mix of formats."><select className="field" value={config.chunking.profile} onChange={(e) => chunk("profile", e.target.value as RagLabConfig["chunking"]["profile"])}>{["auto", "section", "faq", "procedure"].map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}</select></Field>
      <Field label="Maximum tokens" help="Sets the approximate maximum size of each searchable piece. Smaller pieces are more focused; larger pieces preserve more surrounding context." error={errors.max_tokens}><input className="field" type="number" min={100} max={2000} value={config.chunking.max_tokens} onChange={(e) => chunk("max_tokens", Number(e.target.value))} {...numberProps("max_tokens")} /></Field>
      <Field label="Overlap tokens" help="Repeats a small amount of text between neighboring pieces so information at a split is not lost. More overlap can also create more repetition. It must be smaller than maximum tokens." error={errors.overlap_tokens}><input className="field" type="number" min={0} max={500} value={config.chunking.overlap_tokens} onChange={(e) => chunk("overlap_tokens", Number(e.target.value))} {...numberProps("overlap_tokens")} /></Field>
    </fieldset> : null}
    <fieldset className="space-y-4" disabled={disabled}>
      {!retrievalOnly ? <legend className="text-lg font-bold text-primary">Retrieval</legend> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Results" help="Sets how many of the best matching pieces are given to the assistant for its answer. More results add context but may also add unrelated information." error={errors.top_k}><input className="field" type="number" min={1} max={20} value={config.retrieval.top_k} onChange={(e) => retrieval("top_k", Number(e.target.value))} {...numberProps("top_k")} /></Field>
        <Field label="Candidate pool" help="Sets how many possible matches are considered before the best results are chosen. A larger pool may find better evidence but can take longer. Keep it at least as large as Results." error={errors.candidate_count}><input className="field" type="number" min={1} max={200} value={config.retrieval.candidate_count} onChange={(e) => retrieval("candidate_count", Number(e.target.value))} {...numberProps("candidate_count")} /></Field>
        <Field label="Maximum per source" help="Limits how many results can come from one file, helping include evidence from different files. Zero means there is no limit." error={errors.max_per_source}><input className="field" type="number" min={0} max={20} value={config.retrieval.max_per_source} onChange={(e) => retrieval("max_per_source", Number(e.target.value))} {...numberProps("max_per_source")} /></Field>
        <Field label="Duplicate threshold" help="Controls when two very similar pieces are treated as duplicates. A lower value removes similar results more aggressively; a higher value keeps more of them." error={errors.duplicate_threshold}><input className="field" type="number" min={0} max={1} step="0.01" value={config.retrieval.duplicate_threshold} onChange={(e) => retrieval("duplicate_threshold", Number(e.target.value))} {...numberProps("duplicate_threshold")} /></Field>
        <Field label="Minimum context score" help="Rejects matches below this relevance score. Zero accepts all matches; raising it can reduce weak evidence but may cause more unanswered questions." error={errors.min_context_score}><input className="field" type="number" min={0} max={1} step="0.01" value={config.retrieval.min_context_score} onChange={(e) => retrieval("min_context_score", Number(e.target.value))} {...numberProps("min_context_score")} /></Field>
      </div>
      <label className="block min-h-11"><span className="flex items-center gap-3 text-sm font-semibold"><input checked={config.retrieval.expand_neighbors} className="h-5 w-5 accent-primary" type="checkbox" onChange={(e) => retrieval("expand_neighbors", e.target.checked)} />Expand neighboring chunks</span><span className="mt-1 block pl-8 text-xs leading-5 text-[#626b79]">Also includes the pieces immediately before and after a match. This can make answers easier to understand, but adds more text for the assistant to review.</span></label>
    </fieldset>
  </div>;
}

function Field({ children, error, help, label }: { children: React.ReactNode; error?: string; help?: string; label: string }) {
  return <label className="block"><span className="text-sm font-semibold text-[#414844]">{label}</span><span className="mt-1.5 block">{children}</span>{help ? <span className="mt-1 block text-xs text-[#626b79]">{help}</span> : null}{error ? <span className="mt-1 block text-xs font-semibold text-[#8d3f27]" id={`${label.toLowerCase().replaceAll(" ", "_")}-error`}>{error}</span> : null}</label>;
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" | "success" }) {
  const css = tone === "error" ? "border-[#f0c4b6] bg-[#fff5f1] text-[#743f2c]" : tone === "success" ? "border-[#b7d6c4] bg-[#edf8f1] text-primary" : "border-[#c8d3e7] bg-[#f4f7fc] text-[#345078]";
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded border px-4 py-3 text-sm ${css}`}>{children}</div>;
}
