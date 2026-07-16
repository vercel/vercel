<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel buy

Purchase Vercel products for your team

```
vercel buy <command>
```

## Subcommands

### `vercel buy addon`

Purchase a Vercel addon for your team

Aliases: `addons`

```
vercel buy addon <addon-name> <quantity> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Skip the confirmation prompt

#### Examples

Purchase 1 unit of the SIEM addon

```
$ vercel buy addon siem 1
```

Purchase 1 unit of the Custom Environments addon

```
$ vercel buy addon customEnvironment 1
```

### `vercel buy credits`

Purchase Vercel credits for your team

```
vercel buy credits <credit-type> <amount> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Skip the confirmation prompt

#### Examples

Purchase $100 of v0 credits

```
$ vercel buy credits v0 100
```

Purchase $250 of AI Gateway credits

```
$ vercel buy credits gateway 250
```

Purchase $50 of Vercel Agent credits

```
$ vercel buy credits agent 50
```

### `vercel buy domain`

Purchase a domain name

```
vercel buy domain <domain>
```

#### Examples

Purchase a domain

```
$ vercel buy domain example.com
```

### `vercel buy pro`

Purchase a Vercel Pro subscription for your team

```
vercel buy pro [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Skip the confirmation prompt

#### Examples

Upgrade your team to Vercel Pro

```
$ vercel buy pro
```

Upgrade without confirmation prompt

```
$ vercel buy pro --yes
```

## Examples

Purchase $100 of v0 credits

```
$ vercel buy credits v0 100
```

Purchase the SIEM addon

```
$ vercel buy addon siem 1
```

Purchase the Custom Environments addon

```
$ vercel buy addon customEnvironment 1
```

Upgrade to Pro

```
$ vercel buy pro
```

Purchase a domain

```
$ vercel buy domain example.com
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
