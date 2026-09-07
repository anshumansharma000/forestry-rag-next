import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../lib/api";
import { AppSidebar } from "./app-sidebar";

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
    expect(markup).toContain('aria-current="page"');
  });

  it("keeps restricted navigation out of a viewer sidebar", () => {
    const markup = renderToStaticMarkup(
      <AppSidebar activePath="/profile" user={{ ...admin, role: "viewer" }} />,
    );

    expect(markup).not.toContain("Document processing");
    expect(markup).not.toContain("Knowledge Lab");
    expect(markup).not.toContain(">Users<");
    expect(markup).toContain("Profile");
  });
});
