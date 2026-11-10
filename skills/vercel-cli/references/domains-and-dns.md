# Domains & DNS

## Ownership, Assignment, and DNS

Use `vercel domains inspect` to check the current owner and project assignment before changing a domain. Adding apex-domain ownership to a team does not attach it to a project, even in a linked directory. Project assignment is explicit; subdomains require it.

Use `vercel domains verify <domain>` or the project's Settings → Domains page for required DNS records, not `vercel domains inspect`. Do not prescribe fixed apex IPs or CNAME targets.

The CLI's DNS operations manage Vercel-hosted DNS. For external DNS, give the user the returned records to apply there. After the user applies them, verify again or recheck the project's Domains settings before saying the domain is configured; instructions alone do not mean a DNS change occurred.

Registration, DNS hosting, and project assignment are independent. A registrar transfer is not required to serve a domain from Vercel.

## Transfers and Moves

For registrar transfers, follow [Transfer a domain to Vercel](https://vercel.com/docs/domains/working-with-domains/transfer-your-domain#transfer-a-domain-to-vercel). Normally the current registrar must unlock the domain and issue an auth/EPP code; Name.com uses an account-transfer flow instead.

For project reassignment within one team, use the supported reassignment operation. It removes the previous assignment before adding the destination and is not atomic. Removing team ownership is not a substitute. Verify the resulting assignment.

For a cross-team ownership move, use the ownership-transfer workflow rather than removing and re-adding the domain. Preserve destination approval requirements. Re-inspect ownership, aliases, and project assignments after the move rather than assuming they transferred together.

## Availability Results

Search filters can leave fewer available domains than the requested page size. Follow pagination before treating a filtered page as the complete result. A missing purchase price can mean a domain is unavailable; distinguish purchase price from renewal price before recommending a purchase.
