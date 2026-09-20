"use client";

import { AlertCircle, Download, Loader2, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatApiError } from "../../lib/auth-client";
import { ApiError, DocumentLibraryItem, downloadSourceDocument, listDocuments } from "../../lib/api";
import { displayTitle } from "../../lib/document-library";
import { getLegalSuggestion, incomingLegalRelationships, instrumentTypes, judicialStatuses, LegalProfile, LegalRelationship, normalizeLegalProfile, relationTypes, saveLegalProfile, validateRelationship } from "../../lib/legal";

type EditorTab = "metadata" | "relationships";
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
const blankRelationship = (): LegalRelationship => ({ target_document_id: "", relation: "refers_to", source_provision: "", target_provision: "", effective_date: null, evidence: "" });

export function LegalReview({ document, documents, profile, profiles, token, onClose, onOpenOwner, onSaved }: {
  document: DocumentLibraryItem; documents: DocumentLibraryItem[]; profile: LegalProfile | null;
  profiles: Record<string, LegalProfile>; token: string; onClose: () => void; onOpenOwner: (document: DocumentLibraryItem) => void; onSaved: (profile: LegalProfile) => void;
}) {
  const original = useMemo(() => normalizeLegalProfile(profile), [profile]);
  const [draft, setDraft] = useState<LegalProfile>(() => structuredClone(original));
  const [tab, setTab] = useState<EditorTab>("metadata");
  const [suggestion, setSuggestion] = useState<LegalProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [targets, setTargets] = useState<DocumentLibraryItem[]>(documents.filter(item => item.id !== document.id));
  const [relationshipErrors, setRelationshipErrors] = useState<Record<number, string>>({});
  const searchSequence = useRef(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  const incoming = useMemo(() => incomingLegalRelationships(document.id, profiles), [document.id, profiles]);
  const nameFor = (id: string) => documents.find(item => item.id === id)?.title || targets.find(item => item.id === id)?.title || id;

  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  useEffect(() => {
    if (!search.trim()) { setTargets(documents.filter(item => item.id !== document.id)); return; }
    const sequence = ++searchSequence.current; const controller = new AbortController();
    const timer = window.setTimeout(() => void listDocuments(token, { status: "indexed", search: search.trim(), sort_by: "title", sort_order: "asc", offset: 0, limit: 25 }, controller.signal).then(result => {
      if (sequence === searchSequence.current) setTargets(result.items.filter(item => item.id !== document.id));
    }).catch(err => { if (!(err instanceof DOMException && err.name === "AbortError") && sequence === searchSequence.current) setError(formatApiError(err, "Unable to search documents.")); }), 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [document.id, documents, search, token]);

  function close() { if (!dirty || window.confirm("Discard unsaved legal metadata and relationship changes?")) onClose(); }
  async function loadSuggestion() {
    if (busy) return; setBusy("suggestion"); setError(null); setNotice(null);
    try { setSuggestion(normalizeLegalProfile(await getLegalSuggestion(token, document.id))); }
    catch (err) { setError(formatApiError(err, "Unable to load a legal profile suggestion.")); }
    finally { setBusy(null); }
  }
  function applySuggestion() {
    if (!suggestion) return;
    setDraft(structuredClone(suggestion)); setSuggestion(null); setNotice("Suggestion applied to the unsaved draft. Review it before saving.");
  }
  async function save(reviewed: boolean) {
    if (busy) return;
    const errors = Object.fromEntries(draft.relationships.map((link, index) => [index, validateRelationship(link, document.id)]).filter(([, value]) => value));
    setRelationshipErrors(errors as Record<number, string>);
    if (Object.keys(errors).length) { setTab("relationships"); setError("Fix relationship validation errors before saving."); return; }
    setBusy(reviewed ? "review" : "draft"); setError(null); setNotice(null);
    const payload = { ...structuredClone(draft), reviewed };
    try {
      const response = await saveLegalProfile(token, document.id, payload);
      const saved = normalizeLegalProfile(response && "profile" in response ? response.profile : response);
      setDraft(saved); onSaved(saved); setNotice(reviewed ? "Profile marked reviewed and saved." : "Draft saved as unreviewed.");
    } catch (err) {
      const prefix = err instanceof ApiError && (err.status === 403 || err.status === 503) ? "Registry writes may be disabled on this deployment. Your unsaved draft has been retained. " : "Your unsaved draft has been retained. ";
      setError(prefix + formatApiError(err, "Unable to save the legal profile."));
    } finally { setBusy(null); }
  }
  function updateRelationship(index: number, patch: Partial<LegalRelationship>) { setDraft(value => ({ ...value, relationships: value.relationships.map((link, i) => i === index ? { ...link, ...patch } : link) })); }
  async function openDocument(target: DocumentLibraryItem) {
    try { const blob = await downloadSourceDocument(token, target.id); const url = URL.createObjectURL(blob); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    catch (err) { setError(formatApiError(err, "Unable to open the linked document.")); }
  }

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/35" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <aside aria-label={`Legal review for ${displayTitle(document)}`} aria-modal="true" className="h-full w-full overflow-y-auto bg-surface p-5 shadow-2xl lg:w-[860px]" role="dialog">
      <header className="flex items-start justify-between gap-4 border-b border-outline-variant pb-4"><div><p className="text-xs font-bold uppercase text-[#626b79]">Admin-only legal review</p><h2 className="mt-1 text-2xl font-bold text-primary">{displayTitle(document)}</h2><p className="mt-1 break-all text-xs text-[#626b79]">{document.filename}</p></div><button aria-label="Close legal review" className="grid h-11 w-11 place-items-center rounded hover:bg-surface-container" onClick={close}><X className="h-5 w-5" /></button></header>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><nav className="flex border-b border-outline-variant" aria-label="Legal review sections"><Tab active={tab === "metadata"} onClick={() => setTab("metadata")}>Legal metadata</Tab><Tab active={tab === "relationships"} onClick={() => setTab("relationships")}>Relationships ({draft.relationships.length})</Tab></nav><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void loadSuggestion()}>{busy === "suggestion" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Load suggestion</button></div>
      {error ? <div className="mt-4 flex gap-2 rounded border border-[#f0c4b6] bg-[#fff5f1] p-3 text-sm text-[#743f2c]" role="alert"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div> : null}
      {notice ? <div className="mt-4 rounded border border-[#b7d6c4] bg-[#edf8f1] p-3 text-sm text-primary" role="status">{notice}</div> : null}
      {suggestion ? <section className="mt-4 rounded border border-[#c8d3e7] bg-[#f4f7fc] p-4"><h3 className="font-bold text-primary">Suggested unsaved profile</h3><p className="mt-1 text-sm text-[#4e5966]">Review this summary before applying. Existing metadata, relationships, and unsaved edits will not change until you choose Apply suggestion.</p><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><Fact label="Instrument" value={titleCase(suggestion.instrument_type)} /><Fact label="Jurisdiction" value={suggestion.jurisdiction || "—"} /><Fact label="Relationships" value={suggestion.relationships.length} /></dl><div className="mt-4 flex gap-2"><button className="primary-button" onClick={applySuggestion}>Apply suggestion</button><button className="secondary-button" onClick={() => setSuggestion(null)}>Dismiss</button></div></section> : null}

      {tab === "metadata" ? <fieldset className="mt-6 grid gap-4 sm:grid-cols-2" disabled={Boolean(busy)}>
        <Field label="Instrument type"><select className="field" value={draft.instrument_type} onChange={e => setDraft(v => ({ ...v, instrument_type: e.target.value as LegalProfile["instrument_type"] }))}>{instrumentTypes.map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
        <Field label="Judicial status"><select className="field" value={draft.judicial_status} onChange={e => setDraft(v => ({ ...v, judicial_status: e.target.value as LegalProfile["judicial_status"] }))}>{judicialStatuses.map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
        <Field label="Issued date"><input className="field" type="date" value={draft.issued_date ?? ""} onChange={e => setDraft(v => ({ ...v, issued_date: e.target.value || null }))} /></Field>
        <Field label="Effective date"><input className="field" type="date" value={draft.effective_date ?? ""} onChange={e => setDraft(v => ({ ...v, effective_date: e.target.value || null }))} /></Field>
        <Field label="Jurisdiction"><input className="field" value={draft.jurisdiction ?? ""} onChange={e => setDraft(v => ({ ...v, jurisdiction: e.target.value || null }))} /></Field>
        <Field label="Enabling provision"><input className="field" value={draft.enabling_provision ?? ""} onChange={e => setDraft(v => ({ ...v, enabling_provision: e.target.value || null }))} /></Field>
        <Field label="Identifiers (one per line)" wide><textarea className="field min-h-24" value={draft.identifiers.join("\n")} onChange={e => setDraft(v => ({ ...v, identifiers: e.target.value.split("\n").map(item => item.trim()).filter(Boolean) }))} /></Field>
        <Field label="Notes" wide><textarea className="field min-h-28" value={draft.notes ?? ""} onChange={e => setDraft(v => ({ ...v, notes: e.target.value || null }))} /></Field>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input checked={draft.reviewed} className="h-5 w-5" disabled readOnly type="checkbox" />Current saved review status (changed only by the save actions below)</label>
      </fieldset> : <section className="mt-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-bold text-primary">Outgoing relationships</h3><p className="mt-1 text-sm text-[#626b79]">These belong to this document and are saved as part of the complete profile.</p></div><button className="secondary-button" onClick={() => setDraft(v => ({ ...v, relationships: [...v.relationships, blankRelationship()] }))}><Plus className="h-4 w-4" />Add relationship</button></div>
        <label className="mt-4 block text-sm font-semibold">Search target documents<input className="field mt-2" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title or filename" /></label>
        <div className="mt-4 space-y-4">{draft.relationships.length ? draft.relationships.map((link, index) => <div className="rounded border border-outline-variant bg-white p-4" key={index}><div className="grid gap-4 sm:grid-cols-2"><Field label="Target document"><select className="field" value={link.target_document_id} onChange={e => updateRelationship(index, { target_document_id: e.target.value })}><option value="">Choose a document</option>{link.target_document_id && !targets.some(item => item.id === link.target_document_id) ? <option value={link.target_document_id}>{nameFor(link.target_document_id)}</option> : null}{targets.map(item => <option key={item.id} value={item.id}>{displayTitle(item)}</option>)}</select></Field><Field label="Relationship"><select className="field" value={link.relation} onChange={e => updateRelationship(index, { relation: e.target.value as LegalRelationship["relation"] })}>{relationTypes.map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field><Field label="Source provision"><input className="field" required value={link.source_provision} onChange={e => updateRelationship(index, { source_provision: e.target.value })} /></Field><Field label="Target provision"><input className="field" required value={link.target_provision} onChange={e => updateRelationship(index, { target_provision: e.target.value })} /></Field><Field label="Effective date"><input className="field" type="date" value={link.effective_date ?? ""} onChange={e => updateRelationship(index, { effective_date: e.target.value || null })} /></Field><Field label="Evidence"><textarea className="field min-h-20" required value={link.evidence} onChange={e => updateRelationship(index, { evidence: e.target.value })} /></Field></div>{relationshipErrors[index] ? <p className="mt-3 text-sm font-semibold text-[#8d3f27]">{relationshipErrors[index]}</p> : null}<div className="mt-3 flex justify-end gap-2">{link.target_document_id ? <button className="secondary-button" onClick={() => { const target = [...documents, ...targets].find(item => item.id === link.target_document_id); if (target) void openDocument(target); }}><Download className="h-4 w-4" />Open document</button> : null}<button className="secondary-button text-[#8d3f27]" onClick={() => setDraft(v => ({ ...v, relationships: v.relationships.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" />Remove</button></div></div>) : <p className="rounded border border-dashed border-outline-variant p-6 text-center text-sm text-[#626b79]">No outgoing relationships.</p>}</div>
        {incoming.length ? <div className="mt-7"><h3 className="text-lg font-bold text-primary">Incoming relationships</h3><p className="mt-1 text-sm text-[#626b79]">Read-only here. Open the owning document to edit.</p><div className="mt-3 space-y-2">{incoming.map(({ owner_document_id, relationship }, index) => { const owner = documents.find(item => item.id === owner_document_id); return <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-outline-variant bg-surface-container-low p-3 text-sm" key={`${owner_document_id}-${index}`}><span><strong>{nameFor(owner_document_id)}</strong> {titleCase(relationship.relation)} this document · {relationship.source_provision} → {relationship.target_provision}</span>{owner ? <button className="secondary-button" onClick={() => { if (!dirty || window.confirm("Discard unsaved changes and open the owning document?")) onOpenOwner(owner); }}>Open owning review</button> : null}</div>; })}</div></div> : null}
      </section>}
      <footer className="sticky bottom-0 mt-8 flex flex-wrap justify-end gap-3 border-t border-outline-variant bg-surface/95 py-4"><span className="mr-auto self-center text-xs text-[#626b79]">{dirty ? "Unsaved changes" : "No unsaved changes"}</span><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void save(false)}>{busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save draft</button><button className="primary-button" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Mark this complete profile as reviewed and save it?")) void save(true); }}>{busy === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Mark reviewed and save</button></footer>
    </aside>
  </div>;
}

function Tab({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) { return <button aria-current={active ? "page" : undefined} className={`min-h-11 border-b-2 px-4 text-sm font-bold ${active ? "border-primary text-primary" : "border-transparent text-[#626b79]"}`} onClick={onClick}>{children}</button>; }
function Field({ children, label, wide = false }: { children: React.ReactNode; label: string; wide?: boolean }) { return <label className={`block text-sm font-semibold text-[#414844] ${wide ? "sm:col-span-2" : ""}`}>{label}<span className="mt-2 block">{children}</span></label>; }
function Fact({ label, value }: { label: string; value: React.ReactNode }) { return <div><dt className="text-xs font-bold uppercase text-[#626b79]">{label}</dt><dd className="mt-1">{value}</dd></div>; }
