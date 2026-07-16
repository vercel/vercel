# Domains & DNS

Domain ownership (`vercel domains`), DNS records (`vercel dns`), deployment aliases (`vercel alias`), and SSL certificates (`vercel certs`, usually auto-managed). Run `vercel <command> --help` for flags; this file covers behavior help cannot tell you.

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

- `vercel domains search` returns availability, purchase pricing, and renewal pricing in bulk. Use the continuation command printed by the CLI to fetch the next page. `--limit` controls how many candidates are checked per page; `--available` filters that window, so a page can return fewer results than the limit.
- `domains check` (availability) and `domains price` (registrar quotes) support up to 50 domains per request.
- If `domains price` doesn't output a purchase price for a given domain, the domain is unavailable. If you only need availability data, just use `domains check`. If you need both price and availability data, use `domains price` to fetch both at once.

## DNS Records

`vercel dns ls` with no argument lists records across every domain on the scope; pass a domain to list just that domain's records. Records are removed by record ID (from `dns ls`), not by name.
