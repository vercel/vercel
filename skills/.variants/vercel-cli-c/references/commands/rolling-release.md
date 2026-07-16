<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel rolling-release

Rolling releases gradually shift traffic to a new deployment in stages, allowing you to monitor for errors before serving all traffic. Learn more: https://vercel.com/docs/rolling-releases

Aliases: `rr`

```
vercel rolling-release <command>
```

## Subcommands

### `vercel rolling-release abort`

Abort an active rolling release

```
vercel rolling-release abort [options]
```

#### Options

- `--dpl` — The deploymentId of the rolling release to abort
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

#### Examples

Abort an active rolling release

```
$ vercel rolling-release abort --dpl=dpl_123
```

### `vercel rolling-release approve`

Approve the current stage of an active rolling release

```
vercel rolling-release approve [options]
```

#### Options

- `--currentStageIndex` — The current stage of a rolling release to approve
- `--dpl` — The deploymentId of the rolling release
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

#### Examples

Approve the current stage of an active rolling release

```
$ vercel rolling-release approve --currentStageIndex=0 --dpl=dpl_123
```

### `vercel rolling-release complete`

Complete an active rolling release

```
vercel rolling-release complete [options]
```

#### Options

- `--dpl` — The deploymentId of the rolling release to complete
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

#### Examples

Complete an active rolling release

```
$ vercel rolling-release complete --dpl=dpl_123
```

### `vercel rolling-release configure`

Configure rolling release settings for a project

```
vercel rolling-release configure [options]
```

#### Options

- `--advancement-type <TYPE>` — How stages advance: "automatic" or "manual-approval"
- `--cfg` — Raw JSON configuration (advanced). Overrides other flags.
- `--disable` — Disable rolling releases for this project
- `--enable` — Enable rolling releases for this project
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--stage <PERCENTAGE[,DURATION]>` (repeatable) — Add a rollout stage. Percentage (1-99) with optional duration for automatic advancement (e.g. "10,5m"). Can be specified multiple times. A final 100% stage is added automatically.

#### Examples

Enable automatic rolling release: 10% for 5 minutes, then 50% for 10 minutes, then 100%

```
$ vercel rolling-release configure --enable --advancement-type=automatic --stage=10,5m --stage=50,10m
```

Enable manual-approval rolling release: 10%, then 50%, then 100% (each stage requires approval)

```
$ vercel rolling-release configure --enable --advancement-type=manual-approval --stage=10 --stage=50
```

Disable rolling releases

```
$ vercel rolling-release configure --disable
```

Configure with raw JSON (advanced)

```
$ vercel rolling-release configure --cfg='{"enabled":true, "advancementType":"automatic", "stages":[{"targetPercentage":10,"duration":5},{"targetPercentage":100}]}'
```

### `vercel rolling-release fetch`

Fetch details about a rolling release

```
vercel rolling-release fetch [options]
```

#### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

#### Examples

Fetch details about a rolling release

```
$ vercel rolling-release fetch
```

### `vercel rolling-release start`

Start a rolling release

```
vercel rolling-release start [options]
```

#### Options

- `--dpl` — The deploymentId or URL to target for the rolling release
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-y, --yes` — Accept default value for all prompts

#### Examples

Start a rolling release

```
$ vercel rr start --dpl=dpl_123
```

Start a rolling release using URL

```
$ vercel rr start --dpl=https://example.vercel.app
```

Non-interactive (e.g. preview deployment): use --yes to promote

```
$ vercel rr start --dpl=dpl_123 --yes
```

## Examples

Enable automatic rolling release with two stages

```
$ vercel rr configure --enable --advancement-type=automatic --stage=10,5m --stage=50,10m
```

Enable manual-approval rolling release

```
$ vercel rr configure --enable --advancement-type=manual-approval --stage=10 --stage=50
```

Disable rolling releases

```
$ vercel rr configure --disable
```

Start a rolling release

```
$ vercel rr start --dpl=dpl_123
```

Approve an active rolling release stage

```
$ vercel rr approve --currentStageIndex=0 --dpl=dpl_123
```

Abort an active rolling release

```
$ vercel rr abort --dpl=dpl_123
```

Complete an active rolling release

```
$ vercel rr complete --dpl=dpl_123
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
