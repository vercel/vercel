<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel redeploy

Rebuild and deploy a previous deployment.

```
vercel redeploy [url|deploymentId] [options]
```

## Options

- `--no-wait` — Don't wait for the redeploy to finish
- `--target <TARGET>` — Redeploy to a specific target environment

## Examples

Rebuild and deploy an existing deployment using id or url

```
$ vercel redeploy my-deployment.vercel.app
```

Write Deployment URL to a file

```
$ vercel redeploy my-deployment.vercel.app > deployment-url.txt
```

Rebuild and deploy an existing deployment to a specific target environment

```
$ vercel redeploy my-deployment.vercel.app --target preview
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
