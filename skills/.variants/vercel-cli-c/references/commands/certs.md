<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel certs

Interact with SSL certificates. This command is intended for advanced use only. By default, Vercel manages your certificates automatically.

Aliases: `cert`

```
vercel certs <command>
```

## Subcommands

### `vercel certs add`

Add a new certificate

```
vercel certs add [options]
```

#### Options

- `--ca <FILE>` — CA certificate chain file
- `--crt <FILE>` — Certificate file
- `--key <FILE>` — Certificate key file

### `vercel certs issue`

Issue a new certificate for a domain

```
vercel certs issue <cn> [options]
```

#### Options

- `--ca <FILE>` — CA certificate chain file
- `--challenge-only` — Only show challenges needed to issue a certificate
- `--crt <FILE>` — Certificate file
- `--key <FILE>` — Certificate key file

#### Examples

Generate a certificate with the cnames "acme.com" and "www.acme.com"`

```
$ vercel certs issue acme.com www.acme.com
```

### `vercel certs list`

Show all available certificates

Aliases: `ls`

```
vercel certs list [options]
```

#### Options

- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-N, --next <MS>` — Show next page of results

#### Examples

Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch.

```
$ vercel certs ls --next 1584722256178
```

### `vercel certs remove`

Remove a certificate by id

Aliases: `rm`

```
vercel certs remove <id>
```

#### Examples

Remove a certificate

```
$ vercel certs rm id
```

## Examples

Generate a certificate with the cnames "acme.com" and "www.acme.com"`

```
$ vercel certs issue acme.com www.acme.com
```

Remove a certificate

```
$ vercel certs rm id
```

Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch.

```
$ vercel certs ls --next 1584722256178
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
