# Vercel CLI Evals

Bare-bones evals infrastructure for the Vercel CLI using [@vercel/agent-eval](https://github.com/vercel-labs/agent-eval). Evals are colocated in `packages/cli/evals/` so CLI maintainers can own them. Scripts are in the CLI `package.json` (collocated with the `build` script).

**Status:** Infrastructure only. The runner discovers evals in `evals/evals/` (dirs with PROMPT.md + EVAL.ts + package.json). If none are found it exits successfully; if any exist it runs `@vercel/agent-eval`. Add evals under `evals/evals/<name>/` when ready.

## Structure

```
packages/cli/
├── package.json      # Contains test:evals and test:evals:dry scripts
├── evals/
│   ├── evals/        # Eval fixtures (add <name>/ with PROMPT.md, EVAL.ts, package.json)
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

The GitHub Action runs on **pull requests** that touch `packages/cli/**`. It runs `pnpm test:evals` from `packages/cli/` (real evals when evals exist). Add these repo secrets when you have evals and want them to run in CI: `VERCEL_OIDC_TOKEN`, and optionally `AI_GATEWAY_API_KEY`, `VERCEL_TOKEN`, `CLI_EVAL_TEAM_ID`, `CLI_EVAL_PROJECT_ID`. Until then, the job exits successfully when there are no evals.

See `.github/workflows/cli-evals.yml`.
