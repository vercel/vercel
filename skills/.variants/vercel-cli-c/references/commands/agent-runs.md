<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel agent-runs

Inspect Agent Runs observability data

```
vercel agent-runs <command>
```

## Subcommands

### `vercel agent-runs inspect`

Show metadata, lifecycle events, usage, and subagent data for an Agent Run

```
vercel agent-runs inspect <runId> [options]
```

#### Options

- `--environment <production|preview>` — Environment to query Agent Runs from (default: production)
- `--json` — Print the raw API response as JSON to stdout
- `--project <NAME|ID>` — Project name or id to query (overrides the linked project)
- `--since <TIME>` — Only include Agent Runs after this time (ISO 8601 or relative: 1h, 30m, 7d)
- `--until <TIME>` — Only include Agent Runs before this time (requires --since; default: now)

#### Examples

Inspect an Agent Run

```
$ vercel agent-runs inspect run_1234567890
```

Print the raw Agent Run as JSON

```
$ vercel agent-runs inspect run_1234567890 --json
```

### `vercel agent-runs list`

List Agent Runs for a project

Aliases: `ls`

```
vercel agent-runs list [options]
```

#### Options

- `--environment <production|preview>` — Environment to query Agent Runs from (default: production)
- `--json` — Print the raw API response as JSON to stdout
- `-n, --limit <N>` — Number of Agent Runs per page (max: 100)
- `--page <N>` — 1-based page number (default: 1)
- `--project <NAME|ID>` — Project name or id to query (overrides the linked project)
- `--search <TEXT>` — Search Agent Runs by title
- `--since <TIME>` — Only include Agent Runs after this time (ISO 8601 or relative: 1h, 30m, 7d)
- `--until <TIME>` — Only include Agent Runs before this time (requires --since; default: now)

#### Examples

List recent production Agent Runs for the linked project

```
$ vercel agent-runs list
```

List preview Agent Runs from the last day

```
$ vercel agent-runs list --environment preview --since 1d
```

Search Agent Runs by title

```
$ vercel agent-runs list --search "checkout"
```

List Agent Runs for a specific team and project

```
$ vercel agent-runs list --scope my-team --project my-app
```

Print the raw list as JSON

```
$ vercel agent-runs list --json
```

### `vercel agent-runs projects`

List projects in the current team with Agent Runs activity

```
vercel agent-runs projects [options]
```

#### Options

- `--environment <production|preview>` — Environment to query Agent Runs from (default: production)
- `--json` — Print the raw API response as JSON to stdout
- `--since <TIME>` — Only include Agent Runs after this time (ISO 8601 or relative: 1h, 30m, 7d)
- `--until <TIME>` — Only include Agent Runs before this time (requires --since; default: now)

#### Examples

List projects with Agent Runs activity

```
$ vercel agent-runs projects
```

List projects with Agent Runs activity in another team

```
$ vercel agent-runs projects --scope my-team
```

### `vercel agent-runs trace`

Show the trace for an Agent Run (turns, messages, reasoning, and tool calls)

```
vercel agent-runs trace <runId> [options]
```

#### Options

- `--environment <production|preview>` — Environment to query Agent Runs from (default: production)
- `--json` — Print the raw API response as JSON to stdout
- `--max-field-length <N>` — Maximum length for individual string fields in the trace (default: 8000; 0 disables truncation)
- `--project <NAME|ID>` — Project name or id to query (overrides the linked project)
- `--since <TIME>` — Only include Agent Runs after this time (ISO 8601 or relative: 1h, 30m, 7d)
- `--until <TIME>` — Only include Agent Runs before this time (requires --since; default: now)

#### Examples

Show the trace for an Agent Run

```
$ vercel agent-runs trace run_1234567890
```

Print the raw trace as JSON without truncation

```
$ vercel agent-runs trace run_1234567890 --json --max-field-length 0
```

## Examples

List recent production Agent Runs for the linked project

```
$ vercel agent-runs list
```

List projects with Agent Runs activity

```
$ vercel agent-runs projects
```

Inspect an Agent Run

```
$ vercel agent-runs inspect run_1234567890
```

Show the trace for an Agent Run

```
$ vercel agent-runs trace run_1234567890
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
