---
description: Load the Vercel CLI skill for deploying, managing, inspecting, and troubleshooting projects on the Vercel platform. Use when users ask to deploy a project, inspect deployments, debug logs or metrics, check activity, alerts, or usage, set up environment variables, configure domains or DNS, start local development, manage Vercel infrastructure, add databases, integrations, connectors, or Blob stores, configure Sandbox or agent/MCP tooling, or use Vercel API fallback.
---

Load the Vercel CLI skill and help with Vercel project deployment, management, inspection, and troubleshooting.

## Workflow

### Step 1: Identify task type from user request

Use the decision tree in SKILL.md to select the relevant reference file.

### Step 2: Read the reference file

Based on task type, read `references/<topic>.md`. Use `vercel <command> --help` for full flag details before using uncommon or risky flags.

### Step 3: Execute task

**Key things to verify:**

- Run `vercel project inspect --non-interactive` from the intended working directory and confirm the owner and project; stop on `link_required` or a mismatch instead of treating `.vercel/` existence as proof
- Use `vercel pull` for project settings and environment data under `.vercel/`; use `vercel env pull` for `.env.local` or another file that is already excluded from source control
- If login or team SAML re-authentication opens a browser/device flow, wait for deliberate user completion before continuing
- Use `--non-interactive` for prompt-free runs and `--yes` only when confirmation is required
- Use `VERCEL_TOKEN` env var for auth (not `--token`)
- Use first-class CLI commands before `vercel api`
- Use `vercel curl` to access preview deployments; don't disable protection

### Step 4: Summarize

Report the commands run, meaningful outputs, and any remaining permission, scope, or subscription limits.

<user-request>
$ARGUMENTS
</user-request>
