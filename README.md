# devin-opencode

An [OpenCode](https://opencode.ai/) plugin that connects your [Devin](https://devin.ai) account and lets the OpenCode agent drive cloud Devin sessions. Works with both **OpenCode v1** (stable) and **OpenCode v2** (beta).

## What it does

- Registers a **Devin** auth provider so you can connect via `/connect` in the OpenCode TUI and paste your API key — no environment variables needed
- Falls back to `DEVIN_API_KEY` env var if you prefer
- Adds 6 tools the OpenCode agent can call to manage cloud Devin sessions

| Tool | Purpose |
| --- | --- |
| `devin_status` | Check if Devin is connected and report auth source |
| `devin_create_session` | Hand off a task to a cloud Devin session |
| `devin_list_sessions` | List recent sessions with status |
| `devin_get_session` | Fetch session details and message history |
| `devin_send_message` | Send a follow-up message to a session |
| `devin_terminate_session` | Stop a running session |

## Quick start

### 1. Install the plugin

**OpenCode v1 (stable):**

```json
// opencode.json
{
  "plugin": ["opencode-devin-plugin"]
}
```

**OpenCode v2 (beta):**

```jsonc
// opencode.jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-devin-plugin/v2"]
}
```

### 2. Connect your Devin account

Run `/connect` in the OpenCode TUI, select **Devin**, and paste your API key.

Get a key at https://app.devin.ai/settings/api-keys — both `cog_` and `apk_` keys work.

Or set it as an environment variable:

```sh
export DEVIN_API_KEY=cog_your_key_here
```

### 3. Use it

Ask the OpenCode agent:

> Use devin_create_session to create a Devin session that refactors my auth module

## Install methods

### From npm

**v1:** `"plugin": ["opencode-devin-plugin"]`
**v2:** `"plugins": ["opencode-devin-plugin/v2"]`

### From source

```sh
git clone https://github.com/karthiknish/devin-opencode.git
cd devin-opencode
npm install
```

Then reference it:

**v1:** `"plugin": ["./devin-opencode/src/legacy.ts"]`
**v2:** `"plugins": [{ "package": "./devin-opencode/src/index.ts" }]`

### Copy into `.opencode/plugins/` (v1 only)

```sh
mkdir -p .opencode/plugins
cp devin-opencode/src/legacy.ts .opencode/plugins/devin.ts
cp devin-opencode/src/devin.ts .opencode/plugins/devin-api.ts
```

Edit `.opencode/plugins/devin.ts` to change `./devin.js` to `./devin-api.ts`.

## Differences between v1 and v2

| Feature | OpenCode v1 (stable) | OpenCode v2 (beta) |
| --- | --- | --- |
| Package path | `opencode-devin-plugin` | `opencode-devin-plugin/v2` |
| Config field | `"plugin"` (singular) | `"plugins"` (plural) |
| Auth | `/connect` + `DEVIN_API_KEY` env var | `/connect` + `DEVIN_API_KEY` env var |
| Binary | `opencode` | `opencode2` |

Both versions support `/connect` for pasting your Devin API key.

## Configuration options (v2 only)

```jsonc
{
  "plugins": [
    {
      "package": "opencode-devin-plugin/v2",
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
  index.ts    # v2 plugin entrypoint (Plugin.define + integration system)
  legacy.ts   # v1 plugin entrypoint (hooks + auth + tool helper) — default export
  devin.ts    # shared typed Devin REST API (v1) client
examples/
  opencode.v2.jsonc  # example config for OpenCode v2
  opencode.v1.json   # example config for OpenCode v1
```

## Releasing

Every push to `main` automatically bumps the patch version and publishes to npm via OIDC trusted publishing. No tokens, no manual steps.

```sh
git push
```

The workflow typechecks, bumps the version, commits it back, and publishes with `--provenance`.

Watch runs at https://github.com/karthiknish/devin-opencode/actions.

## License

MIT
