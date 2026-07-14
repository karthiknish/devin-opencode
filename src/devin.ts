/**
 * Minimal TypeScript client for the Devin REST API (v1).
 *
 * Auth: a Bearer token in the `Authorization` header. Devin accepts both
 * legacy keys (`apk_` / `apk_user_`) and current service-user keys (`cog_`)
 * against the v1 endpoints.
 *
 * Reference: https://docs.devin.ai/api-reference/v1/overview
 */

const BASE_URL = "https://api.devin.ai/v1"

export class DevinApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "DevinApiError"
    this.status = status
    this.body = body
  }
}

interface RequestOptions {
  signal?: AbortSignal
}

async function request<T>(
  apiKey: string,
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  }
  let body: string | undefined
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(init.body)
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body,
    signal: init.signal,
  })

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const parsed = text ? (safeJson(text) as unknown) : undefined

  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed !== null && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : `Devin API request failed (${response.status})`
    throw new DevinApiError(message, response.status, parsed)
  }

  return parsed as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export interface CreateSessionInput {
  prompt: string
  title?: string
  playbook_id?: string
  unlisted?: boolean
  tags?: string[]
}

export interface CreateSessionResponse {
  session_id: string
  url: string
  is_new_session?: boolean | null
}

export interface SessionSummary {
  session_id: string
  status: string
  status_enum?: string | null
  title?: string | null
  created_at: string
  updated_at: string
  tags?: string[] | null
  playbook_id?: string | null
  snapshot_id?: string | null
  requesting_user_email?: string | null
  pull_request?: { url: string } | null
  structured_output?: unknown
}

export interface SessionMessage {
  type: string
  event_id: string
  message: string
  timestamp: string
  origin?: string | null
  user_id?: string | null
  username?: string | null
}

export interface SessionDetail extends SessionSummary {
  messages: SessionMessage[]
}

export interface TerminateSessionResponse {
  detail: string
}

export interface ListSessionsResponse {
  sessions: SessionSummary[]
}

export const Devin = {
  createSession: (apiKey: string, input: CreateSessionInput, opts?: RequestOptions) =>
    request<CreateSessionResponse>(apiKey, "/sessions", {
      method: "POST",
      body: input,
      signal: opts?.signal,
    }),

  listSessions: (
    apiKey: string,
    query: { limit?: number; offset?: number; tags?: string[]; user_email?: string } = {},
    opts?: RequestOptions,
  ) => {
    const params = new URLSearchParams()
    if (query.limit !== undefined) params.set("limit", String(query.limit))
    if (query.offset !== undefined) params.set("offset", String(query.offset))
    if (query.user_email) params.set("user_email", query.user_email)
    for (const tag of query.tags ?? []) params.append("tags", tag)
    const qs = params.toString()
    return request<ListSessionsResponse>(apiKey, `/sessions${qs ? `?${qs}` : ""}`, {
      signal: opts?.signal,
    })
  },

  getSession: (apiKey: string, sessionId: string, opts?: RequestOptions) =>
    request<SessionDetail>(apiKey, `/sessions/${encodeURIComponent(sessionId)}`, {
      signal: opts?.signal,
    }),

  sendMessage: (apiKey: string, sessionId: string, message: string, opts?: RequestOptions) =>
    request<{ detail?: string } | null>(
      apiKey,
      `/sessions/${encodeURIComponent(sessionId)}/message`,
      { method: "POST", body: { message }, signal: opts?.signal },
    ),

  terminateSession: (apiKey: string, sessionId: string, opts?: RequestOptions) =>
    request<TerminateSessionResponse>(apiKey, `/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      signal: opts?.signal,
    }),
}
