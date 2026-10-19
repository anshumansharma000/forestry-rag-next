import type { ChatSession } from "./api";

export function groupChatSessions(sessions: ChatSession[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const groups = [
    { label: "Today", sessions: [] as ChatSession[] },
    { label: "Yesterday", sessions: [] as ChatSession[] },
    { label: "Older", sessions: [] as ChatSession[] },
  ];
  const timestamp = (session: ChatSession) => {
    const value = Date.parse(session.updated_at || session.created_at);
    return Number.isFinite(value) ? value : 0;
  };
  for (const session of [...sessions].sort((a, b) => timestamp(b) - timestamp(a))) {
    const time = timestamp(session);
    groups[time >= today.getTime() ? 0 : time >= yesterday.getTime() ? 1 : 2].sessions.push(session);
  }
  return groups.filter((group) => group.sessions.length > 0);
}
