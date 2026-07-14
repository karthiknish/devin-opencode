# devin-opencode

An [OpenCode](https://opencode.ai/) plugin that connects your [Devin](https://devin.ai) account and lets the OpenCode agent drive cloud Devin sessions. Works with both **OpenCode v1** (stable) and **OpenCode v2** (beta).

## What it does

- Adds 6 tools the OpenCode agent can call to manage cloud Devin sessions
- Configure via environment variables (`DEVIN_API_KEY` + `DEVIN_ORG_ID`)
- Uses the Devin v3 API with `cog_` service user keys (also supports legacy `apk_`/`apk_user_` keys via v1 fallback)

| Tool | Purpose |
| --- | --- |
| `devin_status` | Check if Devin is connected and report auth source |
| `devin_create_session` | Hand off a task to a cloud Devin session |
| `devin_list_sessions` | List recent sessions with status |
| `devin_get_session` | Fetch session details and message history |
| `devin_send_message` | Send a follow-up message to a session |
| `devin_terminate_session` | Stop a running session |

## Quick start

### 1. Get a Devin API key

1. Go to **Settings > Service users** in the Devin app and create a service user with a role that has `UseDevinSessions` and `ViewOrgSessions` permissions
2. Generate an API key — it starts with `cog_`
3. Find your **organization ID** on the same page (starts with `org-`)

> Legacy `apk_` and `apk_user_` keys still work but are deprecated. The plugin automatically uses v1 endpoints for them.

### 2. Install the plugin

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

### 3. Set your credentials

Set environment variables in your shell profile (`~/.zshrc` or `~/.bashrc`):

```sh
export DEVIN_API_KEY=cog_your_key_here
export DEVIN_ORG_ID=org-your_org_id_here
```

`DEVIN_ORG_ID` is optional — if not set, the plugin auto-discovers it from the Devin CLI config (`~/.config/devin/config.json`) or the `/v3/organizations` API.

> **Note:** Devin is a tool service, not an LLM provider, so it won't appear in the `/connect` command. Use environment variables instead.

### 4. Use it

Ask the OpenCode agent:

> Use devin_create_session to create a Devin session that refactors my auth module

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DEVIN_API_KEY` | Yes (if not using `/connect`) | Your Devin API key (`cog_...`, `apk_...`, or `apk_user_...`) |
| `DEVIN_ORG_ID` | No | Your Devin organization ID (`org-...`). If not set, the plugin auto-discovers it from the Devin CLI config (`~/.config/devin/config.json`) or the `/v3/organizations` API. |

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

## Differences between v1 and v2

| Feature | OpenCode v1 (stable) | OpenCode v2 (beta) |
| --- | --- | --- |
| Package path | `opencode-devin-plugin` | `opencode-devin-plugin/v2` |
| Config field | `"plugin"` (singular) | `"plugins"` (plural) |
| Auth | `DEVIN_API_KEY` env var | `DEVIN_API_KEY` env var |
| Binary | `opencode` | `opencode2` |

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

## API versioning

The plugin uses the **Devin v3 API** (`/v3/organizations/{org_id}/sessions`) for `cog_` service user keys, which is the current recommended API. For legacy `apk_`/`apk_user_` keys, it automatically falls back to the deprecated v1 API (`/v1/sessions`).

| Key type | API version | Status |
| --- | --- | --- |
| `cog_` (service user) | v3 | Current, recommended |
| `apk_user_` (personal) | v1 (fallback) | Deprecated |
| `apk_` (service) | v1 (fallback) | Deprecated |

## Project layout

```
src/
  index.ts    # v2 plugin entrypoint (Plugin.define + integration system)
  legacy.ts   # v1 plugin entrypoint (hooks + auth + tool helper) — default export
  devin.ts    # shared typed Devin REST API client (v3 + v1 fallback)
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
