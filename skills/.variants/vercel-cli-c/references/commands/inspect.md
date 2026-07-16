<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel inspect

Show information about a deployment.

```
vercel inspect <url|deploymentId> [options]
```

## Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-l, --logs` — Prints the build logs instead of the deployment summary
- `--timeout <TIME>` — Time to wait for deployment completion [3m]
- `--wait` — Blocks until deployment completes

## Examples

Get information about a deployment by its unique URL

```
$ vercel inspect my-deployment-ji2fjij2.vercel.app
```

Get information about the deployment an alias points to

```
$ vercel inspect my-deployment.vercel.app
```

Get information about a deployment by piping in the URL

```
$ echo my-deployment.vercel.app | vercel inspect
```

Wait up to 90 seconds for deployment to complete

```
$ vercel inspect my-deployment.vercel.app --wait --timeout 90s
```

Get deployment build logs

```
$ vercel inspect my-deployment.vercel.app --logs
```

Get deployment information as JSON

```
$ vercel inspect my-deployment.vercel.app --format=json
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
