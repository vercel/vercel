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

The GitHub Action runs on **pull requests** that touch `packages/cli/**`. It runs a dry run only so no credentials are required. When you add evals and configure secrets (e.g. `VERCEL_OIDC_TOKEN`), you can switch the workflow to run `pnpm test` instead of `pnpm test:dry`.

See `.github/workflows/cli-evals.yml`.
