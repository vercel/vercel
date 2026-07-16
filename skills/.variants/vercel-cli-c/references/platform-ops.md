# Platform Operations

Account, billing, alerting, and CLI-level operations: `vercel alerts`, `vercel usage`, `vercel contract`, `vercel buy`, `vercel tokens`, `vercel telemetry`, `vercel upgrade`, `vercel activity`. Run `vercel <command> --help` for flags; this file covers behavior help cannot tell you. Prefer `--format json` where supported for automation.

## Alerts

`vercel alerts` shows alerts for the linked project; `--all` widens to the whole team. Alert rules live under `vercel alerts rules`; inspect `vercel alerts rules --help` before creating or changing rules.

## Usage, Contracts, and Purchases

Billing and purchase commands can change paid account state. Get explicit user confirmation before running mutations such as `vercel buy ...`.

## Tokens

`vercel tokens` manages personal access tokens. Prefer `VERCEL_TOKEN` for automation. Do not print token values unless the user explicitly needs them and understands the exposure.

## CLI Maintenance

`vercel upgrade` changes the installed global CLI. Prefer the project-pinned CLI or package-manager invocation when one exists, unless the user asked to update a global install.

## Fallback

If an account operation is not available through a first-class command, use `vercel api` as a fallback.
