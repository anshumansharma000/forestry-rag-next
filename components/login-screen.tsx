"use client";

import {
  AlertCircle,
  ArrowRight,
  Files,
  Loader2,
  MessageSquareText,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { PasswordInput } from "./password-input";

/** Department sign-in presentation and form behavior. */
export function LoginScreen({
  error,
  loading,
  onLogin,
}: {
  error: string | null;
  loading: boolean;
  onLogin: (email: string, password: string) => void | Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submitting = useRef(false);

  return (
    <main className="login-workspace flex min-h-svh flex-col bg-[#f7f9f7] px-5 text-on-surface sm:px-8">
      <header className="mx-auto w-full max-w-[1120px] py-7 sm:py-9">
        <a
          href="/"
          aria-label="Aranyabodh AI home"
          className="inline-flex items-center gap-3 rounded-xl"
        >
          <BrandLogo decorative className="h-11 w-11 shrink-0" />
          <div>
            <p className="text-xl font-bold tracking-tight text-primary">
              Aranyabodh AI
            </p>
            <p className="mt-0.5 text-xs text-[#738078]">
              Forest diversion knowledge assistant
            </p>
          </div>
        </a>
      </header>

      <div className="mx-auto grid w-full max-w-[1120px] flex-1 items-center gap-8 pb-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-20">
        <section
          aria-labelledby="login-intro"
          className="hidden rounded-xl border border-[#e0e9e2] bg-[#edf4ef] p-10 lg:flex lg:min-h-[520px] lg:flex-col lg:justify-center xl:p-12"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#54715f]">
            Clarity, grounded in your sources
          </p>
          <h2
            id="login-intro"
            className="mt-5 text-[42px] font-semibold leading-[1.14] tracking-tight text-primary"
          >
            Department knowledge,
            <br />
            within reach.
          </h2>
          <p className="mt-5 max-w-sm text-[16px] leading-7 text-[#607368]">
            Find guidance in your department’s documents, then open the sources
            behind each answer.
          </p>
          <div className="mt-9 space-y-5 border-t border-[#d8e4db] pt-7">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/80 text-primary">
                <MessageSquareText className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#2a4835]">
                  Ask in plain language
                </p>
                <p className="mt-1 text-[13px] leading-5 text-[#6a7e71]">
                  Explore rules, procedures, and department records.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/80 text-primary">
                <Files className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#2a4835]">
                  Follow the evidence
                </p>
                <p className="mt-1 text-[13px] leading-5 text-[#6a7e71]">
                  Review the supporting documents alongside answers.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="sign-in-title"
          className="mx-auto w-full max-w-[448px]"
        >
          <form
            aria-busy={loading}
            aria-describedby={error ? "login-error" : "login-description"}
            className="rounded-xl border border-[#dde5df] bg-white p-6 shadow-sm sm:p-8"
            onSubmit={async (event) => {
              event.preventDefault();
              if (loading || submitting.current || !email.trim() || !password)
                return;
              submitting.current = true;
              try {
                await onLogin(email.trim(), password);
              } finally {
                submitting.current = false;
              }
            }}
          >
            <h1
              id="sign-in-title"
              className="text-[28px] font-semibold tracking-tight text-primary"
            >
              Welcome back
            </h1>
            <p
              id="login-description"
              className="mt-2 text-sm leading-6 text-[#738078]"
            >
              Sign in with your department account.
            </p>
            {error ? (
              <div
                id="login-error"
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#eccfc5] bg-[#fff5f1] p-3 text-sm leading-5 text-[#743f2c]"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            <label className="mt-7 block" htmlFor="login-email">
              <span className="text-sm font-medium text-[#3d5044]">
                Email address
              </span>
            </label>
            <input
              id="login-email"
              name="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="mt-2 h-12 w-full rounded-xl border border-[#d5dfd8] bg-white px-3.5 text-[16px] placeholder:text-[#a0aaa3] focus:border-[#38835a] disabled:opacity-60"
              disabled={loading}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email address"
              required
              type="email"
              value={email}
            />

            <label className="mt-5 block" htmlFor="login-password">
              <span className="text-sm font-medium text-[#3d5044]">
                Password
              </span>
            </label>
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-[#d5dfd8] bg-white px-3.5 text-[16px] focus:border-[#38835a] disabled:opacity-60"
              disabled={loading}
              onChange={(event) => setPassword(event.target.value)}
              required
              value={password}
            />

            <button
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading || !email.trim() || !password}
              type="submit"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "Signing in…" : "Sign in"}
              {!loading ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
            <p role="status" className="sr-only">
              {loading ? "Signing in. Please wait." : ""}
            </p>
            <div className="mt-6 border-t border-[#edf0ed] pt-5">
              <p className="text-center text-xs leading-5 text-[#7d8981]">
                Need access or a password reset?
                <br />
                Contact your department administrator.
              </p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
