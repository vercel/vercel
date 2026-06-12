# Domains & DNS

## Overview

- `vercel domains` — manage domain ownership and project assignment
- `vercel domains search` — discover available domains and registrar pricing
- `vercel domains check` — check registrar availability (single or bulk)
- `vercel domains price` — get registrar quotes (single or bulk)
- `vercel domains buy` — purchase a domain
- `vercel dns` — manage DNS records (when using Vercel nameservers)
- `vercel alias` — map deployment URLs to custom domains
- `vercel certs` — manage SSL certificates (usually auto-managed)

Most users only need `vercel alias` — domains and DNS are auto-configured when using Vercel nameservers.

## Typical Flow

1. Add domain to project. The arg count is decided by the current directory's link status — `domains add` rejects the other form:
   - **Linked directory** — exactly one arg: `vercel domains add example.com`. The CLI errors with "expects one argument" if you pass a project name.
   - **Unlinked directory** — exactly two args: `vercel domains add example.com my-project`. To target a project from a linked directory, `cd` to an unlinked location or to a directory linked to the intended project; there is no "linked dir, override target" form.
2. Configure nameservers at registrar to point to Vercel
3. Deploy: `vercel --prod` (domain is auto-assigned)

Or manually alias: `vercel alias set <deployment-url> example.com`

## Dashboard Path

The same flow is available without the CLI — prefer it when guiding someone who is working in the Vercel dashboard rather than a terminal:

1. On the project: **Settings → Domains → Add Domain** (`https://vercel.com/<team>/<project>/settings/domains`).
2. After the domain is added, the dashboard displays the exact DNS records to set at the registrar: an **A** record for apex domains, a project-specific **CNAME** for subdomains, or Vercel nameservers (required for wildcard domains).

Full walkthrough: [Adding & Configuring a Custom Domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## Domain Discovery

### Search

```bash
vercel domains search acme
vercel domains search acme --available --tld .com --limit 200
```

Search returns availability, purchase pricing, and renewal pricing in bulk. Use the continuation command printed by the CLI to fetch the next page.
`--limit` controls how many candidates are checked per page. `--available` filters that window, so a page can return fewer results than the limit.

### Availability

```bash
vercel domains check example.com
vercel domains check one.com two.com three.com --format=json
```

### Pricing

```bash
vercel domains price example.com
vercel domains price one.com two.com three.com --format=json
```

### Notes

- `domains check` and `domains price` support up to 50 domains per request.
- If `domains price` doesn't output a purchase price for a given domain, the domain is unavailable. If you only need availability data, just use `domains check`. If you need both price and availability data, use `domains price` to fetch both at once.

## Purchase

```bash
vercel domains buy example.com
```

```bash
vercel domains inspect example.com
vercel domains add example.com              # in a linked project directory (1 arg only)
vercel domains add example.com my-project   # in an unlinked directory (2 args only)
```

## DNS Records

```bash
vercel dns ls                                          # list records across every domain on the scope
vercel dns ls example.com                              # list records for a single domain
vercel dns add example.com @ A 1.2.3.4
vercel dns add example.com sub CNAME target.example.com
vercel dns rm rec_abc123
```

Use `vercel <command> --help` for full flag details.
