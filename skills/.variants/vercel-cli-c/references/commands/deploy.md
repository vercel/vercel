<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel deploy

Deploy your project to Vercel. The `deploy` command is the default command for the Vercel CLI, and can be omitted (`vc deploy my-app` equals `vc my-app`). Use `--dry` to inspect the detected framework preset and source files without deploying.

```
vercel deploy [project-path] [options]
```

## Options

- `--archive <FORMAT>` — Compress the deployment code into an archive before uploading it
- `-b, --build-env <KEY=VALUE>` (repeatable) — Specify environment variables during build-time (e.g. `-b KEY1=value1 -b KEY2=value2`)
- `--dry` — Inspect the detected framework preset and source files without uploading or creating a deployment. Non-TTY output includes every file as JSON
- `-e, --env <KEY=VALUE>` (repeatable) — Specify environment variables during run-time (e.g. `-e KEY1=value1 -e KEY2=value2`)
- `-f, --force` — Force a new deployment even if nothing has changed
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--guidance` — Receive command suggestions once deployment is complete
- `-l, --logs` — Print the build logs
- `-m, --meta <KEY=VALUE>` (repeatable) — Specify metadata for the deployment (e.g. `-m KEY1=value1 -m KEY2=value2`)
- `--no-wait` — Don't wait for the deployment to finish
- `--prebuilt` — Use in combination with `vc build`. Deploy an existing build
- `--prod` — Create a production deployment (shorthand for `--target=production`)
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `--regions <REGION>` — Set default regions to enable the deployment on
- `--skip-domain` — Disable the automatic promotion (aliasing) of the relevant domains to a new production deployment. You can use `vc promote` to complete the domain-assignment process later
- `--target <TARGET>` — Specify the target deployment environment
- `--with-cache` — Retain build cache when using "--force"
- `-y, --yes` — Use default options to skip all prompts

## Examples

Deploy the current directory

```
$ vercel
```

Deploy a custom path

```
$ vercel /usr/src/project
```

Deploy with run-time Environment Variables

```
$ vercel -e NODE_ENV=production
```

Deploy with prebuilt outputs

```
$ vercel build
$ vercel deploy --prebuilt
```

Inspect deployment inputs without deploying

```
$ vercel deploy --dry
```

Get every deployment file as JSON

```
$ vercel deploy --dry --format=json
```

Write Deployment URL to a file

```
$ vercel > deployment-url.txt
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
