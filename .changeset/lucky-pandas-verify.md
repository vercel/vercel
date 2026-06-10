---
'vercel': minor
---

Add `vercel domains verify <domain>` for DNS misconfiguration feedback. The command checks the domain's DNS configuration, reports whether it points to Vercel and whether the project binding is verified (triggering a re-check when it isn't), and lists actionable fixes: recommended A/CNAME records, Vercel nameservers, conflicting records, and the TXT ownership challenge. Supports `--project`, `--strict`, and `--format json`; exits non-zero when the domain is misconfigured or unverified so scripts and agents can gate on it.
