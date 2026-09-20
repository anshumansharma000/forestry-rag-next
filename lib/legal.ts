"use client";

import { apiRequest, AnswerOutcome, DocumentLibraryItem, Source } from "./api";
import type { Role } from "./api";

export const instrumentTypes = ["unknown", "handbook", "act", "rules", "amendment", "guideline", "notification", "clarification", "instruction", "judicial"] as const;
export const judicialStatuses = ["unknown", "interim", "final", "modified", "stayed", "set_aside"] as const;
export const relationTypes = ["amends", "supersedes", "repeals", "interprets", "stays", "clarifies", "refers_to"] as const;
export type InstrumentType = typeof instrumentTypes[number];
export type JudicialStatus = typeof judicialStatuses[number];
export type RelationType = typeof relationTypes[number];

export type LegalRelationship = {
  target_document_id: string;
  relation: RelationType;
  source_provision: string;
  target_provision: string;
  effective_date: string | null;
  evidence: string;
};

export type LegalProfile = {
  instrument_type: InstrumentType;
  issued_date: string | null;
  effective_date: string | null;
  jurisdiction: string | null;
  enabling_provision: string | null;
  judicial_status: JudicialStatus;
  identifiers: string[];
  notes: string | null;
  reviewed: boolean;
  relationships: LegalRelationship[];
};

export type LegalProfilesResponse = { namespace: string; profiles: Record<string, LegalProfile> };
export type LegalReviewStatus = "no_profile" | "unreviewed" | "reviewed";
export type AnnotatedDocument = DocumentLibraryItem & { legalProfile: LegalProfile | null; legalStatus: LegalReviewStatus };

export type LegalPreviewRequest = { question: string; top_k?: number; as_of?: string; jurisdiction?: string; generate_answer: boolean };
export type LegalPreviewReview = {
  missing_reviewed_evidence_categories?: string[];
  relationships_missing_selected_evidence?: unknown[];
  relationship_search_truncated?: boolean;
  [key: string]: unknown;
};
export type LegalPreviewResponse = {
  answer?: string | null;
  sources?: Source[];
  cited_sources?: Source[];
  confidence?: number | null;
  abstained?: boolean;
  outcome: AnswerOutcome;
  review?: LegalPreviewReview | null;
  evidence?: Record<string, unknown> | null;
};

export const canReviewLegalMetadata = (role?: Role | null) => role === "admin";
export const emptyLegalProfile = (): LegalProfile => ({
  instrument_type: "unknown", issued_date: null, effective_date: null, jurisdiction: null,
  enabling_provision: null, judicial_status: "unknown", identifiers: [], notes: null,
  reviewed: false, relationships: [],
});
export function normalizeLegalProfile(profile?: Partial<LegalProfile> | null): LegalProfile {
  const fallback = emptyLegalProfile();
  return { ...fallback, ...profile, identifiers: Array.isArray(profile?.identifiers) ? profile.identifiers : [], relationships: Array.isArray(profile?.relationships) ? profile.relationships : [] };
}
export function joinLegalProfiles(documents: DocumentLibraryItem[], profiles: Record<string, LegalProfile>): AnnotatedDocument[] {
  return documents.map(document => {
    const profile = profiles[document.id] ? normalizeLegalProfile(profiles[document.id]) : null;
    return { ...document, legalProfile: profile, legalStatus: !profile ? "no_profile" : profile.reviewed ? "reviewed" : "unreviewed" };
  });
}
export function filterLegalPage(documents: AnnotatedDocument[], instrument: InstrumentType | "", review: LegalReviewStatus | "" | "needs_review") {
  return documents.filter(document => (!instrument || document.legalProfile?.instrument_type === instrument) && (!review || (review === "needs_review" ? document.legalStatus !== "reviewed" : document.legalStatus === review)));
}
export function validateRelationship(relationship: LegalRelationship, ownerId: string) {
  if (!relationship.target_document_id) return "Choose a target document.";
  if (relationship.target_document_id === ownerId) return "A document cannot link to itself.";
  if (!relationship.source_provision.trim()) return "Source provision is required.";
  if (!relationship.target_provision.trim()) return "Target provision is required.";
  if (!relationship.evidence.trim()) return "Evidence is required.";
  return null;
}
export function incomingLegalRelationships(documentId: string, profiles: Record<string, LegalProfile>) {
  return Object.entries(profiles).flatMap(([owner_document_id, profile]) => profile.relationships
    .filter(relationship => relationship.target_document_id === documentId)
    .map(relationship => ({ owner_document_id, relationship })));
}
export function makeLegalProfilePayload(profile: LegalProfile, reviewed: boolean): LegalProfile {
  return { ...structuredClone(profile), reviewed };
}
export function validateLegalPreview(input: LegalPreviewRequest) {
  if (!input.question.trim()) return "Question is required.";
  if (input.top_k != null && (!Number.isInteger(input.top_k) || input.top_k < 1 || input.top_k > 20)) return "Results must be an integer from 1 to 20.";
  return null;
}

const enc = encodeURIComponent;
export const listLegalProfiles = (token: string, signal?: AbortSignal) => apiRequest<LegalProfilesResponse>("/admin/legal/profiles", { token, signal });
export const getLegalSuggestion = (token: string, documentId: string, signal?: AbortSignal) => apiRequest<LegalProfile>(`/admin/legal/profiles/${enc(documentId)}/suggestion`, { token, signal });
export const saveLegalProfile = (token: string, documentId: string, profile: LegalProfile) => apiRequest<LegalProfile | { profile: LegalProfile }>(`/admin/legal/profiles/${enc(documentId)}`, { method: "PUT", token, body: JSON.stringify(profile) });
export const previewLegalRetrieval = (token: string, payload: LegalPreviewRequest, signal?: AbortSignal) => apiRequest<LegalPreviewResponse>("/admin/legal/preview", { method: "POST", token, signal, body: JSON.stringify(payload) });
