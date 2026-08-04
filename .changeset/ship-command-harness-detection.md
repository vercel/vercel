---
'vercel': minor
---

Add `vercel ship`, an experimental command that hands the current project to an
AI coding agent installed on your machine along with instructions for configuring
and deploying it on Vercel.

Detects Claude Code, Codex, opencode, pi, and DeepAgents. Use `--list-harnesses`
to see what is available, `--harness` to choose one, `--dry-run` to produce a plan
without changing anything, and `--print-prompt` or `--prompt` to review or override
the instructions sent to the agent.

The agent's progress is streamed live, including each tool call, so a long session
reports what it is doing rather than appearing to hang.
