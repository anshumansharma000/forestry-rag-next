import type { Metadata } from "next";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  FileText,
  Files,
  Leaf,
  MessageSquareText,
  Search,
  ShieldCheck,
} from "lucide-react";
import { BrandLogo } from "../components/brand-logo";
import { LandingAccountLink } from "../components/landing-account-link";

export const metadata: Metadata = {
  title: "Aranyabodh AI — Forestry knowledge, within reach",
  description:
    "Explore forestry rules, procedures, and department records with Aranyabodh AI. Ask in plain language and follow the sources behind each answer.",
};

const steps = [
  {
    number: "01",
    icon: MessageSquareText,
    title: "Start with a question",
    text: "Ask about forestry rules, procedures, or department records in your own words.",
  },
  {
    number: "02",
    icon: Search,
    title: "Find the relevant guidance",
    text: "Explore an answer grounded in the official documents.",
  },
  {
    number: "03",
    icon: BookOpen,
    title: "Go straight to the source",
    text: "Open the supporting references and review the original passage in context.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing-page min-h-screen bg-[#f7f9f7] text-on-surface">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-xl bg-white p-3 text-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="border-b border-[#e0e7e1] bg-[#f7f9f7]">
        <div className="mx-auto flex min-h-[96px] max-w-[1200px] items-center justify-between gap-5 px-5 sm:px-8">
          <a
            href="/"
            aria-label="Aranyabodh AI home"
            className="inline-flex items-center gap-3 rounded-xl"
          >
            <BrandLogo decorative className="h-11 w-11 shrink-0" />
            <div>
              <p className="text-lg font-bold tracking-tight text-primary sm:text-xl">
                Aranyabodh AI
              </p>
              <p className="mt-0.5 hidden text-xs text-[#738078] sm:block">
                Knowledge Assistant on Forest Land Diversion for Non-Forest Use
              </p>
            </div>
          </a>
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-7 text-sm font-medium text-[#607368]"
          >
            <a
              className="hidden min-h-11 items-center hover:text-primary md:inline-flex"
              href="#how-it-works"
            >
              How it works
            </a>
            <a
              className="hidden min-h-11 items-center hover:text-primary md:inline-flex"
              href="#built-for-your-work"
            >
              Why Aranyabodh
            </a>
            <LandingAccountLink />
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section
          aria-labelledby="hero-title"
          className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:pb-24 lg:pt-24"
        >
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.17em] text-[#54715f]">
              <Leaf aria-hidden="true" className="h-4 w-4" /> Rooted in
              knowledge
            </p>
            <h1
              id="hero-title"
              className="mt-6 max-w-xl text-[44px] font-semibold leading-[1.09] tracking-[-0.045em] text-primary sm:text-[58px] lg:text-[64px]"
            >
              Forestry Knowledge,
              <br />
              <span className="text-[#63816d]">
                Clarity for
                <br className="hidden lg:block" /> your next step.
              </span>
            </h1>
            <p className="mt-6 max-w-[430px] text-base leading-7 text-[#607368] sm:text-[17px]">
              Find Guidance from Policies, Acts, Rules, Notifications,
              Procedures, Guidelines, Court Matters, and more; Refer to sources
              behind each answer.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href="/login"
                className="primary-button !min-h-12 !rounded-xl !px-6"
              >
                Open your workspace{" "}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-primary"
              >
                See how it works{" "}
                <ArrowDown aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs leading-5 text-[#738078]">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />{" "}
              Access with your account
            </p>
          </div>

          <div className="relative rounded-2xl border border-[#dce6de] bg-[#edf4ef] p-4 sm:p-7">
            <div className="mb-5 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#607368]">
              <span className="flex items-center gap-2">
                <MessageSquareText aria-hidden="true" className="h-4 w-4" /> A
                clearer way to explore
              </span>
              <span className="rounded-full border border-[#d7e2d9] px-2.5 py-1 text-[10px] tracking-normal">
                Illustrative example
              </span>
            </div>
            <div className="rounded-xl border border-[#dce6de] bg-white p-5 shadow-tonal sm:p-6">
              <div className="ml-5 rounded-xl bg-[#edf2ee] px-4 py-3 text-sm leading-6 text-[#3d5044]">
                How can I find guidance on forest clearance?
              </div>
              <div className="mt-6 flex items-center gap-2.5">
                <BrandLogo decorative className="h-7 w-7" />
                <p className="text-xs font-semibold text-primary">
                  Aranyabodh AI
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#526259]">
                Start with the relevant rules and department guidance. Review
                the applicable procedure, then check the original document for
                the details.
              </p>
              <div className="mt-5 border-t border-[#edf0ed] pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#738078]">
                  Supporting reference
                </p>
                <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-[#dde4de] bg-[#f0f4f1] p-3 text-primary">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white">
                    <FileText aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold">Department guidance</p>
                    <p className="mt-1 text-[11px] text-[#607368]">
                      Original passage & source context
                    </p>
                  </div>
                  <BookOpen
                    aria-hidden="true"
                    className="ml-auto h-4 w-4 shrink-0"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#dce6de] bg-white/70 px-4 py-3 text-xs text-[#738078]">
              <span>Ask about forest department’s documents</span>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary text-white">
                <ArrowUp aria-hidden="true" className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[#607368]">
              <Check aria-hidden="true" className="h-3.5 w-3.5" /> Knowledge you
              can trace back to its source
            </p>
          </div>
        </section>

        <section
          aria-label="Knowledge areas"
          className="border-y border-[#e0e7e1] bg-white/60"
        >
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-6 text-sm text-[#54715f] sm:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#738078]">
              A starting point for your questions
            </p>
            {[
              "Forest Diversion rules",
              "Department procedures",
              "Policy & guidance",
              "Department records",
            ].map((label) => (
              <span key={label} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-1 w-1 rounded-full bg-[#91aa99]"
                />
                {label}
              </span>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-title"
          className="mx-auto max-w-[1200px] scroll-mt-8 px-5 py-16 sm:px-8 sm:py-24"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#54715f]">
            From question to understanding
          </p>
          <div className="mt-4 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <h2
              id="how-title"
              className="max-w-lg text-3xl font-semibold leading-tight tracking-tight text-primary sm:text-[38px]"
            >
              Less searching.
              <br />
              More understanding.
            </h2>
            <p className="max-w-[340px] text-sm leading-6 text-[#607368]">
              Keep your question, the answer, and the evidence connected in one
              workspace.
            </p>
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {steps.map(({ number, icon: Icon, title, text }) => (
              <article key={number} className="border-t border-[#d7e2d9] pt-6">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf4ef] text-primary">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium text-[#91a397]">
                    {number}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-primary">
                  {title}
                </h3>
                <p className="mt-3 max-w-xs text-sm leading-6 text-[#607368]">
                  {text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section
          id="built-for-your-work"
          aria-labelledby="sources-title"
          className="mx-auto max-w-[1200px] scroll-mt-8 px-5 pb-16 sm:px-8 sm:pb-24"
        >
          <div className="grid overflow-hidden rounded-2xl border border-[#dce6de] bg-[#edf4ef] md:grid-cols-[0.85fr_1fr]">
            <div className="flex flex-col justify-center border-b border-[#d7e2d9] p-7 sm:p-10 md:border-b-0 md:border-r">
              <span className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#54715f]">
                <Files aria-hidden="true" className="h-4 w-4" /> Built for your
                department
              </span>
              <h2
                id="sources-title"
                className="text-3xl font-semibold leading-tight tracking-tight text-primary sm:text-[36px]"
              >
                An answer is a start.
                <br />
                <span className="text-[#63816d]">The source is essential.</span>
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-[#607368]">
                Aranyabodh brings forest department’s knowledge closer to the
                work you do, with supporting references you can open and review.
              </p>
            </div>
            <div className="space-y-7 p-7 sm:p-10">
              {[
                {
                  title: "Guidance in context",
                  text: "Move from an answer to the original passage to understand the detail behind it.",
                },
                {
                  title: "Conversations you can return to",
                  text: "Revisit your chat history and build on the questions you have already explored.",
                },
                {
                  title: "Forest department’s knowledge, together",
                  text: "Work from a shared document library, maintained by the department’s knowledge managers.",
                },
              ].map(({ title, text }) => (
                <div key={title} className="flex gap-3">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#54715f]"
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-primary">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#607368]">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="start-title"
          className="bg-primary px-5 py-14 sm:px-8 sm:py-16"
        >
          <div className="mx-auto flex max-w-[1136px] flex-col justify-between gap-7 md:flex-row md:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#a6c2ae]">
                Your knowledge. A clearer path.
              </p>
              <h2
                id="start-title"
                className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-[36px]"
              >
                Put your next question to work.
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#b6cbbd]">
                Sign in with your account to get started.
              </p>
            </div>
            <a
              href="/login"
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 self-start rounded-xl bg-[#edf4ef] px-6 text-sm font-semibold text-primary transition hover:bg-white md:self-auto"
            >
              Go to Aranyabodh AI{" "}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1200px] flex-col justify-between gap-5 px-5 py-7 text-xs text-[#738078] sm:flex-row sm:items-center sm:px-8">
        <a
          href="/"
          className="flex w-fit items-center gap-2 rounded-lg font-semibold text-primary"
        >
          <BrandLogo decorative className="h-7 w-7" />
          Aranyabodh AI
        </a>
        <p>Forestry knowledge, within reach.</p>
        <a
          href="/login"
          className="inline-flex min-h-11 items-center gap-2 font-medium text-primary"
        >
          Department sign in{" "}
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </a>
      </footer>
    </div>
  );
}
