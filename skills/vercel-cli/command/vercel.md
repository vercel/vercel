---
description: Load the Vercel CLI skill for deploying, managing, inspecting, and troubleshooting projects on the Vercel platform. Use when users ask to deploy a project, inspect deployments, debug logs or metrics, check activity, alerts, or usage, set up environment variables, configure domains or DNS, start local development, manage Vercel infrastructure, add databases, integrations, connectors, or Blob stores, configure Sandbox or agent/MCP tooling, or use Vercel API fallback.
---

Load the Vercel CLI skill and help with Vercel project deployment, management, inspection, and troubleshooting.

## Workflow

### Step 1: Select the handwritten workflow reference

Use the decision tree in `SKILL.md` to select the relevant `references/<topic>.md` file for workflows, prerequisites, safety constraints, and troubleshooting.

### Step 2: Confirm exact syntax with the installed CLI

Run `vercel <command> --help` before using uncommon or risky flags — the installed CLI is the syntax authority. Consult `generated/index.md` only to discover which commands exist, their aliases, and global options.

### Step 3: Execute after authorization and safety checks

Verify the project is linked and env vars are pulled if needed; SKILL.md's Project Linking and Anti-Patterns sections are the checklist.

### Step 4: Summarize

Report the commands run, meaningful outputs, and any remaining permission, scope, or subscription limits.

<user-request>
$ARGUMENTS
</user-request>
