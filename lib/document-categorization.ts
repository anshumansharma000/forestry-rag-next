import { apiRequest } from "./api";

export const DOCUMENT_CATEGORIES = [
  "policy", "constitution", "act", "amendment", "rules", "consolidated_guidelines",
  "guidelines", "circular", "clarification", "notification", "judgment_order", "handbook", "other",
] as const;
export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];
export type CategoryOption = { value: DocumentCategory; label: string };
export type CategorizationInput = {
  document_type?: DocumentCategory | null;
  subjects?: string[] | null;
  issuing_authority?: string | null;
  jurisdiction?: string | null;
  state?: string | null;
  issued_date?: string | null;
  effective_date?: string | null;
  consolidation_as_of?: string | null;
  identifiers?: string[] | null;
};
export type CategorizationField = keyof CategorizationInput;
export type DocumentCategorization = {
  version: number;
  values: CategorizationInput;
  overrides?: CategorizationInput;
  field_sources?: Partial<Record<CategorizationField, "inferred" | "manual">>;
  evidence?: Partial<Record<CategorizationField, Array<{ page: number | null; text: string }>>>;
  review_required?: boolean;
  missing_fields?: CategorizationField[];
};
export const METADATA_FIELDS = [
  { key: "subjects", label: "Subjects", kind: "list", hint: "One per line, e.g. Forest conservation / FCA" },
  { key: "issuing_authority", label: "Issuing authority", kind: "text", hint: "Ministry, department, or court" },
  { key: "jurisdiction", label: "Jurisdiction", kind: "text", hint: "For example, National" },
  { key: "state", label: "State", kind: "text", hint: "If applicable" },
  { key: "issued_date", label: "Issue date", kind: "date" },
  { key: "effective_date", label: "Effective date", kind: "date" },
  { key: "consolidation_as_of", label: "Consolidated as of", kind: "date" },
  { key: "identifiers", label: "Legal identifiers", kind: "list", hint: "One per line, e.g. Rule 7 or Section 2" },
] as const;
export type CategorizationDraft = Record<CategorizationField, string>;
const ALL_FIELDS: CategorizationField[] = ["document_type", ...METADATA_FIELDS.map(field => field.key)];
const LIST_FIELDS = new Set<CategorizationField>(["subjects", "identifiers"]);

export function categorizationDraft(values: CategorizationInput = {}): CategorizationDraft {
  return Object.fromEntries(ALL_FIELDS.map(key => {
    const value = values[key];
    return [key, Array.isArray(value) ? value.join("\n") : value ?? ""];
  })) as CategorizationDraft;
}

function draftValue(key: CategorizationField, value: string) {
  const text = value.trim();
  if (LIST_FIELDS.has(key)) return text ? text.split(/\r?\n/).map(item => item.trim()).filter(Boolean) : [];
  return text || null;
}

export function uploadCategorization(draft: CategorizationDraft): CategorizationInput | undefined {
  const entries = ALL_FIELDS.map(key => [key, draftValue(key, draft[key])] as const)
    .filter(([, value]) => value !== null && (!Array.isArray(value) || value.length > 0));
  return entries.length ? Object.fromEntries(entries) as CategorizationInput : undefined;
}

export function categorizationPatch(
  draft: CategorizationDraft, original: CategorizationInput, acceptSuggestions = false,
): CategorizationInput {
  return Object.fromEntries(ALL_FIELDS.flatMap(key => {
    const value = draftValue(key, draft[key]);
    const previous = original[key] ?? (LIST_FIELDS.has(key) ? [] : null);
    const changed = JSON.stringify(value) !== JSON.stringify(previous);
    return changed || (acceptSuggestions && original[key] != null) ? [[key, value]] : [];
  })) as CategorizationInput;
}

export function validateCategorizationDraft(draft: CategorizationDraft, categories: CategoryOption[]): string | null {
  if (draft.document_type && !categories.some(category => category.value === draft.document_type)) return "Choose an available category.";
  for (const field of METADATA_FIELDS) {
    const text = draft[field.key].trim();
    if (!text) continue;
    if (field.kind === "date") {
      const parsed = new Date(`${text}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
        return `Enter a valid ${field.label.toLowerCase()}.`;
      }
    } else if (field.kind === "list") {
      const items = text.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
      const limit = field.key === "subjects" ? 30 : 100;
      if (items.length > limit || items.some(item => item.length > 500)) return `${field.label} allows up to ${limit} entries of 500 characters each.`;
    } else if (text.length > 500) return `${field.label} must be 500 characters or fewer.`;
  }
  return null;
}

export const listDocumentCategories = (token: string, signal?: AbortSignal) =>
  apiRequest<{ categories: CategoryOption[] }>("/documents/categories", { token, signal });
export const getDocumentCategorization = (token: string, id: string, signal?: AbortSignal) =>
  apiRequest<{ document_id: string; categorization: DocumentCategorization | null }>(
    `/documents/${encodeURIComponent(id)}/categorization`, { token, signal },
  );
export const saveDocumentCategorization = (token: string, id: string, categorization: CategorizationInput) =>
  apiRequest<{ document_id: string; categorization: DocumentCategorization }>(
    `/documents/${encodeURIComponent(id)}/categorization`, { token, method: "PATCH", body: JSON.stringify(categorization) },
  );

export function categoryLabel(value?: string | null, options: CategoryOption[] = []) {
  if (!value) return "Uncategorized";
  return options.find(option => option.value === value)?.label
    ?? (value === "judgment_order" ? "Judgment / Court Order"
      : value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase()));
}
