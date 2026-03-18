---
'vercel': patch
---

fix(cli): support installation-level metadata for `integration add`

Integrations like Sentry have both product-level metadata (e.g. `platform`) and installation-level metadata (e.g. `name`, `region`). The CLI now:
- Shows installation-level metadata fields in `--help` output
- Accepts installation-level metadata keys via `-m` flags
- Splits metadata into product and installation buckets, sending `installationMetadata` as a separate API field
- Shows actionable hint when required metadata is missing on browser fallback (lists missing fields with example `-m` flags)
- Forwards `installationMetadata` to browser fallback URL so installation config isn't lost on redirect
- Logs debug warning when product and installation schemas have overlapping key names
