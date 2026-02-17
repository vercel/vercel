# Vercel CLI Evals

Bare-bones evals infrastructure for the Vercel CLI using [@vercel/agent-eval](https://github.com/vercel-labs/agent-eval). Evals are colocated in `packages/cli/evals/` so CLI maintainers can own them.

**Status:** Infrastructure only. The runner discovers evals in `evals/` (dirs with PROMPT.md + EVAL.ts + package.json). If none are found it exits successfully; if any exist it runs `@vercel/agent-eval`. Add evals under `evals/<name>/` when ready.

## Structure

```
packages/cli/evals/
├── evals/           # Eval fixtures (add <name>/ with PROMPT.md, EVAL.ts, package.json)
├── experiments/
│   └── cli.ts
├── run.ts           # Discovers evals → 0 evals: exit 0; 1+: run agent-eval
├── .env.example
└── package.json
```

## Commands

From `packages/cli/evals/`:

- **`pnpm test:dry`** — Preview what would run (no API calls, no credentials needed). CI runs this.
- **`pnpm test`** — Run evals (requires credentials; add evals first).

## CI

The GitHub Action runs on **pull requests** that touch `packages/cli/**`. It runs `pnpm test` (real evals when evals exist). Add these repo secrets when you have evals and want them to run in CI: `VERCEL_OIDC_TOKEN`, and optionally `AI_GATEWAY_API_KEY`, `VERCEL_TOKEN`, `CLI_EVAL_TEAM_ID`, `CLI_EVAL_PROJECT_ID`. Until then, the job exits successfully when there are no evals.

See `.github/workflows/cli-evals.yml`.
