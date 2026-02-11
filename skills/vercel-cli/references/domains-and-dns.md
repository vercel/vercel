# Domains & DNS

## Overview

- `vercel domains` — manage domain ownership and project assignment
- `vercel dns` — manage DNS records (when using Vercel nameservers)
- `vercel alias` — map deployment URLs to custom domains
- `vercel certs` — manage SSL certificates (usually auto-managed)

Most users only need `vercel alias` — domains and DNS are auto-configured when using Vercel nameservers.

## Typical Flow

1. Add domain to project: `vercel domains add example.com my-project`
2. Configure nameservers at registrar to point to Vercel
3. Deploy: `vercel --prod` (domain is auto-assigned)

Or manually alias: `vercel alias set <deployment-url> example.com`

## DNS Records

```bash
vercel dns ls example.com
vercel dns add example.com @ A 1.2.3.4
vercel dns add example.com sub CNAME target.example.com
vercel dns rm rec_abc123
```

Use `vercel <command> -h` for full flag details.
