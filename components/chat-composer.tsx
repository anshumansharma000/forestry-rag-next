"use client";

import { Loader2, Send } from "lucide-react";
import React, { useEffect, useRef, type RefObject } from "react";

export function ChatComposer({ value, onChange, onSend, disabled, sending, inputRef, onHeightChange }: {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => Promise<boolean>;
  disabled: boolean;
  sending: boolean;
  inputRef: RefObject<HTMLTextAreaElement>;
  onHeightChange: (height: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const canSend = value.trim().length > 0 && !disabled;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 192)}px`;
  }, [value, inputRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => onHeightChange(container.getBoundingClientRect().height));
    observer.observe(container);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <div ref={containerRef} className="fixed inset-x-0 bottom-0 z-20 bg-surface/95 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 transition-[left] duration-200 sm:px-8 lg:left-[var(--app-sidebar-width)]">
      <div className="mx-auto max-w-[840px]">
        <form
          className="flex min-h-[64px] items-end gap-3 rounded-2xl border border-[#d5ddd7] bg-white p-2.5 pl-4 shadow-sm transition focus-within:border-[#38835a] focus-within:ring-2 focus-within:ring-[#38835a]/15"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSend || submittingRef.current) return;
            submittingRef.current = true;
            try {
              if (await onSend(value)) onChange("");
            } finally {
              submittingRef.current = false;
            }
          }}
        >
          <textarea
            ref={inputRef}
            aria-label="Chat prompt"
            aria-describedby="chat-input-hint"
            className="max-h-48 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent py-2.5 text-[16px] leading-6 text-on-surface placeholder:text-[#879089] focus:outline-none disabled:opacity-70"
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask about your forestry documents…"
            rows={1}
            value={value}
          />
          <button aria-label={sending ? "Sending prompt" : "Send prompt"} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-white transition hover:bg-primary-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40" disabled={!canSend} type="submit">
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </form>
        <p id="chat-input-hint" className="mt-2 text-center text-[11px] leading-4 text-[#7d8780]">
          {sending ? "Searching your documents…" : disabled ? "Retry or discard the saved message to continue." : "Enter to send · Shift + Enter for a new line"}
        </p>
      </div>
    </div>
  );
}
