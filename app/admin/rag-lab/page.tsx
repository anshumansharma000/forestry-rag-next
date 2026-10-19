"use client";

import { Beaker, ChevronLeft, ChevronRight, Loader2, Plus, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { SidebarPageShell } from "../../../components/app-sidebar";
import { ensureFreshAuth, formatApiError, loadStoredSession } from "../../../lib/auth-client";
import { ApiError, AuthState } from "../../../lib/api";
import { createRagLabExperiment, defaultRagLabConfig, listRagLabExperiments, RagLabExperimentListResponse } from "../../../lib/rag-lab";
import { Notice, StatusBadge } from "./rag-lab-ui";
import { LegalPreview } from "./legal-preview";

const LIMIT = 25;
const when = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function RagLabListPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [data, setData] = useState<RagLabExperimentListResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [view, setView] = useState<"experiments" | "legal">("experiments");
  const authRef = useRef<AuthState | null>(null);

  useEffect(() => { let active = true; void loadStoredSession().then((session) => {
    if (!active) return; if (!session) { window.location.assign("/login"); return; }
    authRef.current = session; setAuth(session); if (session.user.role !== "admin") { setForbidden(true); setLoading(false); }
  }).catch((e) => { if (active) { setError(formatApiError(e)); setLoading(false); } }); return () => { active = false; }; }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!authRef.current || authRef.current.user.role !== "admin") return;
    data ? setUpdating(true) : setLoading(true); setError(null);
    try { const fresh = await ensureFreshAuth(authRef.current); authRef.current = fresh; setAuth(fresh); setData(await listRagLabExperiments(fresh.access_token, offset, LIMIT, signal)); }
    catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; if (e instanceof ApiError && e.status === 403) setForbidden(true); else setError(formatApiError(e, "Unable to load experiments.")); }
    finally { setLoading(false); setUpdating(false); }
  }, [data, offset]);

  useEffect(() => { if (!auth || forbidden) return; const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [auth?.user.id, forbidden, offset]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || creating) return; setCreating(true); setError(null);
    try { const fresh = await ensureFreshAuth(authRef.current); authRef.current = fresh; const created = await createRagLabExperiment(fresh.access_token, { name: name.trim(), description: description.trim() || null, config: defaultRagLabConfig }); window.location.assign(`/admin/rag-lab/workspace?experimentId=${encodeURIComponent(created.id)}`); }
    catch (e) { setError(formatApiError(e, "Unable to create experiment.")); setCreating(false); }
  }

  if (forbidden) return <SidebarPageShell activePath="/admin/rag-lab" user={auth?.user ?? null}><main className="grid min-h-[calc(100vh-72px)] place-items-center bg-surface p-6"><div className="max-w-md"><Notice tone="error"><strong>Admin access required.</strong><br />Your account cannot access Knowledge Lab.</Notice></div></main></SidebarPageShell>;
  return <SidebarPageShell activePath="/admin/rag-lab" user={auth?.user ?? null}><main className="min-h-[calc(100vh-72px)] bg-surface px-5 py-6 text-on-surface sm:px-8"><div className="mx-auto max-w-6xl">
    <header className="flex flex-col justify-between gap-4 pb-2 sm:flex-row sm:items-end"><div><p className="mt-2 max-w-2xl text-sm text-[#626b79]">Test how Aranyabodh reads sources and answers questions before making changes available in chat.</p></div>{view === "experiments" ? <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New experiment</button> : null}</header>
    <nav aria-label="Knowledge Lab modes" className="mt-5 flex border-b border-outline-variant"><button aria-current={view === "experiments" ? "page" : undefined} className={`min-h-11 border-b-2 px-4 text-sm font-bold ${view === "experiments" ? "border-primary text-primary" : "border-transparent text-[#626b79]"}`} onClick={() => setView("experiments")}>Experiments</button><button aria-current={view === "legal" ? "page" : undefined} className={`min-h-11 border-b-2 px-4 text-sm font-bold ${view === "legal" ? "border-primary text-primary" : "border-transparent text-[#626b79]"}`} onClick={() => setView("legal")}>Legal retrieval preview</button></nav>
    {view === "experiments" ? <>{error ? <div className="mt-5"><Notice tone="error">{error}</Notice></div> : null}
    {loading ? <div aria-label="Loading experiments" className="mt-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 animate-pulse rounded bg-surface-container" />)}</div> : null}
    {!loading && data?.items.length === 0 ? <section className="mt-8 rounded border border-dashed border-outline-variant bg-white p-10 text-center"><Beaker className="mx-auto h-9 w-9 text-primary" /><h2 className="mt-4 text-xl font-bold">No experiments yet</h2><p className="mt-2 text-sm text-[#626b79]">Create an experiment to test sources and answer settings privately.</p><button className="primary-button mt-5" onClick={() => setCreateOpen(true)}>New experiment</button></section> : null}
    {data?.items.length ? <section aria-busy={updating} className="mt-6"><div className="space-y-3">{data.items.map(item => <a key={item.id} href={`/admin/rag-lab/workspace?experimentId=${encodeURIComponent(item.id)}`} className="block min-h-24 rounded-xl border border-outline-variant/60 bg-white p-4 shadow-sm transition hover:border-primary"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-primary">{item.name}</h2><p className="mt-1 text-sm text-[#626b79]">{item.description || "No description"}</p></div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status} /><span className="text-xs text-[#626b79]">{item.published_revision_id ? "Published version + private workspace" : "Private experiment"}</span></div></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#626b79]"><span>Updated {when(item.updated_at)}</span>{item.published_revision_id ? <span className="rounded-full bg-[#edf6ef] px-2.5 py-1 font-medium text-primary">Version available in chat</span> : null}</div></a>)}</div><footer className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"><span>{updating ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}Showing {data.pagination.total ? data.pagination.offset + 1 : 0}–{Math.min(data.pagination.offset + data.items.length, data.pagination.total)} of {data.pagination.total} experiments</span><div className="flex gap-2"><button className="secondary-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}><ChevronLeft className="h-4 w-4" />Previous</button><button className="secondary-button" disabled={!data.pagination.has_more} onClick={() => setOffset(offset + LIMIT)}>Next<ChevronRight className="h-4 w-4" /></button></div></footer></section> : null}</> : <div className="mt-6"><LegalPreview authRef={authRef} /></div>}
  </div>
  {view === "experiments" && createOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}><form aria-labelledby="create-title" aria-modal="true" role="dialog" className="w-full max-w-lg rounded bg-white p-6 shadow-xl" onSubmit={create}><div className="flex justify-between"><h2 id="create-title" className="text-xl font-bold text-primary">New experiment</h2><button aria-label="Close" className="grid h-11 w-11 place-items-center rounded hover:bg-surface-container-low" onClick={() => setCreateOpen(false)} type="button"><X className="h-5 w-5" /></button></div><label className="mt-5 block text-sm font-semibold">Name<input autoFocus className="field mt-2" maxLength={120} required value={name} onChange={e => setName(e.target.value)} /></label><label className="mt-4 block text-sm font-semibold">Description<textarea className="field mt-2 min-h-24" value={description} onChange={e => setDescription(e.target.value)} /></label><p className="mt-3 text-xs text-[#626b79]">Backend defaults are applied and can be tuned in the workspace.</p><div className="mt-6 flex justify-end gap-3"><button className="secondary-button" onClick={() => setCreateOpen(false)} type="button">Cancel</button><button className="primary-button" disabled={creating || !name.trim()}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create</button></div></form></div> : null}
  </main></SidebarPageShell>;
}
