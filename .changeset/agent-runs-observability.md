---
'vercel': minor
---

Add a `vercel agent-runs` command for Agent Runs observability: `list` lists Agent Runs for a project, `inspect <runId>` shows run metadata, events, usage, and subagents, `trace <runId>` shows the full trace (turns, messages, reasoning, and tool calls), and `projects` lists projects in the team with Agent Runs activity. All subcommands support `--json` for machine-readable output.
