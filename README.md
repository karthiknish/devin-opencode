# devin-opencode

An [OpenCode v2](https://v2.opencode.ai/) plugin that connects your [Devin](https://devin.ai) account and lets the OpenCode agent drive cloud Devin sessions.

## What it does

- Registers a **Devin** integration so you can connect via `/connect` in the OpenCode TUI (API key stored as a credential) or by setting the `DEVIN_API_KEY` environment variable.
- Adds tools the OpenCode agent can call to create, list, inspect, message, and terminate cloud Devin sessions.

| Tool | Purpose |
| --- | --- |
| `devin_status` | Reports whether Devin is connected and the active auth source |
| `devin_create_session` | Hand off a task to a cloud Devin session (prompt, title, playbook, tags) |
| `devin_list_sessions` | List recent sessions with status |
| `devin_get_session` | Fetch session details and full message history |
| `devin_send_message` | Send a follow-up message to an active session |
| `devin_terminate_session` | Stop a running session |

## Prerequisites

- OpenCode v2 beta (`@opencode-ai/cli@next`, binary `opencode2`)
- A Devin API key. Both legacy keys (`apk_` / `apk_user_`) and current service-user keys (`cog_`) work against the Devin v1 API. Generate one at https://app.devin.ai/settings/api-keys.

## Install

### As a published package

Add to your project's `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-devin-plugin"]
}
```

### From source (local development)

1. Clone this repo into your project (or a sibling directory).
2. Install dependencies so OpenCode can resolve the plugin's imports:

   ```sh
   cd devin-opencode
   npm install
   ```

3. Reference the entrypoint from `opencode.jsonc`:

   ```jsonc
   {
     "$schema": "https://opencode.ai/config.json",
     "plugins": [
       { "package": "./devin-opencode/src/index.ts" }
     ]
   }
   ```

   Use an absolute path or `file://` URL if the plugin lives outside your project.

## Connect your Devin account

Either:

- Run `/connect` in the OpenCode TUI, select **Devin**, and paste your API key. The key is stored as an OpenCode credential.

Or:

- `export DEVIN_API_KEY=cog_your_key_here` (or `apk_...`).

## Verify it loaded

```sh
opencode2 api get /api/plugin
```

You should see `devin.opencode` in the active plugin list. Then ask the OpenCode agent something like:

> Use devin_status to check if my Devin account is connected.

## Configuration options

Pass options via the object form in `opencode.jsonc`:

```jsonc
{
  "plugins": [
    {
      "package": "./devin-opencode/src/index.ts",
      "options": { "integrationId": "devin" }
    }
  ]
}
```

| Option | Default | Description |
| --- | --- | --- |
| `integrationId` | `"devin"` | Override the integration ID (e.g. for multiple Devin accounts). |

## Project layout

```
src/
  index.ts   # plugin entrypoint: integration registration + tools
  devin.ts   # typed Devin REST API (v1) client
opencode.jsonc  # example config
```

## Notes

- The OpenCode v2 plugin API is beta; entrypoints and contracts may change before OpenCode 2.0 is stable. Match the `@opencode-ai/plugin` version to your OpenCode release.
- API keys are resolved at tool-call time from the stored credential, falling back to `DEVIN_API_KEY`. No key is logged or persisted by the plugin beyond what OpenCode's credential store holds.

## License

MIT
