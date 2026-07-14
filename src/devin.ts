/**
 * Minimal TypeScript client for the Devin REST API (v3).
 *
 * Auth: a Bearer token in the `Authorization` header. Requires a service user
 * API key (cog_) and an organization ID. Legacy keys (apk_ / apk_user_) still
 * work against the v1 endpoints — if a legacy key is detected, the client
 * falls back to v1 automatically.
 *
 * Reference: https://docs.devin.ai/api-reference/v3/overview
 */

const V3_BASE = "https://api.devin.ai/v3/organizations"
const V1_BASE = "https://api.devin.ai/v1"

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

/** Detect legacy keys that use v1 endpoints. */
function isLegacyKey(apiKey: string): boolean {
  return apiKey.startsWith("apk_") || apiKey.startsWith("apk_user_")
}

async function request<T>(
  apiKey: string,
  baseUrl: string,
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

  const response = await fetch(`${baseUrl}${path}`, {
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
  created_at: string | number
  updated_at: string | number
  tags?: string[] | null
  playbook_id?: string | null
  url?: string
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

/** Normalize v3 list response (items[]) into the shared shape. */
interface V3ListResponse {
  items?: SessionSummary[]
  end_cursor?: string | null
  has_next_page?: boolean
  total?: number
}

/** Normalize v3 session detail into the shared shape. */
interface V3SessionDetail {
  session_id: string
  url?: string
  status: string
  status_enum?: string | null
  title?: string | null
  created_at?: number | string
  updated_at?: number | string
  tags?: string[] | null
  playbook_id?: string | null
  messages?: SessionMessage[]
  message_history?: SessionMessage[]
}

/** Resolve the org_id from env var, Devin CLI config, or the v3 API. */
export async function resolveOrgId(apiKey: string): Promise<string | undefined> {
  // 1. Explicit env var
  const envOrgId = process.env["DEVIN_ORG_ID"]
  if (envOrgId) return envOrgId

  // 2. Try reading from Devin CLI config
  try {
    const path = `${process.env["HOME"] ?? ""}/.config/devin/config.json`
    const res = await fetch(`file://${path}`)
    if (res.ok) {
      const config = (await res.json()) as { devin?: { org_id?: string } }
      if (config.devin?.org_id) return config.devin.org_id
    }
  } catch {
    // ignore
  }

  // 3. Query the API — list sessions with any org and extract org_id from response
  try {
    // The /v3/organizations endpoint lists orgs the service user belongs to
    const res = await fetch("https://api.devin.ai/v3/organizations", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) {
      const data = (await res.json()) as { items?: Array<{ id: string }> } | Array<{ id: string }>
      const orgs = Array.isArray(data) ? data : data.items
      if (orgs && orgs.length > 0) return orgs[0].id
    }
  } catch {
    // ignore
  }

  return undefined
}

export const Devin = {
  createSession: (apiKey: string, orgId: string, input: CreateSessionInput, opts?: RequestOptions) => {
    if (isLegacyKey(apiKey)) {
      return request<CreateSessionResponse>(apiKey, V1_BASE, "/sessions", {
        method: "POST",
        body: input,
        signal: opts?.signal,
      })
    }
    return request<CreateSessionResponse>(apiKey, V3_BASE, `/${orgId}/sessions`, {
      method: "POST",
      body: input,
      signal: opts?.signal,
    })
  },

  listSessions: (
    apiKey: string,
    orgId: string,
    query: { limit?: number; offset?: number; tags?: string[] } = {},
    opts?: RequestOptions,
  ) => {
    if (isLegacyKey(apiKey)) {
      const params = new URLSearchParams()
      if (query.limit !== undefined) params.set("limit", String(query.limit))
      if (query.offset !== undefined) params.set("offset", String(query.offset))
      for (const tag of query.tags ?? []) params.append("tags", tag)
      const qs = params.toString()
      return request<ListSessionsResponse>(apiKey, V1_BASE, `/sessions${qs ? `?${qs}` : ""}`, {
        signal: opts?.signal,
      })
    }
    const params = new URLSearchParams()
    if (query.limit !== undefined) params.set("first", String(query.limit))
    for (const tag of query.tags ?? []) params.append("tags", tag)
    const qs = params.toString()
    return request<V3ListResponse>(apiKey, V3_BASE, `/${orgId}/sessions${qs ? `?${qs}` : ""}`, {
      signal: opts?.signal,
    }).then((r) => ({ sessions: r.items ?? [] }))
  },

  getSession: (apiKey: string, orgId: string, sessionId: string, opts?: RequestOptions) => {
    if (isLegacyKey(apiKey)) {
      return request<SessionDetail>(apiKey, V1_BASE, `/sessions/${encodeURIComponent(sessionId)}`, {
        signal: opts?.signal,
      })
    }
    return request<V3SessionDetail>(apiKey, V3_BASE, `/${orgId}/sessions/${encodeURIComponent(sessionId)}`, {
      signal: opts?.signal,
    }).then((r) => ({
      ...r,
      messages: r.messages ?? r.message_history ?? [],
    }))
  },

  sendMessage: (apiKey: string, orgId: string, sessionId: string, message: string, opts?: RequestOptions) => {
    if (isLegacyKey(apiKey)) {
      return request<{ detail?: string } | null>(
        apiKey,
        V1_BASE,
        `/sessions/${encodeURIComponent(sessionId)}/message`,
        { method: "POST", body: { message }, signal: opts?.signal },
      )
    }
    return request<{ detail?: string } | null>(
      apiKey,
      V3_BASE,
      `/${orgId}/sessions/${encodeURIComponent(sessionId)}/messages`,
      { method: "POST", body: { message }, signal: opts?.signal },
    )
  },

  terminateSession: (apiKey: string, orgId: string, sessionId: string, opts?: RequestOptions) => {
    if (isLegacyKey(apiKey)) {
      return request<TerminateSessionResponse>(apiKey, V1_BASE, `/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        signal: opts?.signal,
      })
    }
    return request<TerminateSessionResponse>(
      apiKey,
      V3_BASE,
      `/${orgId}/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE", signal: opts?.signal },
    )
  },
}
