import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../lib/api";
import { AppSidebar, SidebarPageShell } from "./app-sidebar";

const admin: AuthUser = {
  id: "admin-1",
  email: "admin@example.com",
  full_name: "Forest Administrator",
  role: "admin",
  must_change_password: false,
};

describe("AppSidebar", () => {
  it("shows the complete admin navigation and marks the current page", () => {
    const markup = renderToStaticMarkup(
      <AppSidebar activePath="/documents" user={admin} />,
    );

    expect(markup).toContain("Documents");
    expect(markup).toContain("Document processing");
    expect(markup).toContain("Knowledge Lab");
    expect(markup).toContain("Users");
    expect(markup).not.toContain('aria-label="Knowledge"');
    expect(markup).not.toContain('aria-label="Administration"');
    expect(markup).not.toContain('href="/profile"');
    expect(markup).toContain('aria-current="page"');
  });

  it("keeps restricted navigation out of a viewer sidebar", () => {
    const markup = renderToStaticMarkup(
      <AppSidebar activePath="/profile" user={{ ...admin, role: "viewer" }} />,
    );

    expect(markup).not.toContain("Document processing");
    expect(markup).not.toContain("Knowledge Lab");
    expect(markup).not.toContain(">Users<");
    expect(markup).not.toContain('href="/profile"');
  });
});

describe("shared sidebar page header", () => {
  it.each([
    ["/documents", "Documents"],
    ["/ingestion", "Document processing"],
    ["/admin/rag-lab", "Knowledge Lab"],
    ["/admin/users", "Users"],
    ["/profile", "Profile"],
  ])("renders the shared top bar on %s", (activePath, title) => {
    const markup = renderToStaticMarkup(
      <SidebarPageShell activePath={activePath} user={admin}>
        <main>Page content</main>
      </SidebarPageShell>,
    );
    expect(markup).toContain(`>${title}</h1>`);
    expect(markup).toContain('aria-label="Account"');
    expect(markup).toContain('aria-label="Checking connection"');
    expect(markup.match(/aria-label="Open sidebar"/g)).toHaveLength(1);
    expect(markup).toContain("Page content");
  });

  it("keeps the account control disabled while the session loads", () => {
    const markup = renderToStaticMarkup(
      <SidebarPageShell activePath="/profile" user={null}><main>Loading profile</main></SidebarPageShell>,
    );
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Account"/);
    expect(markup).not.toContain('aria-label="Connected"');
  });
});
