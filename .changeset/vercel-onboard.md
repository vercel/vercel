---
'vercel': minor
---

Add `vercel onboard`, an experimental command that hands the current project to an
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
services, deployment-intent files, usable teams, and the marketplace catalog —
so the agent starts from facts instead of rediscovery. Where the layout allows
it, preflight goes further and renders the exact, validated `vercel.json` the
CLI itself would write — services, entrypoints, and correctly ordered
rewrites — so configuration becomes writing a known-good file and building
once rather than deriving config by trial and error.

The session is engineered for wall time, and verification is the CLI's own
measurement: the agent authors a small `verify.json` manifest — the routes to
check and what each one proves — and `vercel onboard verify` executes it
deterministically, authenticating through Deployment Protection, comparing
statuses and bodies in CLI code, and journaling a typed result the final
report reads, so "12/12 checks passed" is measured, never claimed.
Provisioning starts as soon as the plan is approved, in parallel with
configuration. The timing
report separates time spent waiting on the user from time the machine worked,
and each turn records how much of it was model latency and across how many
round-trip gaps, so regressions in the agent loop are measurable.

Sessions are supervised through one environment variable and plain files.
Commands that spend money, touch production, or delete remote resources pause
inside the CLI and ask for approval before executing (Enter approves; a denial
can carry a steering line relayed to the agent verbatim). Every command
journals into a per-run `ledger.ndjson`, with effect sites recording outcomes
from typed data — deployments with their real URL and target, resources
provisioned with the billing plan the platform selected, projects created and
removed — so what the session did is reported from the machine's own record:
one table of resource, observed status, and cost, where cost is the billing
plan's own stated price and detail lines relayed verbatim — never parsed,
summed, or estimated by the CLI. A domain alias is
folded under its deployment rather than reported as a second one. Teardown is a ledger-driven
follow-up rather than a generated script. When the account has more than one
team, `vercel onboard` asks which to use before the session starts and pins it into the
context — the team is account state the CLI can enumerate, not something an
agent should guess. A session `vercel`/`vc` shim execs
the very CLI running the session, so a stale global install can never bypass the gate
or the ledger.

Press esc at any time to interrupt the agent and steer: the turn pauses at
the next safe point, never mid-command, and your instruction becomes the next
turn of the same conversation — course-correct the moment you see the agent
heading the wrong way, without losing the session. Press ctrl+t to pause the
same way and continue the conversation in the agent's own interface; both
options are also offered after every turn. Approval
gates stay enforced there: the TUI is frozen while the prompt takes a clean
alternate screen, and thaws when you answer. On exit, `vercel onboard` replays what
happened natively into its transcript through the harness's history API,
reports any new outcomes from the ledger, and the next orchestrated turn picks
up with full context.

Every run is profiled end to end, with the breakdown printed at the finish and
the full profile written to the global config directory. Until the required
harness capabilities are published, point `VERCEL_ONBOARD_HARNESS_SOURCE` at a
built checkout of `vercel/ai` to run against those packages instead of the
registry.
