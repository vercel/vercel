# Configure Resend DNS records

`vercel dns configure <domain> --resend <file>` adds the missing DNS records from a Resend domain response to a Vercel DNS zone. It leaves existing records in place and stops if a requested record conflicts with them.

## Export and preview

Use this flow when the domain uses Vercel DNS and you have permission to list and create its records. Authenticate the [Resend CLI](https://resend.com/docs/cli) for the account that owns the sending domain, then export that domain's records:

```sh
resend domains get <ID> --json > resend-domain.json
vercel dns configure example.com --resend resend-domain.json --scope my-team --dry-run --json
```

The file can contain the [Retrieve Domain API response](https://resend.com/docs/api-reference/domains/get-domain) or that response inside a `data` property. The domain must already exist in Resend. Vercel CLI does not read or store your Resend API key.

The sending domain may be the DNS zone itself or a subdomain, such as `updates.example.com`. Record names may be a relative label, a relative DKIM selector such as `resend._domainkey`, or fully qualified beneath the sending domain. Other dotted names must be fully qualified; the command rejects ambiguous names instead of guessing. The command accepts TXT, MX, and CNAME records, including MX priority and TTL. `Auto` TTL uses Vercel's default of 60 seconds. Files are limited to 1 MB and 50 records. The response must retain Resend’s `record` purpose field. Optional `Receiving` MX records are excluded unless `capabilities.receiving` is explicitly `enabled`. A response containing `TrackingCAA` is rejected before any changes: those records alter certificate-issuer policy and require separate review.

## Add the missing records

After reviewing the preview, run:

```sh
vercel dns configure example.com --resend resend-domain.json --scope my-team --yes --json
```

Without `--yes`, an interactive terminal shows the target team and records before asking for confirmation. Non-interactive, piped, and JSON output modes require `--yes` and never prompt. `--dry-run` never changes DNS, even when combined with `--yes`.

The command checks all pages of existing DNS records before adding anything. Exact matches are skipped, including on reruns. It does not replace different TXT, MX, or CNAME records at a requested name, or add records below a conflicting delegation. Review those conflicts with `vercel dns ls example.com --scope my-team`; resolve them separately before rerunning. Existing record TTLs remain unchanged.

Additions are sequential and are not an atomic transaction. If a request fails or its response is lost, the command stops, reports confirmed record IDs and the last attempted record, and keeps completed additions. Inspect the current records before rerunning the same input. Each rerun checks existing records again; the command does not retry write requests automatically.

## Complete verification

Adding records does not prove DNS propagation or Resend verification. After propagation, trigger verification using the same Resend domain ID:

```sh
resend domains verify <ID>
resend domains get <ID> --json
```

The command does not create a Resend domain, change its sending or receiving settings, alter nameservers, or send email. Configure those settings in Resend before exporting the response, especially when enabling inbound mail.

## Machine output

`--json`, `--format json`, non-interactive mode, and piped input emit one JSON object on stdout. Status is `dry_run`, `action_required`, `success`, or `error`; errors and required confirmations exit with code 1. Successful results include `created` records with their IDs, `skipped` records, `excluded` records for disabled receiving, and `verification: "not_checked"`. Partial failures include `created`, `attemptedRecord`, and an inspection command in `next`.
