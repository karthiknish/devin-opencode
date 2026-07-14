# devin-opencode

An [OpenCode](https://opencode.ai/) plugin that connects your [Devin](https://devin.ai) account and lets the OpenCode agent drive cloud Devin sessions. Supports both **OpenCode v1** (stable) and **OpenCode v2** (beta).

## What it does

- Connects your Devin account using your Devin API key
- Adds tools the OpenCode agent can call to create, list, inspect, message, and terminate cloud Devin sessions

| Tool | Purpose |
| --- | --- |
| `devin_status` | Reports whether Devin is connected and the active auth source |
| `devin_create_session` | Hand off a task to a cloud Devin session (prompt, title, playbook, tags) |
| `devin_list_sessions` | List recent sessions with status |
| `devin_get_session` | Fetch session details and full message history |
| `devin_send_message` | Send a follow-up message to an active session |
| `devin_terminate_session` | Stop a running session |

### Differences between v1 and v2

| Feature | OpenCode v1 (stable) | OpenCode v2 (beta) |
| --- | --- | --- |
| Entry point | `opencode-devin-plugin/legacy` | `opencode-devin-plugin` |
| Config field | `"plugin"` (singular) | `"plugins"` (plural) |
| Auth | `DEVIN_API_KEY` env var only | `/connect` TUI flow **or** `DEVIN_API_KEY` env var |
| Binary | `opencode` | `opencode2` |
| Plugin API | Named export function + hooks | `Plugin.define` + integration system |

## Prerequisites

- **OpenCode** — either v1 (`opencode-ai`, binary `opencode`) or v2 beta (`@opencode-ai/cli@next`, binary `opencode2`)
- A **Devin API key**. Both legacy keys (`apk_` / `apk_user_`) and current service-user keys (`cog_`) work. Generate one at https://app.devin.ai/settings/api-keys.

## Install

### Option A: From npm (published package)

#### OpenCode v2 (beta)

Add to your project's `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-devin-plugin"]
}
```

#### OpenCode v1 (stable)

Add to your project's `opencode.json`:

```json
{
  "plugin": ["opencode-devin-plugin/legacy"]
}
```

### Option B: From source (local development)

1. Clone this repo:

   ```sh
   git clone https://github.com/karthiknish/devin-opencode.git
   cd devin-opencode
   npm install
   ```

2. Reference the plugin from your OpenCode config:

   **OpenCode v2 (beta)** — `opencode.jsonc`:

   ```jsonc
   {
     "$schema": "https://opencode.ai/config.json",
     "plugins": [
       { "package": "./devin-opencode/src/index.ts" }
     ]
   }
   ```

   **OpenCode v1 (stable)** — `opencode.json`:

   ```json
   {
     "plugin": ["./devin-opencode/src/legacy.ts"]
   }
   ```

   Use an absolute path or `file://` URL if the plugin lives outside your project.

### Option C: Copy into `.opencode/plugins/` (v1 only, simplest)

1. Copy `src/legacy.ts` and `src/devin.ts` into `.opencode/plugins/` in your project:

   ```sh
   mkdir -p .opencode/plugins
   cp devin-opencode/src/legacy.ts .opencode/plugins/devin.ts
   cp devin-opencode/src/devin.ts .opencode/plugins/devin-api.ts
   ```

   Then edit `.opencode/plugins/devin.ts` to change the import path from `./devin.js` to `./devin-api.ts`.

2. Add a `package.json` in `.opencode/` so dependencies are installed:

   ```sh
   cd .opencode
   echo '{"dependencies":{"@opencode-ai/plugin":"latest"}}' > package.json
   ```

   OpenCode v1 runs `bun install` at startup to install these.

3. The plugin is auto-loaded from `.opencode/plugins/` — no config entry needed.

## Connect your Devin account

### OpenCode v2 (beta)

Either:

- Run `/connect` in the OpenCode TUI, select **Devin**, and paste your API key. The key is stored as an OpenCode credential.

Or:

- `export DEVIN_API_KEY=cog_your_key_here` (or `apk_...`).

### OpenCode v1 (stable)

Set the environment variable before launching `opencode`:

```sh
export DEVIN_API_KEY=cog_your_key_here
opencode
```

You can also add it to your shell profile (`.bashrc`, `.zshrc`, etc.) for persistence.

## Verify it loaded

**OpenCode v2:**

```sh
opencode2 api get /api/plugin
```

You should see `devin.opencode` in the active plugin list.

**OpenCode v1:**

The plugin loads automatically at startup. Check the OpenCode logs if tools don't appear.

Then ask the OpenCode agent:

> Use devin_status to check if my Devin account is connected.

## Configuration options (v2 only)

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
  index.ts    # v2 plugin entrypoint: integration registration + tools (default export)
  legacy.ts   # v1 plugin entrypoint: hooks-based tools (named export DevinPlugin)
  devin.ts    # shared typed Devin REST API (v1) client
opencode.jsonc  # example config for v2
```

## Notes

- The OpenCode v2 plugin API is beta; entrypoints and contracts may change before OpenCode 2.0 is stable. Match the `@opencode-ai/plugin` version to your OpenCode release.
- In v2, API keys are resolved at tool-call time from the stored credential, falling back to `DEVIN_API_KEY`. In v1, only `DEVIN_API_KEY` is used.
- No key is logged or persisted by the plugin beyond what OpenCode's credential store (v2) or environment (v1) holds.

## Releasing

Publishing to npm is automated via GitHub Actions using **trusted publishing (OIDC)** — no npm tokens stored in GitHub secrets. CI runs typecheck on every push and PR; pushing a `v*` tag triggers a publish to npm with provenance.

### One-time setup (already done)

Trusted publishing is configured on npm for this package:

- **Package**: `opencode-devin-plugin`
- **Publisher**: GitHub Actions
- **Repository**: `karthiknish/devin-opencode`
- **Workflow filename**: `publish.yml`

No `NPM_TOKEN` secret is needed. npm trusts the workflow based on its OIDC identity.

### Release a new version

```sh
# 1. Bump the version (updates package.json + creates a commit)
npm version patch    # 0.1.0 → 0.1.1  (bug fixes)
npm version minor    # 0.1.0 → 0.2.0  (new features, backwards-compatible)
npm version major    # 0.1.0 → 1.0.0  (breaking changes)

# 2. Push
git push

# 3. The Publish workflow runs automatically:
#    - installs deps
#    - typechecks
#    - checks if the version is new (skips if already on npm)
#    - publishes to npm via OIDC trusted publishing with --provenance
```

The workflow compares the version in `package.json` against what's on npm — if they match, it skips. So regular pushes that don't bump the version are a no-op.

Watch the run at https://github.com/karthiknish/devin-opencode/actions. The package appears at https://www.npmjs.com/package/opencode-devin-plugin once the workflow succeeds.

### Manual publish (fallback)

If you ever need to publish from your machine instead:

```sh
npm login
npm publish --access public
```

## License

MIT
