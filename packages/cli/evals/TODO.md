# CLI Evals Initiative TODO

## P0: Deployed Results UI / Dashboard

- Define the deployed dashboard as the primary way to consume CLI eval results, instead of relying on the GitHub Actions workflow view.
- Wire the weekly eval run to publish results into the dashboard pipeline on every scheduled run.
- Use the existing agent-eval result folder plus the canonical upload script as the source of truth for ingestion.
- Store results by run, eval, variant, and command so we can compare:
  - week over week
  - with-skills vs without-skills
  - linked-project vs no-linked-project
  - logged-in vs not-logged-in
- Build the first dashboard views:
  - overall pass/fail summary for the latest weekly run
  - per-command breakdown
  - per-variant breakdown
  - trend view across weekly runs
  - drilldown into a single eval with links to raw artifacts and the originating GitHub Action
- Make the dashboard usable for release evaluation:
  - surface regressions clearly
  - make it easy to compare the latest run against the previous weekly baseline
  - make it easy to identify which command and which variant failed
- Backfill or preserve enough historical data so the weekly dashboard is useful immediately, not only after several future runs.
- Document the operational flow:
  - where results are uploaded
  - how the dashboard is deployed
  - what happens on ingestion failures
  - how to debug mismatches between GitHub Actions and the UI

## P1: Strengthen The Weakest Current Evals

- `login-whoami`
  - Verify the command produced an authenticated identity, not only that `whoami` was invoked.
  - Verify the agent reports the result clearly.
- `login-not-logged-in`
  - Verify the not-logged-in starting state.
  - Verify the login flow actually succeeds when required.
  - Verify the follow-up `whoami` confirms the authenticated identity.
- `non-interactive`
  - Verify the target operation actually completes, not only that a `--yes`-style flag appears in telemetry.
  - Verify the agent does not stall on prompts.
- `curl/explicit`
  - Verify the CLI request succeeds against the deployment, not only that `vc curl` was run.
  - Verify the agent can interpret and report whether the project is serving traffic.
- `curl/implicit`
  - Keep the inference aspect, but also verify the resulting answer is grounded in a successful CLI request.
- `env/ls`
  - Verify the command returns environment data for the linked project, not only that an `env ls`-style command was executed.
  - Add checks for expected structure or known keys/targets in the returned output.

## P1.5: Expand CLI Command Coverage

- Add dedicated evals for additional high-value CLI commands:
  - `link`
  - `project ls`
  - `project inspect`
  - `list`
  - `inspect`
  - `pull`
  - `logs`
  - `alias`
- Start with `vc link` using the existing eval fixture pattern:
  - prompt the agent to perform a fresh non-interactive link
  - verify linked project state in `.vercel/project.json`
  - verify the agent actually used `vercel link` / `vc link`

## P2: Harness / Evaluation Quality Follow-Ups

- Reduce reliance on command-shape-only assertions where live state or filesystem checks are practical.
- Add shared helpers for:
  - reading and querying `__agent_eval__/results.json`
  - asserting stdout/stderr content
  - checking linked project state
  - verifying live Vercel resources
- Tighten the contract between prompts and verifiers so prompts describe the exact outcome we score.
- Review whether the canonical eval list in `experiments/cli.ts` should remain hardcoded or should be derived from discovered evals.
