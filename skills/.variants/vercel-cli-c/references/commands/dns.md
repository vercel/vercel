<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel dns

Interact with DNS entries for a project

```
vercel dns [command]
```

## Subcommands

### `vercel dns add`

Add a new DNS entry (see below for examples)

```
vercel dns add <domain> <details>
```

### `vercel dns import`

Import a DNS zone file (see below for examples)

```
vercel dns import <domain> <zonefile>
```

### `vercel dns list`

List DNS entries. Pass a domain to list its records, or omit the argument to list records across every domain on the scope (default subcommand)

Aliases: `ls`

```
vercel dns list [domain] [options]
```

#### Options

- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-N, --next <MS>` — Show next page of results

### `vercel dns remove`

Remove a DNS entry using its ID

Aliases: `rm`

```
vercel dns remove <id> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when removing a DNS record

## Examples

Add an A record for a subdomain

```
$ vercel dns add <DOMAIN> <SUBDOMAIN> <A | AAAA | ALIAS | CNAME | TXT>  <VALUE>
$ vercel dns add zeit.rocks api A 198.51.100.100
```

Add an MX record (@ as a name refers to the domain)

```
$ vercel dns add <DOMAIN> '@' MX <RECORD VALUE> <PRIORITY>
$ vercel dns add zeit.rocks '@' MX mail.zeit.rocks 10
```

Add an SRV record

```
$ vercel dns add <DOMAIN> <NAME> SRV <PRIORITY> <WEIGHT> <PORT> <TARGET>
$ vercel dns add zeit.rocks '@' SRV 10 0 389 zeit.party
```

Add a CAA record

```
$ vercel dns add <DOMAIN> <NAME> CAA '<FLAGS> <TAG> "<VALUE>"'
$ vercel dns add zeit.rocks '@' CAA '0 issue "example.com"'
```

Import a Zone file

```
$ vercel dns import <DOMAIN> <FILE>
$ vercel dns import zeit.rocks ./zonefile.txt
```

Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch

```
$ vercel dns ls --next 1584722256178
$ vercel dns ls zeit.rocks --next 1584722256178
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
