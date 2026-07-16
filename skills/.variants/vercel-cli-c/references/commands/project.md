<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel project

Manage your Vercel projects

Aliases: `projects`

```
vercel project [command]
```

## Subcommands

### `vercel project access-groups`

List access groups for a project

Aliases: `accessgroups`

```
vercel project access-groups [name] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit` — Limit number of access groups returned (1-100)
- `-N, --next <MS>` — Show next page of results
- `--search` — Search access groups by name

#### Examples

List access groups for the linked project

```
$ vercel project access-groups
```

List access groups for a named project as JSON

```
$ vercel project access-groups my-project --format json
```

### `vercel project access-summary`

Show member counts by team role for project access (requires access groups entitlement)

Aliases: `summary`

```
vercel project access-summary [name] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Summary for the linked project

```
$ vercel project access-summary
```

Summary as JSON

```
$ vercel project access-summary my-app --format json
```

### `vercel project add`

Add a new project

```
vercel project add <name>
```

#### Examples

Add a new project

```
$ vercel project add my-project
```

### `vercel project checks`

List, add, or remove deployment checks for a project (GET/POST/DELETE /v2/projects/.../checks)

```
vercel project checks [name] [options]
```

#### Options

- `--blocks` — When listing: filter by blocking stage. When adding: blocking stage for the new check. Values: build-start, deployment-start, deployment-alias, deployment-promotion, none
- `--check-name` — Name of the deployment check (required with --requires unless --file is set)
- `--file` — Path to JSON file for the POST body (see REST: Create a check). Overrides --check-name / related flags.
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--requires` — When the check runs: build-ready, deployment-url, or none (required with --check-name unless --file)
- `--source` — JSON string for the `source` object (integration, webhook, or git-provider)
- `--targets` — Comma-separated deployment targets (e.g. production,preview)
- `--timeout` — Timeout in seconds for the new check (default 300)

#### Examples

List checks for the linked project

```
$ vercel project checks
```

Checks that block production alias assignment

```
$ vercel project checks --blocks deployment-alias
```

Add a check from a JSON file

```
$ vercel project checks add my-app --file ./check.json
```

Add a check with flags (requires integration/webhook setup in the body via --file or --source)

```
$ vercel project checks add --check-name "CI" --requires deployment-url --blocks deployment-alias
```

Remove a check by id

```
$ vercel project checks remove chk_abc123 my-app
```

### `vercel project inspect`

Displays information related to a project

```
vercel project inspect [name] [options]
```

#### Options

- `-y, --yes` — Accept default value for all prompts

#### Examples

Inspect the linked project from the current directory

```
$ vercel project inspect
```

Inspect the project named "my-project"

```
$ vercel project inspect my-project
```

### `vercel project list`

Show all projects in the selected scope (default subcommand)

Aliases: `ls`

```
vercel project list [options]
```

#### Options

- `-f, --filter <NAME>` — Filter projects by name (substring match)
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-N, --next <MS>` — Show next page of results
- `--update-required` — A list of projects affected by an upcoming deprecation

#### Examples

Paginate projects, where `1584722256178` is the time in milliseconds since the UNIX epoch

```
$ vercel project ls --next 1584722256178
```

List projects using a deprecated Node.js version in JSON format

```
$ vercel project ls --update-required --format=json
```

Filter projects by name

```
$ vercel project ls --filter my-app
```

### `vercel project members`

List project members for a project

Aliases: `member`

```
vercel project members [name] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit` — Limit number of project members returned (1-100)
- `--search` — Filter project members by name, username, or email

#### Examples

List members for the linked project

```
$ vercel project members
```

List members for a named project as JSON

```
$ vercel project members my-project --format json
```

### `vercel project protection`

Show or toggle deployment protection settings for a project

```
vercel project protection [action] [name] [options]
```

#### Options

- `--customer-support-code-visibility` — Apply action to customer support code visibility protection.
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--git-fork-protection` — Apply action to Git fork protection.
- `--password` — Apply action to password protection (requires eligible plan/permissions).
- `--protection-bypass` — Apply action to automation protection bypass secrets.
- `--protection-bypass-secret <SECRET>` — Optional secret value for protection bypass. Required when disabling bypass.
- `--skew` — Apply action to skew protection.
- `--skew-max-age <SECONDS>` — When enabling with --skew, max age in seconds for skew protection (default 2592000, 30 days).
- `--sso` — Apply action to SSO protection.

#### Examples

Protection settings for the linked project

```
$ vercel project protection
```

Named project as JSON

```
$ vercel project protection my-app --format json
```

Disable password protection

```
$ vercel project protection disable my-app --password
```

Enable password protection

```
$ vercel project protection enable my-app --password
```

Enable customer support code visibility

```
$ vercel project protection enable my-app --customer-support-code-visibility
```

Disable customer support code visibility

```
$ vercel project protection disable my-app --customer-support-code-visibility
```

Enable skew protection

```
$ vercel project protection enable my-app --skew
```

Enable skew protection with custom max age (seconds)

```
$ vercel project protection enable my-app --skew --skew-max-age 604800
```

Disable skew protection

```
$ vercel project protection disable my-app --skew
```

Enable automation protection bypass

```
$ vercel project protection enable my-app --protection-bypass
```

Disable bypass with secret

```
$ vercel project protection disable my-app --protection-bypass --protection-bypass-secret <secret>
```

Enable Git fork protection

```
$ vercel project protection enable my-app --git-fork-protection
```

Disable Git fork protection

```
$ vercel project protection disable my-app --git-fork-protection
```

Enable SSO deployment protection

```
$ vercel project protection enable my-app --sso
```

Disable SSO for a named project

```
$ vercel project protection disable my-app --sso
```

### `vercel project remove`

Delete a project

Aliases: `rm`

```
vercel project remove <name>
```

### `vercel project rename`

Rename a project

```
vercel project rename <name> <new-name>
```

#### Examples

Rename a project

```
$ vercel project rename my-project my-renamed-project
```

### `vercel project speed-insights`

Enable Speed Insights for a project

```
vercel project speed-insights [name] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Enable Speed Insights for the linked project

```
$ vercel project speed-insights
```

Enable Speed Insights for a named project

```
$ vercel project speed-insights my-project
```

Confirm enablement as JSON (non-interactive / agents)

```
$ vercel project speed-insights --format json
```

### `vercel project token`

Get a development OIDC token for a project

```
vercel project token [name] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Accept default value for all prompts

#### Examples

Get a development OIDC token for the linked project

```
$ vercel project token
```

Get a development OIDC token for the project named "my-project"

```
$ vercel project token my-project
```

Get a development OIDC token as JSON

```
$ vercel project token my-project --format=json
```

### `vercel project update`

Update one or more project settings; omitted settings remain unchanged

Aliases: `set`

```
vercel project update [name] [options]
```

#### Options

- `--auto-detect <SETTING>` (repeatable) — Reset a setting to automatic detection; repeat for build-command, dev-command, install-command, or output-directory
- `--build-command <COMMAND>` — Set the build command
- `--dev-command <COMMAND>` — Set the development command
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--framework <SLUG>` — Set the framework preset by slug; use "other" to clear the preset
- `--install-command <COMMAND>` — Set the install command
- `--output-directory <DIR>` — Set the output directory

#### Examples

Set the linked project framework preset to Next.js

```
$ vercel project update --framework nextjs
```

Set a named project framework preset to Vite

```
$ vercel project update my-project --framework vite
```

Update multiple settings in one command

```
$ vercel project update my-project --build-command "pnpm build" --output-directory dist
```

Reset individual settings to automatic detection

```
$ vercel project update my-project --auto-detect build-command --auto-detect output-directory
```

Clear the framework preset and return JSON

```
$ vercel project update my-project --framework other --format json
```

### `vercel project web-analytics`

Enable Web Analytics for a project

```
vercel project web-analytics [name] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Enable Web Analytics for the linked project

```
$ vercel project web-analytics
```

Enable Web Analytics for a named project

```
$ vercel project web-analytics my-project
```

Confirm enablement as JSON (non-interactive / agents)

```
$ vercel project web-analytics --format json
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
