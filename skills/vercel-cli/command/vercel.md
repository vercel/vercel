---
description: Load the Vercel CLI skill for deploying, managing, and developing projects on the Vercel platform. Use when users ask to "deploy a project", "set up environment variables", "configure a domain", "start local development", manage Vercel infrastructure, "add a database", "install an integration", "connect a third-party service", or manage Marketplace integrations.
---

Load the Vercel CLI skill and help with project deployment and management.

## Workflow

### Step 1: Load vercel-cli skill

```
skill({ name: 'vercel-cli' })
```

### Step 2: Identify task type from user request

Use the decision tree in SKILL.md to select the relevant reference file.

### Step 3: Read the reference file

Based on task type, read `references/<topic>.md`. Use `vercel <command> -h` for full flag details.

### Step 4: Execute task

**Key things to verify:**

- Project is linked (`.vercel/` directory exists)
- Env vars are pulled if needed (`vercel pull`)
- Use `--yes` in CI/agent contexts
- Use `VERCEL_TOKEN` env var for auth (not `--token`)
- Use `vercel curl` to access preview deployments (don't disable protection)

### Step 5: Summarize

```
=== Vercel CLI Task Complete ===

Topic: <topic>
<brief summary of what was done>
```

<user-request>
$ARGUMENTS
</user-request>
