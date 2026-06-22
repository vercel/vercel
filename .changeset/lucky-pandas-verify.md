---
'vercel': minor
---

Add `vercel domains verify <domain>` for DNS misconfiguration feedback. The command checks the domain's DNS configuration, reports dashboard-aligned configuration and project-verification states, triggers a verification re-check when needed, and lists actionable fixes: recommended A/CNAME records, Vercel nameservers, conflicting records, DNSSEC guidance, and the TXT ownership challenge. Domains eligible for automatic configuration also receive a Domain Connect URL, with manual DNS guidance as a fallback. Supports `--project`, `--strict`, and `--format json`; non-interactive runs emit structured status, simultaneous issue details, automatic-configuration metadata, and shell-safe, context-preserving next commands. Human and structured output share one diagnosis so status, remediation, and exit behavior stay consistent. The command exits non-zero when action is required so scripts and agents can gate on it.
