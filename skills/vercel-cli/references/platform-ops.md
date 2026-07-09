# Platform Operations

Use these commands for account, billing, alerting, and CLI-level operations. Prefer `--format json` where supported for automation.

## Alerts

```bash
vercel alerts                                      # linked-project alerts
vercel alerts --all --format json                  # team-wide alerts
vercel alerts --type usage_anomaly --type error_anomaly
vercel alerts inspect <group-id> --format json
```

Alert rules live under `vercel alerts rules`; inspect `vercel alerts rules --help` before creating or changing rules.

## Usage, Contracts, and Purchases

```bash
vercel usage --help
vercel usage --from 2026-05-01 --to 2026-05-08 --breakdown daily
vercel usage --group-by project --format json
vercel contract
vercel buy --help
```

Billing and purchase commands can change paid account state. Get explicit user confirmation before running mutations such as `vercel buy ...`.

## Tokens

```bash
vercel tokens ls --format json
vercel tokens add "CI deploy" --format json
vercel tokens rm <token-id>
```

Prefer `VERCEL_TOKEN` for automation. Do not print token values unless the user explicitly needs them and understands the exposure.

## Telemetry and CLI Maintenance

```bash
vercel telemetry status
vercel telemetry enable
vercel telemetry disable
vercel upgrade
vercel whoami
```

`vercel upgrade` changes the installed global CLI. Prefer the project-pinned CLI or package-manager invocation when one exists, unless the user asked to update a global install.

## Other Account Commands

```bash
vercel activity --help
vercel teams --help
vercel oauth-apps --help
```

If an account operation is not available through a first-class command, use `vercel api` as a fallback.
