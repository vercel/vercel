---
description: Load the Marketplace skill for installing integrations, managing resources, handling billing, and working with managed infrastructure. Use when users ask to "add a database", "install an integration", "set up Postgres", "check billing balance", "manage resources", or provision any Marketplace service.
---

Load the Marketplace skill and help with integration management.

## Workflow

### Step 1: Load marketplace skill

```
skill({ name: 'marketplace' })
```

### Step 2: Identify task type from user request

Use the decision tree in SKILL.md to select the relevant reference file.

### Step 3: Read the reference file

Based on task type, read `references/<topic>.md`. Use `vercel <command> -h` for full flag details.

### Step 4: Execute task

**Key things to verify:**

- Correct team selected (`vercel whoami`)
- Project is linked if you want auto-connect and env pull (`.vercel/` directory)
- Use `--yes` in CI/agent contexts for `ir remove`, `ir disconnect`, `integration remove`

### Step 5: Summarize

```
=== Marketplace Task Complete ===

Topic: <topic>
<brief summary of what was done>
```

<user-request>
$ARGUMENTS
</user-request>
