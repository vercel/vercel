<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel mcp

Set up MCP agents and configuration for Vercel integration

```
vercel mcp [options]
```

## Options

- `--clients <CLIENTS>` — Comma-separated list of MCP clients to set up. In interactive mode, skips the client picker when set. Required in non-interactive mode. Options: Claude Code, Claude.ai and Claude for desktop, Cursor, VS Code with Copilot
- `--project` — Set up project-specific MCP access for the currently linked project

## Examples

Interactively set up MCP agents

```
$ vercel mcp
```

Set up project-specific MCP access

```
$ vercel mcp --project
```

Non-interactive: set up Cursor and VS Code

```
$ vercel mcp --clients "Cursor,VS Code with Copilot"
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
