/**
 * Legacy entry point for OpenCode v1 (stable).
 *
 * OpenCode v1 plugins are modules that export one or more plugin functions.
 * Each function receives a context object and returns a hooks object. Custom
 * tools are registered via the `tool` hook using the `tool()` helper from
 * `@opencode-ai/plugin`.
 *
 * Unlike the v2 plugin, v1 has no integration/credential system, so the Devin
 * API key is read from the DEVIN_API_KEY environment variable.
 *
 * Reference: https://opencode.ai/docs/plugins
 */
import { tool, type Plugin as PluginType } from "@opencode-ai/plugin"
import { Devin, DevinApiError } from "./devin.js"

const ENV_VAR = "DEVIN_API_KEY"

function getApiKey(): string {
  const apiKey = process.env[ENV_VAR]
  if (!apiKey) {
    throw new DevinApiError(
      `Devin API key not found. Set the ${ENV_VAR} environment variable with your Devin API key (cog_..., apk_..., or apk_user_...).`,
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

export const DevinPlugin: PluginType = async () => {
  return {
    tool: {
      // --- devin_status ---------------------------------------------------
      devin_status: tool({
        description:
          "Check whether a Devin API key is configured. Takes no input.",
        args: {},
        async execute() {
          const connected = !!process.env[ENV_VAR]
          const output = connected
            ? `Devin is connected via environment variable (${ENV_VAR}).`
            : `Devin is not connected. Set the ${ENV_VAR} environment variable.`
          return { title: "Devin Status", output, metadata: { connected } }
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
            const session = await Devin.createSession(getApiKey(), {
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
            const result = await Devin.listSessions(getApiKey(), {
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
            const session = await Devin.getSession(getApiKey(), args.session_id)
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
            const result = await Devin.sendMessage(getApiKey(), args.session_id, args.message)
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
            const result = await Devin.terminateSession(getApiKey(), args.session_id)
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
