import { describe, expect, it } from "vitest";
import type { ChatSession } from "./api";
import { groupChatSessions } from "./chat-history";

function session(id: string, date: Date): ChatSession {
  return { id, title: id, metadata: {}, created_at: date.toISOString(), updated_at: date.toISOString() };
}

describe("chat history groups", () => {
  it("uses local calendar days across a year boundary and orders newest first", () => {
    const older = session("older", new Date(2025, 11, 30, 23, 59));
    const yesterday = session("yesterday", new Date(2025, 11, 31, 23, 59));
    const midnight = session("midnight", new Date(2026, 0, 1, 0, 0));
    const latest = session("latest", new Date(2026, 0, 1, 10));
    const input = [older, midnight, yesterday, latest];
    const groups = groupChatSessions(input, new Date(2026, 0, 1, 12));
    expect(groups.map((group) => [group.label, group.sessions.map((item) => item.id)])).toEqual([
      ["Today", ["latest", "midnight"]],
      ["Yesterday", ["yesterday"]],
      ["Older", ["older"]],
    ]);
    expect(input.map((item) => item.id)).toEqual(["older", "midnight", "yesterday", "latest"]);
  });

  it("omits empty sections and keeps undated chats accessible", () => {
    expect(groupChatSessions([])).toEqual([]);
    const invalid = { ...session("undated", new Date()), updated_at: "invalid" };
    expect(groupChatSessions([invalid]).map((group) => group.label)).toEqual(["Older"]);
  });
});
