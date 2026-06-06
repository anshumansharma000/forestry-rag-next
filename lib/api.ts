"use client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:8000";

export type Role = "viewer" | "officer" | "knowledge_manager" | "admin";

export type AuthUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  must_change_password: boolean;
};

export type AuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_at: string;
  refresh_expires_at: string;
  user: AuthUser;
};

export type AuthState = AuthTokenResponse;

export type ConfigStatus = {
  gemini_api_key_configured: boolean;
  supabase_url_configured: boolean;
  supabase_service_role_key_configured: boolean;
  supabase_url_valid: boolean;
  supabase_url_hint: string | null;
  embedding_dimensions: number;
  auth_disabled: boolean;
  bootstrap_admin_token_configured: boolean;
  jwt_secret_key_configured: boolean;
};

export type ConfigValidation = {
  ok: boolean;
  missing: string[];
  status: ConfigStatus;
};

export type EvidenceRole = "matched" | "neighbor";

export type Source = {
  source: string;
  display_source: string;
  page_start: number | null;
  page_end: number | null;
  chunk_index: number;
  section_heading: string | null;
  score: number;
  evidence_role: EvidenceRole;
  text: string;
};

export type AskResponse = {
  answer: string;
  sources: Source[];
  confidence: number;
  abstained: boolean;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ChatSession = {
  id: string;
  user_id?: string;
  title: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type IngestJobStatus = "queued" | "running" | "succeeded" | "failed";

export type IngestJobResult = {
  documents: number;
  documents_added: number;
  documents_skipped: number;
  chunks: number;
  chunks_added: number;
  storage: string;
};

export type IngestJob = {
  id: string;
  kind: string;
  status: IngestJobStatus;
  actor_user_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  metadata: Record<string, unknown>;
  result: IngestJobResult | null;
  error: string | null;
};

export type PreviewChunk = {
  source: string;
  chunk_index: number;
  chunk_type: string;
  section_heading: string | null;
  page_start: number | null;
  page_end: number | null;
  content: string;
  token_estimate: number;
  metadata: {
    kind: string;
    title: string;
    [key: string]: unknown;
  };
};

export type ChunkPreview = {
  documents: number;
  chunks: PreviewChunk[];
};

export type AdminUser = AuthUser & {
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type AuditEvent = {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DocumentUploadPresignFile = {
  filename: string;
  size_bytes: number;
  content_type: string;
};

export type DocumentUpload = {
  upload_id: string;
  filename: string;
  upload_url: string;
  method: string;
  headers: Record<string, string>;
};

type RequestOptions = RequestInit & {
  token?: string | null;
};

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor({
    code,
    details,
    message,
    status,
  }: {
    code: string;
    details?: Record<string, unknown>;
    message: string;
    status: number;
  }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details ?? {};
    this.status = status;
  }
}

const authStorageKey = "forest-rag-auth";

export function readStoredAuth(): AuthState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(authStorageKey);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

export function storeAuth(auth: AuthState) {
  window.localStorage.setItem(authStorageKey, JSON.stringify(auth));
}

export function clearStoredAuth() {
  window.localStorage.removeItem(authStorageKey);
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as {
      error?: { code?: unknown; message?: unknown; details?: unknown };
      detail?: unknown;
    };

    if (data.error && typeof data.error.message === "string") {
      return {
        code:
          typeof data.error.code === "string"
            ? data.error.code
            : "api_error",
        details:
          data.error.details &&
          typeof data.error.details === "object" &&
          !Array.isArray(data.error.details)
            ? (data.error.details as Record<string, unknown>)
            : {},
        message: data.error.message,
      };
    }

    if (typeof data.detail === "string") {
      return { code: "api_error", details: {}, message: data.detail };
    }

    if (data.detail) {
      return {
        code: "validation_error",
        details: { detail: data.detail },
        message: "Request validation failed.",
      };
    }
  } catch {
    const text = await response.text();
    if (text) {
      return { code: "api_error", details: {}, message: text };
    }
  }

  return {
    code: "api_error",
    details: {},
    message: `${response.status} ${response.statusText}`,
  };
}

export async function apiRequest<T>(
  path: string,
  { token, ...init }: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const error = await readError(response);
    throw new ApiError({ ...error, status: response.status });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export function login(email: string, password: string) {
  return apiRequest<AuthTokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function refreshAuth(refreshToken: string) {
  return apiRequest<AuthTokenResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function getHealth() {
  return apiRequest<{ status: string }>("/health");
}

export function getConfigStatus() {
  return apiRequest<ConfigStatus>("/config/status");
}

export function validateConfig(token: string) {
  return apiRequest<ConfigValidation>("/config/validate", { token });
}

export function getCurrentUser(token: string) {
  return apiRequest<AuthUser>("/auth/me", { token });
}

export function updateCurrentUser(token: string, fullName: string | null) {
  return apiRequest<AuthUser>("/auth/me", {
    method: "PATCH",
    token,
    body: JSON.stringify({ full_name: fullName }),
  });
}

export function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
) {
  return apiRequest<AuthTokenResponse & { changed: true }>(
    "/auth/change-password",
    {
      method: "POST",
      token,
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    },
  );
}

export function listSessions(token: string) {
  return apiRequest<{ sessions: ChatSession[] }>("/chat/sessions", { token });
}

export function createSession(token: string, title?: string | null) {
  return apiRequest<ChatSession>("/chat/sessions", {
    method: "POST",
    token,
    body: JSON.stringify(title ? { title } : {}),
  });
}

export function getMessages(token: string, sessionId: string) {
  return apiRequest<{ session_id: string; messages: ChatMessage[] }>(
    `/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    { token },
  );
}

export function ask(token: string, question: string, topK?: number) {
  return apiRequest<AskResponse>("/ask", {
    method: "POST",
    token,
    body: JSON.stringify({ question, top_k: topK }),
  });
}

export function askSession(
  token: string,
  sessionId: string,
  message: string,
  topK?: number,
) {
  return apiRequest<
    AskResponse & {
      session_id: string;
      user_message: ChatMessage;
      assistant_message: ChatMessage;
      search_query: string;
    }
  >(`/chat/sessions/${encodeURIComponent(sessionId)}/ask`, {
    method: "POST",
    token,
    body: JSON.stringify({ message, top_k: topK }),
  });
}

export function deleteSession(token: string, sessionId: string) {
  return apiRequest<void>(`/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    token,
  });
}

export function deleteMessage(
  token: string,
  sessionId: string,
  messageId: string,
) {
  return apiRequest<void>(
    `/chat/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE", token },
  );
}

export function uploadDocument(token: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiRequest<{ status: "ok"; filename: string; path: string }>(
    "/documents/upload",
    {
      method: "POST",
      token,
      body: formData,
    },
  );
}

export function uploadDocuments(token: string, files: File[]) {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return apiRequest<{
    status: "ok";
    files: { status: "ok"; filename: string; path: string }[];
  }>("/documents/uploads", {
    method: "POST",
    token,
    body: formData,
  });
}

export function presignDocumentUploads(
  token: string,
  files: DocumentUploadPresignFile[],
) {
  return apiRequest<{ uploads: DocumentUpload[] }>("/documents/uploads/presign", {
    method: "POST",
    token,
    body: JSON.stringify({ files }),
  });
}

export function completeDocumentUploads(
  token: string,
  uploads: Pick<DocumentUpload, "upload_id" | "filename">[],
) {
  return apiRequest<{
    status: "ok";
    files: { status: "ok"; filename: string; path?: string }[];
  }>("/documents/uploads/complete", {
    method: "POST",
    token,
    body: JSON.stringify({ files: uploads }),
  });
}

export function startIngest(token: string) {
  return apiRequest<{ job: IngestJob }>("/ingest", {
    method: "POST",
    token,
  });
}

export function getIngestJob(token: string, jobId: string) {
  return apiRequest<{ job: IngestJob }>(
    `/ingest/jobs/${encodeURIComponent(jobId)}`,
    { token },
  );
}

export function getChunkPreview(token: string) {
  return apiRequest<ChunkPreview>("/chunks/preview", { token });
}

export function listUsers(token: string, limit = 100) {
  return apiRequest<{ users: AdminUser[] }>(
    `/admin/users?limit=${encodeURIComponent(limit)}`,
    { token },
  );
}

export function createUser(
  token: string,
  payload: {
    email: string;
    password: string;
    role: Role;
    full_name?: string | null;
    metadata?: Record<string, unknown> | null;
    must_change_password?: boolean;
  },
) {
  return apiRequest<AdminUser>("/admin/users", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function updateUser(
  token: string,
  userId: string,
  payload: Partial<{
    email: string;
    full_name: string | null;
    role: Role;
    is_active: boolean;
    metadata: Record<string, unknown>;
  }>,
) {
  return apiRequest<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function resetUserPassword(
  token: string,
  userId: string,
  newPassword: string,
  mustChangePassword = true,
) {
  return apiRequest<{ reset: true }>(
    `/admin/users/${encodeURIComponent(userId)}/reset-password`,
    {
      method: "POST",
      token,
      body: JSON.stringify({
        new_password: newPassword,
        must_change_password: mustChangePassword,
      }),
    },
  );
}

export function listAuditEvents(token: string, limit = 100) {
  return apiRequest<{ events: AuditEvent[] }>(
    `/admin/audit-events?limit=${encodeURIComponent(limit)}`,
    { token },
  );
}
