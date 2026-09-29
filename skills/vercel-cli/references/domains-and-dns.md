# Domains & DNS

## Ownership, Assignment, and DNS

Inspect the current owner and project assignment before changing a domain. Adding apex-domain ownership to a team does not attach it to a project, even in a linked directory. Project assignment is explicit; subdomains require it.

Use the domain verification result or project Domains settings for required DNS records. Do not prescribe fixed apex IPs or CNAME targets. The CLI's DNS operations manage Vercel-hosted DNS; for an external DNS provider, apply the returned records there.

Registration, DNS hosting, and project assignment are independent. A registrar transfer is not required to serve a domain from Vercel.

## Transfers and Moves

For registrar transfers, follow [Transfer a domain to Vercel](https://vercel.com/docs/domains/working-with-domains/transfer-your-domain#transfer-a-domain-to-vercel). Normally the current registrar must unlock the domain and issue an auth/EPP code; Name.com uses an account-transfer flow instead.

For project reassignment within one team, use the supported reassignment operation. It removes the previous assignment before adding the destination and is not atomic. Removing team ownership is not a substitute. Verify the resulting assignment.

For a cross-team ownership move, use the ownership-transfer workflow rather than removing and re-adding the domain. Preserve destination approval requirements. Re-inspect ownership, aliases, and project assignments after the move rather than assuming they transferred together.

## Availability Results

Search filters can leave fewer available domains than the requested page size. Follow pagination before treating a filtered page as the complete result. A missing purchase price can mean a domain is unavailable; distinguish purchase price from renewal price before recommending a purchase.
