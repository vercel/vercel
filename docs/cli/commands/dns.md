# vercel dns

Manage DNS records for your domains.

## Synopsis

```bash
vercel dns <subcommand> [options]
```

## Description

The `dns` command allows you to manage DNS records for domains using Vercel's nameservers.

## Subcommands

### `list` / `ls` (default)

List DNS records for a domain.

```bash
vercel dns list <domain> [options]
vercel dns ls <domain> [options]
```

#### Options

| Option    | Shorthand | Type   | Description                              |
| --------- | --------- | ------ | ---------------------------------------- |
| `--limit` |           | Number | Results per page (default: 20, max: 100) |
| `--next`  | `-N`      | Number | Pagination timestamp                     |

#### Examples

```bash
vercel dns ls example.com
vercel dns ls example.com --next 1705312200000
```

---

### `add`

Add a DNS record.

```bash
vercel dns add <domain> <subdomain> <type> <value> [options]
```

#### Arguments

| Argument    | Required | Description                                        |
| ----------- | -------- | -------------------------------------------------- |
| `domain`    | Yes      | Domain name                                        |
| `subdomain` | Yes      | Subdomain (use `@` for root)                       |
| `type`      | Yes      | Record type (A, AAAA, ALIAS, CNAME, TXT, MX, etc.) |
| `value`     | Yes      | Record value                                       |

#### Record Types

| Type  | Value Format                    | Example                |
| ----- | ------------------------------- | ---------------------- |
| A     | IPv4 address                    | `198.51.100.100`       |
| AAAA  | IPv6 address                    | `2001:db8::1`          |
| ALIAS | Hostname                        | `alias.vercel-dns.com` |
| CNAME | Hostname                        | `cname.vercel-dns.com` |
| TXT   | Text string                     | `"v=spf1 include:..."` |
| MX    | Mail server (requires priority) | `mail.example.com 10`  |
| SRV   | Service record                  | See examples           |
| CAA   | Certificate authority           | See examples           |

#### Examples

**Add A Record:**

```bash
vercel dns add example.com api A 198.51.100.100
```

**Add CNAME Record:**

```bash
vercel dns add example.com www CNAME cname.vercel-dns.com
```

**Add TXT Record:**

```bash
vercel dns add example.com @ TXT "v=spf1 include:_spf.google.com ~all"
```

**Add MX Record:**

```bash
vercel dns add example.com @ MX mail.example.com 10
```

**Add SRV Record:**

```bash
vercel dns add example.com @ SRV 10 0 389 ldap.example.com
# Format: priority weight port target
```

**Add CAA Record:**

```bash
vercel dns add example.com @ CAA '0 issue "letsencrypt.org"'
```

---

### `remove` / `rm`

Remove a DNS record by ID.

```bash
vercel dns remove <id>
vercel dns rm <id>
```

#### Examples

```bash
# First, list records to find the ID
vercel dns ls example.com

# Then remove by ID
vercel dns rm rec_abc123
```

---

### `import`

Import DNS records from a zone file.

```bash
vercel dns import <domain> <zonefile>
```

#### Arguments

| Argument   | Required | Description       |
| ---------- | -------- | ----------------- |
| `domain`   | Yes      | Domain name       |
| `zonefile` | Yes      | Path to zone file |

#### Example Zone File

```
; example.com zone file
$TTL 3600
@       IN  A       198.51.100.100
www     IN  CNAME   cname.vercel-dns.com.
mail    IN  MX  10  mail.example.com.
@       IN  TXT     "v=spf1 include:_spf.google.com ~all"
```

#### Examples

```bash
vercel dns import example.com ./zonefile.txt
```

---

## Common DNS Configurations

### Vercel Deployment

```bash
# Root domain
vercel dns add example.com @ A 76.76.21.21

# WWW subdomain
vercel dns add example.com www CNAME cname.vercel-dns.com
```

### Email (Google Workspace)

```bash
# MX records
vercel dns add example.com @ MX aspmx.l.google.com 1
vercel dns add example.com @ MX alt1.aspmx.l.google.com 5
vercel dns add example.com @ MX alt2.aspmx.l.google.com 5

# SPF
vercel dns add example.com @ TXT "v=spf1 include:_spf.google.com ~all"

# DKIM (provided by Google)
vercel dns add example.com google._domainkey TXT "v=DKIM1; k=rsa; p=..."
```

### Domain Verification

```bash
# Google Search Console
vercel dns add example.com @ TXT "google-site-verification=abc123"

# Let's Encrypt
vercel dns add example.com _acme-challenge TXT "verification-token"
```

---

## See Also

- [domains](domains.md) - Manage domains
- [certs](certs.md) - Manage SSL certificates
