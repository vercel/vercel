---
"@vercel/connect": minor
---

Map new `/v1/connect/token/:connector` error codes to dedicated errors: `no_token` → `NoValidTokenError` (renamed from `no_valid_token`), `user_authorization_required` → new `UserAuthorizationRequiredError`, `client_installation_required` or `connector_installation_required` → new `ConnectorInstallationRequiredError`.
