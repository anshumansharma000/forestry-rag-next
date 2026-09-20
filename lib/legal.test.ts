import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentLibraryItem } from "./api";
import { canReviewLegalMetadata, emptyLegalProfile, filterLegalPage, incomingLegalRelationships, joinLegalProfiles, makeLegalProfilePayload, previewLegalRetrieval, saveLegalProfile, validateLegalPreview, validateRelationship } from "./legal";

const document = (id: string): DocumentLibraryItem => ({ id, filename: `${id}.pdf`, title: id, kind: "pdf", page_count: 1, document_type: "act", authority: null, years: [], chunk_count: 1, status: "indexed", ingest_error: null, retryable: false, ingested_at: null, created_at: null, updated_at: null });
afterEach(() => vi.unstubAllGlobals());

describe("legal document annotations", () => {
  it("distinguishes missing, unknown, unreviewed, and reviewed profiles", () => {
    const unknown = emptyLegalProfile();
    const reviewed = { ...emptyLegalProfile(), instrument_type: "act" as const, reviewed: true };
    const joined = joinLegalProfiles([document("missing"), document("unknown"), document("reviewed")], { unknown, reviewed });
    expect(joined.map(item => [item.legalStatus, item.legalProfile?.instrument_type])).toEqual([["no_profile", undefined], ["unreviewed", "unknown"], ["reviewed", "act"]]);
    expect(filterLegalPage(joined, "unknown", "needs_review").map(item => item.id)).toEqual(["unknown"]);
  });
  it("keeps controls admin-only", () => expect(["viewer", "officer", "knowledge_manager"].every(role => !canReviewLegalMetadata(role as never))).toBe(true));
});

describe("complete profile writes", () => {
  it("preserves both-tab fields and sets review state only from the explicit action", () => {
    const draft = { ...emptyLegalProfile(), notes: "keep", relationships: [{ target_document_id: "b", relation: "amends" as const, source_provision: "s1", target_provision: "s2", effective_date: null, evidence: "text" }] };
    expect(makeLegalProfilePayload(draft, false)).toMatchObject({ reviewed: false, notes: "keep", relationships: draft.relationships });
    expect(makeLegalProfilePayload(draft, true).reviewed).toBe(true);
  });
  it("validates relationships and self-links", () => {
    const base = { target_document_id: "a", relation: "amends" as const, source_provision: "", target_provision: "target", effective_date: null, evidence: "e" };
    expect(validateRelationship(base, "a")).toMatch(/itself/);
    expect(validateRelationship({ ...base, target_document_id: "b" }, "a")).toMatch(/Source provision/);
  });
  it("derives incoming links without changing their owning profile", () => {
    const relationship = { target_document_id: "target", relation: "clarifies" as const, source_provision: "s", target_provision: "t", effective_date: null, evidence: "e" };
    expect(incomingLegalRelationships("target", { owner: { ...emptyLegalProfile(), relationships: [relationship] } })).toEqual([{ owner_document_id: "owner", relationship }]);
  });
  it("sends the entire replacement payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(emptyLegalProfile()), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    await saveLegalProfile("token", "doc/id", { ...emptyLegalProfile(), notes: "keep" });
    expect(fetchMock.mock.calls[0][0]).toContain("/admin/legal/profiles/doc%2Fid");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ notes: "keep", reviewed: false, relationships: [] });
  });
});

describe("legal preview", () => {
  it("omits blank optional inputs and supports retrieval-only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sources: [], abstained: false }), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    await previewLegalRetrieval("token", { question: "Question", generate_answer: false });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ question: "Question", generate_answer: false });
    expect(validateLegalPreview({ question: "x", top_k: 21, generate_answer: true })).toMatch(/1 to 20/);
  });
});
