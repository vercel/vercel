# vercel domains

Manage domain names.

## Synopsis

```bash
vercel domains <subcommand> [options]
vercel domain <subcommand> [options]
```

## Description

The `domains` command allows you to manage custom domains for your Vercel projects.

## Aliases

- `domain`

## Subcommands

### `list` / `ls` (default)

List all domains in your account or team.

```bash
vercel domains list [options]
vercel domains ls [options]
vercel domains  # list is default
```

#### Options

| Option    | Shorthand | Type   | Description                              |
| --------- | --------- | ------ | ---------------------------------------- |
| `--limit` |           | Number | Results per page (default: 20, max: 100) |
| `--next`  | `-N`      | Number | Pagination timestamp                     |

#### Examples

```bash
vercel domains ls
vercel domains ls --next 1705312200000
```

---

### `inspect`

Display information about a domain.

```bash
vercel domains inspect <domain>
```

#### Examples

```bash
vercel domains inspect example.com
```

**Output:**

```
Domain: example.com

  Status:        Valid
  Nameservers:   Vercel
  Created:       2024-01-01
  Expires:       2025-01-01

  DNS Records:
    A       @       76.76.21.21
    CNAME   www     cname.vercel-dns.com

  Projects:
    - my-project (production)
```

---

### `add`

Add a domain to your account and assign to a project.

```bash
vercel domains add <domain> <project>
```

#### Arguments

| Argument  | Required | Description                     |
| --------- | -------- | ------------------------------- |
| `domain`  | Yes      | Domain name to add              |
| `project` | Yes      | Project to assign the domain to |

#### Options

| Option    | Type    | Description                                   |
| --------- | ------- | --------------------------------------------- |
| `--force` | Boolean | Force add even if assigned to another project |

#### Examples

```bash
vercel domains add example.com my-project
vercel domains add subdomain.example.com my-project --force
```

---

### `remove` / `rm`

Remove a domain from your account.

```bash
vercel domains remove <domain>
vercel domains rm <domain>
```

#### Options

| Option  | Type    | Description              |
| ------- | ------- | ------------------------ |
| `--yes` | Boolean | Skip confirmation prompt |

#### Examples

```bash
vercel domains rm old-domain.com
vercel domains rm old-domain.com --yes
```

---

### `buy`

Purchase a new domain.

```bash
vercel domains buy <domain>
```

#### Examples

```bash
vercel domains buy new-domain.com
```

Interactive purchase flow with pricing and confirmation.

---

### `move`

Transfer domain ownership to another team.

```bash
vercel domains move <domain> <destination>
```

#### Arguments

| Argument      | Required | Description            |
| ------------- | -------- | ---------------------- |
| `domain`      | Yes      | Domain to move         |
| `destination` | Yes      | Target team slug or ID |

#### Options

| Option  | Type    | Description              |
| ------- | ------- | ------------------------ |
| `--yes` | Boolean | Skip confirmation prompt |

#### Examples

```bash
vercel domains move example.com other-team
vercel domains move example.com team_abc123 --yes
```

---

### `transfer-in`

Transfer a domain to Vercel from another registrar.

```bash
vercel domains transfer-in <domain> [options]
```

#### Options

| Option   | Type   | Description                                   |
| -------- | ------ | --------------------------------------------- |
| `--code` | String | Authorization/EPP code from current registrar |

#### Examples

```bash
vercel domains transfer-in example.com --code AUTH123CODE
```

---

## Domain Configuration

### Nameserver Setup

For Vercel-managed DNS, point your domain to:

```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

### External DNS

If using external DNS, add these records:

```
A     @     76.76.21.21
CNAME www   cname.vercel-dns.com
```

---

## Wildcard Domains

Add wildcard subdomains:

```bash
vercel domains add "*.example.com" my-project
```

Requires Vercel nameservers.

---

## See Also

- [dns](dns.md) - Manage DNS records
- [certs](certs.md) - Manage SSL certificates
- [alias](alias.md) - Manage deployment aliases
