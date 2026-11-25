# vercel certs

Manage SSL certificates.

## Synopsis

```bash
vercel certs <subcommand> [options]
vercel cert <subcommand> [options]
```

## Description

The `certs` command manages SSL certificates for your domains. By default, Vercel automatically provisions and renews certificates using Let's Encrypt. This command is for advanced use cases.

## Aliases

- `cert`

## Subcommands

### `list` / `ls`

Show all available certificates.

```bash
vercel certs list [options]
vercel certs ls [options]
```

#### Options

| Option    | Shorthand | Type   | Description                              |
| --------- | --------- | ------ | ---------------------------------------- |
| `--limit` |           | Number | Results per page (default: 20, max: 100) |
| `--next`  | `-N`      | Number | Pagination timestamp                     |

#### Examples

```bash
vercel certs ls
vercel certs ls --next 1705312200000
```

---

### `issue`

Issue a new certificate for a domain.

```bash
vercel certs issue <cn> [options]
```

#### Arguments

| Argument | Required | Description                              |
| -------- | -------- | ---------------------------------------- |
| `cn`     | Yes      | Common name (domain) for the certificate |

Additional domains can be specified as additional arguments.

#### Options

| Option             | Type    | Description                                 |
| ------------------ | ------- | ------------------------------------------- |
| `--challenge-only` | Boolean | Only show challenges needed for issuance    |
| `--crt`            | String  | Path to certificate file (for custom certs) |
| `--key`            | String  | Path to private key file                    |
| `--ca`             | String  | Path to CA certificate chain file           |
| `--overwrite`      | Boolean | Overwrite existing certificate              |

#### Examples

**Issue certificate for single domain:**

```bash
vercel certs issue example.com
```

**Issue certificate for multiple domains (SAN):**

```bash
vercel certs issue example.com www.example.com api.example.com
```

**Show DNS challenges only:**

```bash
vercel certs issue example.com --challenge-only
```

**Upload custom certificate:**

```bash
vercel certs issue example.com \
  --crt ./certificate.crt \
  --key ./private.key \
  --ca ./ca-bundle.crt
```

---

### `add`

Add a custom SSL certificate.

```bash
vercel certs add [options]
```

#### Options

| Option  | Type   | Description                       |
| ------- | ------ | --------------------------------- |
| `--crt` | String | Path to certificate file          |
| `--key` | String | Path to private key file          |
| `--ca`  | String | Path to CA certificate chain file |

#### Examples

```bash
vercel certs add \
  --crt ./certificate.crt \
  --key ./private.key \
  --ca ./ca-bundle.crt
```

---

### `remove` / `rm`

Remove a certificate by ID.

```bash
vercel certs remove <id>
vercel certs rm <id>
```

#### Examples

```bash
# List certificates to find ID
vercel certs ls

# Remove by ID
vercel certs rm cert_abc123
```

---

## Automatic Certificates

Vercel automatically:

1. **Provisions** certificates when domains are added
2. **Renews** certificates before expiration
3. **Manages** certificate lifecycle

Manual certificate management is only needed for:

- Wildcard certificates (sometimes)
- Custom CA certificates
- Specific compliance requirements

---

## Wildcard Certificates

```bash
# Issue wildcard certificate
vercel certs issue "*.example.com" example.com
```

Requires DNS verification via TXT record.

---

## DNS Challenges

When using external DNS:

```bash
# Show required DNS records
vercel certs issue example.com --challenge-only
```

Output:

```
Add the following DNS records:

  _acme-challenge.example.com  TXT  abc123xyz789...

Then run:
  vercel certs issue example.com
```

---

## See Also

- [domains](domains.md) - Manage domains
- [dns](dns.md) - Manage DNS records
