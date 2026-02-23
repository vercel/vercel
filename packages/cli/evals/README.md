# Vercel CLI Evals

Bare-bones evals infrastructure for the Vercel CLI using [@vercel/agent-eval](https://github.com/vercel-labs/agent-eval). Evals are colocated in `packages/cli/evals/` so CLI maintainers can own them. Scripts are in the CLI `package.json` (collocated with the `build` script).

**Status:** Evals: **non-interactive** (prefer non-interactive flags for `vercel link`), **build** (run `vc build` on a minimal static site), **env/** (all env evals in one directory: **env/ls**, **env/add**, **env/pull**, **env/update**, **env/remove**). The runner discovers evals recursively in `evals/evals/` (any dir with PROMPT.md + EVAL.ts + package.json). If none are found it exits successfully; if any exist it runs `@vercel/agent-eval`. Add evals under `evals/evals/<name>/` (or nested, e.g. `evals/evals/env/add/`).

**Env evals and unique keys:** Evals that create env vars (env/add, env/update, env/remove) require a **unique variable name per run** (e.g. `EVAL_ADD_<timestamp>`, `EVAL_UPDATE_<timestamp>`, `EVAL_REMOVE_<timestamp>`) so concurrent or repeated runs do not overwrite the same variable. The prompt instructs the agent to choose such a key and write it to `env-key-used.txt`; the EVAL asserts the prefix.

## Structure

```
packages/cli/
├── package.json      # Contains test:evals and test:evals:dry scripts
├── evals/
│   ├── evals/        # Eval fixtures (PROMPT.md + EVAL.ts + package.json; discovery is recursive, e.g. env/add, env/ls)
│   ├── experiments/
│   │   └── cli.ts
│   ├── run.ts        # Discovers evals → 0 evals: exit 0; 1+: run agent-eval
│   └── .env.example
└── dist/
    └── vc.js         # Local CLI build (agents can use this instead of npm install vercel)
```

## Commands

From `packages/cli/`:

- **`pnpm test:evals:dry`** — Preview what would run (no API calls, no credentials needed).
- **`pnpm test:evals`** — Run evals (requires credentials; add evals first).

## Using Local CLI Build

When evals are added, agents in the sandbox can use the local CLI build (`dist/vc.js`) instead of installing from npm. Configure this in experiment setup or sandbox environment:

- Set `PATH` to include `packages/cli/dist` so `vc` or `vercel` commands use the local build
- Or install globally: `npm install -g packages/cli/dist/vc.js`

## CI

The GitHub Action runs on **pull requests** that touch `packages/cli/**`. It runs `pnpm test:evals` from `packages/cli/`. Evals use **separate repo secrets** (EVAL\_\*) so you can point to a dedicated evals team:

| GitHub secret             | Passed as env       | Purpose                               |
| ------------------------- | ------------------- | ------------------------------------- |
| `EVAL_AI_GATEWAY_API_KEY` | AI_GATEWAY_API_KEY  | Agent + classifier (required)         |
| `EVAL_TOKEN`              | VERCEL_TOKEN        | Vercel API / sandbox (as in test.yml) |
| `EVAL_TEAM_ID`            | CLI_EVAL_TEAM_ID    | Evals team ID                         |
| `EVAL_PROJECT_ID`         | CLI_EVAL_PROJECT_ID | Evals project ID                      |

Until these are set and evals exist, the job fails with a clear message. See `.github/workflows/cli-evals.yml`.

## Getting credentials

Same pattern as other CLI workflows: **VERCEL_TOKEN** (long-lived access token) for Vercel API/sandbox, plus **AI Gateway API key** for the agent.

1. **Vercel token:** Create a [Vercel access token](https://vercel.com/account/tokens) with access to the evals team. Add as repo secret `EVAL_TOKEN` (workflow passes it as `VERCEL_TOKEN`).
2. **AI Gateway API key:** [AI Gateway → API Keys](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys) in the dashboard → Create key → add as repo secret `EVAL_AI_GATEWAY_API_KEY`.
3. **Local:** put `AI_GATEWAY_API_KEY` and (if needed) `VERCEL_TOKEN` in `packages/cli/evals/.env`.
