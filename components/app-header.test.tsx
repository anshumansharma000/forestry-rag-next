import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./app-header";

function renderHeader(health: string, configReady: boolean) {
  return renderToStaticMarkup(
    <AppHeader
      title="Chat"
      health={health}
      configReady={configReady}
      user={{ id: "user-1", email: "user@example.com", full_name: null, role: "viewer", must_change_password: false }}
      onAdminClick={vi.fn()}
      onLogout={vi.fn()}
      onMenuClick={vi.fn()}
    />,
  );
}

describe("AppHeader connection status", () => {
  it.each([
    ["ok", true, "Connected"],
    ["ok", false, "Needs setup"],
    ["error", true, "Connection issue"],
    ["unknown", true, "Checking connection"],
  ])("uses backend health %s and readiness %s to show %s", (health, ready, label) => {
    const markup = renderHeader(health, ready);
    expect(markup).toContain(`aria-label="${label}"`);
    expect(markup).toContain(">Chat</h1>");
    expect(markup).toContain('aria-label="Account"');
    expect(markup).toContain('aria-expanded="false"');
  });
});
