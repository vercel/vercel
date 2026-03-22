---
'@vercel-internals/types': minor
'@vercel/client': minor
'vercel': minor
---

Add security check step types and events for the deployment inspector

This adds support for displaying a "Performing security checks for dependencies" step in the deployment inspector UI:

- Added `securityCheckState`, `securityCheckConclusion`, and `securityCheck` fields to the Deployment type
- Added `SecurityCheckDetails`, `SecurityCheckSource`, and `SecurityCheckSkipReason` types
- Added security check events: `security-check-pending`, `security-check-running`, `security-check-completed`, `security-check-skipped`, `security-check-succeeded`, `security-check-failed`, `security-check-warning`
- Added CLI output for security check states during deployment

The security check step is only rendered when the feature flag is enabled. It handles:
- Prebuilt deployments (skipped with reason)
- Missing lockfiles (falls back to package.json)
- Monorepos (only audits the deployed subset via manifestPath)
- Detailed results including malware count and vulnerability count
