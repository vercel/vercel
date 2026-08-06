---
'vercel': minor
---

Add `vercel ship`, an experimental command that hands the current project to an
AI coding agent already installed on your machine — Claude Code, Codex,
opencode, pi, or DeepAgents — along with instructions for configuring and
deploying it on Vercel. Use `--list-harnesses` to see what is available,
`--harness` to choose one, `--dry-run` to plan without changing anything, and
`--print-prompt` or `--prompt` to review or override the instructions.

The agent runs on your machine, as you, in your project directory, and every
line of the session is attributed: the CLI, the agent, and each command
executed get their own labelled column, reasoning collapses to how long it took
(`--verbose` restores it), and text wraps grapheme- and east-asian-width-aware
with commands cut rather than folded. Preflight injects the CLI's own
deterministic analysis — frameworks per directory, workspace manager, inferred
services, deployment-intent files, usable teams — so the agent starts from
facts instead of rediscovery.

Sessions are supervised through one environment variable and plain files.
Commands that spend money, touch production, or delete remote resources pause
inside the CLI and ask for approval before executing (Enter approves; a denial
can carry a steering line relayed to the agent verbatim). Every command
journals into a per-run `ledger.ndjson`, with effect sites recording outcomes
from typed data — deployments with their real URL and target, resources
provisioned, projects created and removed — so what the session did is
reported from the machine's own record, and teardown is a ledger-driven
follow-up rather than a generated script. A session `vercel`/`vc` shim execs
the very CLI running ship, so a stale global install can never bypass the gate
or the ledger.

Press ctrl+t at any time to pause the agent — the turn is interrupted at the
next safe point, never mid-command — and continue the same conversation in the
agent's own interface; the option is also offered after every turn. Approval
gates stay enforced there: the TUI is frozen while the prompt takes a clean
alternate screen, and thaws when you answer. On exit, ship replays what
happened natively into its transcript through the harness's history API,
reports any new outcomes from the ledger, and the next orchestrated turn picks
up with full context.

Every run is profiled end to end, with the breakdown printed at the finish and
the full profile written to the global config directory. Until the required
harness capabilities are published, point `VERCEL_SHIP_HARNESS_SOURCE` at a
built checkout of `vercel/ai` to run against those packages instead of the
registry.
