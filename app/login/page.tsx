"use client";

import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { API_BASE_URL, login, readStoredAuth, storeAuth } from "../../lib/api";

function formatError(err: unknown) {
  return err instanceof Error ? err.message : "Unable to sign in.";
}

export default function LoginRoute() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (readStoredAuth()) {
      window.location.assign("/");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      storeAuth(await login(email.trim(), password));
      window.location.assign("/");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-surface px-5 py-8 text-on-surface lg:grid-cols-[1fr_440px] lg:px-0 lg:py-0">
      <section className="hidden min-h-screen items-center bg-primary px-12 text-white lg:flex">
        <div className="max-w-2xl">
          <div className="grid h-16 w-16 place-items-center rounded-lg bg-white/10">
            <ShieldCheck className="h-9 w-9" />
          </div>
          <h1 className="mt-8 text-[42px] font-bold leading-[1.12]">
            Aranyabodh
          </h1>
          <p className="mt-5 max-w-xl text-[18px] leading-7 text-white/78">
            Secure access for the forest department RAG pilot.
          </p>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-[440px] items-center lg:px-10">
        <form
          className="w-full rounded border border-outline-variant bg-white p-6 shadow-tonal"
          onSubmit={handleSubmit}
        >
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded bg-[#edf8f1] text-primary">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-[24px] font-bold text-primary">Sign in</h2>
              <p className="text-[14px] text-[#626b79]">{API_BASE_URL}</p>
            </div>
          </div>

          {error ? (
            <div className="mt-5 flex items-start gap-3 rounded border border-[#f0c4b6] bg-[#fff5f1] px-3 py-3 text-[#743f2c]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-[14px] leading-5">{error}</p>
            </div>
          ) : null}

          <label className="mt-6 block">
            <span className="text-[13px] font-semibold uppercase text-[#626b79]">
              Email
            </span>
            <input
              autoComplete="email"
              className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="mt-4 block">
            <span className="text-[13px] font-semibold uppercase text-[#626b79]">
              Password
            </span>
            <input
              autoComplete="current-password"
              className="mt-2 h-11 w-full rounded border border-outline-variant px-3 text-[15px]"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <button
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-4 text-[15px] font-semibold text-white transition hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
