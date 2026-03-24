---
'vercel': patch
---

Improve buy command error handling: handle new API error codes (invalid_plan, already_on_plan, invalid_status, forbidden, purchase_create_hosted_failed), distinguish 402 payment failures from server errors, and auto-open billing page in TTY mode for payment-related errors.
