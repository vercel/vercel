# Vercel CLI Agent Context

## Quick Start
Set VERCEL_TOKEN, then: vercel deploy --yes --non-interactive

## Critical Rules
- Always pass --non-interactive and --yes for unattended operation
- Parse JSON from stdout for structured responses
- Check exit codes: 0=success, 1=api, 2=auth, 3=validation, 4=config, 5=internal
- Never pass secrets via CLI flags — use VERCEL_TOKEN env var
- Use --dry-run to validate before executing
- Use --describe to introspect command schemas as JSON

## Workflow
1. vercel login (requires human for browser OAuth)
2. vercel link --yes --project <name> --team <slug>
3. vercel deploy --yes --non-interactive

## Error Recovery
Parse stdout JSON, follow next[] commands to resolve errors.
When userActionRequired: true, surface to human.
