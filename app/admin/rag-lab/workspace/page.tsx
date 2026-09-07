import { Suspense } from "react";
import RagLabWorkspacePage from "../workspace-client";

export default function WorkspaceRoute() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-surface">Loading workspace…</main>}><RagLabWorkspacePage /></Suspense>;
}
