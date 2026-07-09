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

1. Add domain to your team, optionally assigning it to a project:
   - **Team only** — `vercel domains add example.com` adds the domain to your team without assigning a project (works from any directory).
   - **Assign to a project** — pass the project name as a second argument: `vercel domains add example.com my-project`.
   - **Linked directory** — one argument still adds to your team only; pass a project name as a second argument to assign it to a project.
2. Configure nameservers at registrar to point to Vercel
3. Deploy: `vercel --prod` (domain is auto-assigned)

Or manually alias: `vercel alias set <deployment-url> example.com`

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
vercel domains add example.com              # add to team
vercel domains add example.com my-project   # add to team and assign to a project
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
