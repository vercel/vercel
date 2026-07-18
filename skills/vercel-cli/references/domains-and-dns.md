# Domains & DNS

> Exact syntax: `vercel domains --help`, `vercel dns --help`, `vercel alias --help`, `vercel certs --help`

Most users only need `vercel alias` — domains, DNS, and certs are auto-configured when using Vercel nameservers.

## Typical Flow

1. `vercel domains add example.com` adds the domain to your **team only** — even when run from a linked project directory. Pass a project name as a second argument (`vercel domains add example.com my-project`) to assign it to a project.
2. Configure nameservers at registrar to point to Vercel
3. Deploy: `vercel --prod` (domain is auto-assigned)

Or manually alias: `vercel alias set <deployment-url> example.com`

## Domain Search and Pricing

- Search paginates: use the continuation command printed by the CLI to fetch the next page. `--limit` controls how many candidates are checked per page; `--available` filters that window, so a page can return fewer results than the limit.
- `domains check` and `domains price` support up to 50 domains per request.
- If `domains price` doesn't output a purchase price for a given domain, the domain is unavailable — so `domains price` returns availability and pricing in one call; use `domains check` when you only need availability.
