"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AskResponse, Source } from "../lib/api";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

const CITATION_PATTERN = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

function citationMatches(content: string) {
  const matches: RegExpExecArray[] = [];
  const pattern = new RegExp(CITATION_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) matches.push(match);
  return matches;
}

export function citationNumbers(content: string) {
  const numbers: number[] = [];
  const seen = new Set<number>();

  for (const match of citationMatches(content)) {
    for (const value of match[1].split(",")) {
      const number = Number(value.trim());
      if (Number.isInteger(number) && !seen.has(number)) {
        seen.add(number);
        numbers.push(number);
      }
    }
  }

  return numbers;
}

export function citedSourcesForMessage(content: string, sources: Source[]) {
  const result: Source[] = [];
  const used = new Set<Source>();

  for (const number of citationNumbers(content)) {
    const source = sources.find((candidate) => candidate.citation_number === number);
    if (!source || used.has(source)) continue;
    used.add(source);
    result.push(source);
  }

  return result;
}

export function sourcesForAskResponse(
  response: Pick<AskResponse, "answer" | "cited_sources" | "sources">,
) {
  return response.cited_sources;
}

function remarkCitations({ sources }: { sources: Source[] }) {
  const available = new Set(
    sources.flatMap((source) =>
      source.citation_number == null ? [] : [source.citation_number],
    ),
  );

  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children || node.type === "link" || node.type === "inlineCode") {
        return;
      }

      const children: MarkdownNode[] = [];
      for (const child of node.children) {
        if (child.type !== "text" || !child.value) {
          visit(child);
          children.push(child);
          continue;
        }

        let cursor = 0;
        for (const match of citationMatches(child.value)) {
          const matchIndex = match.index ?? 0;
          if (matchIndex > cursor) {
            children.push({ type: "text", value: child.value.slice(cursor, matchIndex) });
          }

          children.push({ type: "text", value: "[" });
          match[1].split(",").forEach((value, index) => {
            const number = Number(value.trim());
            if (index > 0) children.push({ type: "text", value: ", " });
            if (available.has(number)) {
              children.push({
                type: "link",
                url: `#citation-${number}`,
                children: [{ type: "text", value: String(number) }],
              });
            } else {
              children.push({ type: "text", value: String(number) });
            }
          });
          children.push({ type: "text", value: "]" });
          cursor = matchIndex + match[0].length;
        }

        if (cursor === 0) {
          children.push(child);
        } else if (cursor < child.value.length) {
          children.push({ type: "text", value: child.value.slice(cursor) });
        }
      }
      node.children = children;
    };

    visit(tree);
  };
}

export function MarkdownContent({
  content,
  onSelectSource,
  sources,
}: {
  content: string;
  onSelectSource: (source: Source) => void;
  sources: Source[];
}) {
  const sourcesByCitation = new Map(
    sources.map((source) => [source.citation_number, source]),
  );

  return (
    <div className="space-y-4 break-words [&_blockquote]:border-l-4 [&_blockquote]:border-primary/35 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[#4e5966] [&_code]:rounded [&_code]:bg-surface-container-low [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:text-primary [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-primary [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-primary [&_h4]:font-bold [&_h4]:text-primary [&_li]:pl-1 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_p]:leading-7 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-outline-variant [&_pre]:bg-surface-container-lowest [&_pre]:p-3 [&_pre]:text-[14px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:min-w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-[14px] [&_td]:border-b [&_td]:border-outline-variant/70 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-outline-variant [&_th]:bg-surface-container-low [&_th]:px-3 [&_th]:py-2 [&_th]:font-bold [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul_ul]:list-[circle]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkCitations, { sources }]]}
        skipHtml
        components={{
          a({ children, href }) {
            const match = href?.match(/^#citation-(\d+)$/);
            const source = match ? sourcesByCitation.get(Number(match[1])) : undefined;
            if (source && match) {
              return (
                <button
                  aria-label={`Open source ${match[1]}: ${source.display_source}`}
                  className="mx-0.5 inline-flex min-h-7 min-w-5 items-center justify-center rounded bg-[#edf8f1] px-1 align-baseline text-[0.8em] font-bold text-primary underline decoration-primary/40 underline-offset-2 hover:bg-[#dcefe4]"
                  onClick={() => onSelectSource(source)}
                  type="button"
                >
                  {children}
                </button>
              );
            }

            return (
              <a className="font-semibold text-primary underline" href={href} rel="noreferrer" target="_blank">
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto rounded border border-outline-variant">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {content.replace(/\r\n/g, "\n")}
      </ReactMarkdown>
    </div>
  );
}
