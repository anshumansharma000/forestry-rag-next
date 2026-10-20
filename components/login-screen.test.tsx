import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./login-screen";

describe("shared sign-in screen", () => {
  it("labels credentials and supports password managers", () => {
    const markup = renderToStaticMarkup(<LoginScreen error={null} loading={false} onLogin={vi.fn()} />);
    expect(markup).toContain('for="login-email"');
    expect(markup).toContain('autoComplete="username"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('aria-label="Show password"');
    expect(markup).not.toContain('role="alert"');
  });

  it("announces sign-in errors without echoing credentials", () => {
    const markup = renderToStaticMarkup(<LoginScreen error="Unable to sign in. Check your details." loading={false} onLogin={vi.fn()} />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-describedby="login-error"');
    expect(markup).toContain("Unable to sign in. Check your details.");
  });

  it("locks credential fields and announces a pending sign-in", () => {
    const markup = renderToStaticMarkup(<LoginScreen error={null} loading onLogin={vi.fn()} />);
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/<input[^>]*disabled=""/g)).toHaveLength(2);
    expect(markup).toContain("Signing in…");
  });
});
