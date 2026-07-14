/**
 * OpenCode v1 (stable) plugin for Devin.
 *
 * Registers a "devin" auth provider so users can connect via /connect in the
 * OpenCode TUI and paste their API key. The key is stored as an OpenCode
 * credential and retrieved on plugin load. Falls back to the DEVIN_API_KEY
 * environment variable if no credential is stored.
 *
 * Reference: https://opencode.ai/docs/plugins
 */
import { tool, type Plugin as PluginType } from "@opencode-ai/plugin"
import type { Auth } from "@opencode-ai/sdk"
import { Devin, DevinApiError, resolveOrgId } from "./devin.js"

const PROVIDER_ID = "devin"
const ENV_VAR = "DEVIN_API_KEY"

/** Cached API key and org_id. */
let cachedApiKey: string | undefined
let cachedOrgId: string | undefined

/**
 * Try to retrieve the stored Devin credential from the OpenCode server.
 * The SDK doesn't expose a GET /auth/{id} method, so we fetch it directly.
 */
async function fetchStoredAuth(serverUrl: URL): Promise<string | undefined> {
  try {
    const res = await fetch(`${serverUrl.origin}/auth/${PROVIDER_ID}`, {
      headers: { accept: "application/json" },
    })
    if (!res.ok) return undefined
    const auth = (await res.json()) as Auth
    if (auth?.type === "api" && auth.key) return auth.key
  } catch {
    // server not reachable or endpoint missing — fall through to env
  }
  return undefined
}

/** Resolve the API key from cache, stored credential, or env var. */
async function resolveApiKey(serverUrl?: URL): Promise<string | undefined> {
  if (cachedApiKey) return cachedApiKey
  if (serverUrl) {
    const stored = await fetchStoredAuth(serverUrl)
    if (stored) {
      cachedApiKey = stored
      return stored
    }
  }
  return process.env[ENV_VAR]
}

/** Ensure we have an org_id (needed for v3 API with cog_ keys). */
async function ensureOrgId(apiKey: string): Promise<string> {
  if (cachedOrgId) return cachedOrgId
  const orgId = await resolveOrgId(apiKey)
  if (!orgId) {
    throw new DevinApiError(
      "Could not determine your Devin organization ID. Set DEVIN_ORG_ID env var.",
      401,
      undefined,
    )
  }
  cachedOrgId = orgId
  return orgId
}

function requireApiKey(apiKey: string | undefined): string {
  if (!apiKey) {
    throw new DevinApiError(
      `Devin is not connected. Run /connect in the OpenCode TUI and choose Devin, or set the ${ENV_VAR} environment variable.`,
      401,
      undefined,
    )
  }
  return apiKey
}

function errorResult(error: unknown): { title: string; output: string; metadata: Record<string, unknown> } {
  if (error instanceof DevinApiError) {
    return { title: "Devin API Error", output: error.message, metadata: { status: error.status } }
  }
  if (error instanceof Error) {
    return { title: "Error", output: error.message, metadata: {} }
  }
  return { title: "Error", output: "Unknown error", metadata: {} }
}

function renderSession(s: {
  session_id: string
  status: string
  status_enum?: string | null
  title?: string | null
}): string {
  const title = s.title ?? "untitled"
  const status = s.status_enum ?? s.status
  return `- ${s.session_id} | ${title} | ${status}`
}

const z = tool.schema

export const DevinPlugin: PluginType = async ({ serverUrl }) => {
  // Try to load the stored credential + org_id on startup.
  const startupKey = await resolveApiKey(serverUrl)
  if (startupKey) {
    try {
      await ensureOrgId(startupKey)
    } catch {
      // org_id resolution can fail silently — tools will retry on demand
    }
  }

  return {
    // Register Devin as an auth provider so it shows up in /connect.
    auth: {
      provider: PROVIDER_ID,
      methods: [
        {
          type: "api",
          label: "Devin API key",
          prompts: [
            {
              type: "text",
              key: "apiKey",
              message: "Paste your Devin API key (cog_..., apk_..., or apk_user_...)",
              placeholder: "cog_...",
              validate: (value: string) => {
                if (!value.trim()) return "API key is required"
                if (!value.startsWith("cog_") && !value.startsWith("apk_") && !value.startsWith("apk_user_")) {
                  return "Key must start with cog_, apk_, or apk_user_"
                }
                return undefined
              },
            },
          ],
          authorize: async (inputs) => {
            const key = inputs?.apiKey?.trim()
            if (!key) return { type: "failed" }
            cachedApiKey = key
            cachedOrgId = undefined // re-resolve with new key
            return { type: "success", key, provider: PROVIDER_ID }
          },
        },
      ],
    },

    tool: {
      // --- devin_status ---------------------------------------------------
      devin_status: tool({
        description:
          "Check whether a Devin API key is configured and report the auth source. Takes no input.",
        args: {},
        async execute() {
          const apiKey = await resolveApiKey(serverUrl)
          const source = cachedApiKey
            ? "stored credential (/connect)"
            : apiKey
              ? `environment variable (${ENV_VAR})`
              : "not connected"
          const output =
            source === "not connected"
              ? `Devin is not connected. Run /connect and choose Devin, or set ${ENV_VAR}.`
              : `Devin is connected via ${source}.`
          return { title: "Devin Status", output, metadata: { connected: source !== "not connected", source } }
        },
      }),

      // --- devin_create_session -------------------------------------------
      devin_create_session: tool({
        description:
          "Create a new cloud Devin session with a task prompt and return its session_id and URL. Use this to hand off a self-contained task to Devin. Optionally provide a title, playbook_id, tags, and unlisted flag.",
        args: {
          prompt: z.string().describe("The task description for Devin to work on."),
          title: z.string().optional().describe("Optional custom session title."),
          playbook_id: z.string().optional().describe("Optional playbook ID to run."),
          tags: z.array(z.string()).optional().describe("Optional tags to attach (max 50)."),
          unlisted: z.boolean().optional().describe("If true, the session is not listed by default."),
        },
        async execute(args) {
          try {
            const apiKey = requireApiKey(await resolveApiKey(serverUrl))
            const orgId = await ensureOrgId(apiKey)
            const session = await Devin.createSession(apiKey, orgId, {
              prompt: args.prompt,
              title: args.title,
              playbook_id: args.playbook_id,
              tags: args.tags,
              unlisted: args.unlisted,
            })
            return {
              title: "Devin Session Created",
              output: `Created Devin session ${session.session_id}\nURL: ${session.url}`,
              metadata: session,
            }
          } catch (error) {
            return errorResult(error)
          }
        },
      }),

      // --- devin_list_sessions --------------------------------------------
      devin_list_sessions: tool({
        description:
          "List recent Devin sessions. Returns session_id, title, and status for each. Supports optional limit (default 20), offset, and tag filters.",
        args: {
          limit: z.number().min(1).max(100).optional().describe("Max sessions to return (default 20)."),
          offset: z.number().min(0).optional().describe("Pagination offset (default 0)."),
          tags: z.array(z.string()).optional().describe("Only return sessions with these tags."),
        },
        async execute(args) {
          try {
            const apiKey = requireApiKey(await resolveApiKey(serverUrl))
            const orgId = await ensureOrgId(apiKey)
            const result = await Devin.listSessions(apiKey, orgId, {
              limit: args.limit ?? 20,
              offset: args.offset ?? 0,
              tags: args.tags,
            })
            const lines = result.sessions.map(renderSession)
            const output =
              lines.length > 0
                ? `Devin sessions (${result.sessions.length}):\n${lines.join("\n")}`
                : "No Devin sessions found."
            return { title: "Devin Sessions", output, metadata: result }
          } catch (error) {
            return errorResult(error)
          }
        },
      }),

      // --- devin_get_session ----------------------------------------------
      devin_get_session: tool({
        description:
          "Retrieve details about an existing Devin session: status, metadata, and the full message history.",
        args: {
          session_id: z.string().describe("The Devin session ID."),
        },
        async execute(args) {
          try {
            const apiKey = requireApiKey(await resolveApiKey(serverUrl))
            const orgId = await ensureOrgId(apiKey)
            const session = await Devin.getSession(apiKey, orgId, args.session_id)
            const messageLines = (session.messages ?? []).map(
              (m) => `[${m.timestamp}] ${m.type}: ${m.message}`,
            )
            const output =
              `${renderSession(session)}\n` +
              (messageLines.length > 0
                ? `\nMessages:\n${messageLines.join("\n")}`
                : "\nNo messages yet.")
            return { title: "Devin Session", output, metadata: session }
          } catch (error) {
            return errorResult(error)
          }
        },
      }),

      // --- devin_send_message ---------------------------------------------
      devin_send_message: tool({
        description:
          "Send a message to an active Devin session to provide additional instructions or context. The session must be in a running state.",
        args: {
          session_id: z.string().describe("The Devin session ID."),
          message: z.string().describe("The message to send to Devin."),
        },
        async execute(args) {
          try {
            const apiKey = requireApiKey(await resolveApiKey(serverUrl))
            const orgId = await ensureOrgId(apiKey)
            const result = await Devin.sendMessage(apiKey, orgId, args.session_id, args.message)
            const detail = result?.detail
            return {
              title: "Message Sent",
              output: detail
                ? `Message sent to Devin session ${args.session_id} (${detail}).`
                : `Message sent to Devin session ${args.session_id}.`,
              metadata: { session_id: args.session_id, detail: detail ?? null },
            }
          } catch (error) {
            return errorResult(error)
          }
        },
      }),

      // --- devin_terminate_session ----------------------------------------
      devin_terminate_session: tool({
        description:
          "Terminate an active Devin session. Once terminated, the session cannot be resumed.",
        args: {
          session_id: z.string().describe("The Devin session ID to terminate."),
        },
        async execute(args) {
          try {
            const apiKey = requireApiKey(await resolveApiKey(serverUrl))
            const orgId = await ensureOrgId(apiKey)
            const result = await Devin.terminateSession(apiKey, orgId, args.session_id)
            return {
              title: "Session Terminated",
              output: `Terminated Devin session ${args.session_id}: ${result.detail}`,
              metadata: { session_id: args.session_id, detail: result.detail },
            }
          } catch (error) {
            return errorResult(error)
          }
        },
      }),
    },
  }
}

export default DevinPlugin
