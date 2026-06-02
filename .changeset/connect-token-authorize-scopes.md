---
"vercel": patch
---

[connect] Forward `--scopes` and `--installation-id` into the authorize/install recovery URL

When `vercel connect token` hits an action-required error (`user_authorization_required` or `client_installation_required`), the CLI builds an authorize/install URL for the user to complete consent in the browser. Previously this URL carried only `teamId` and `request_code`, dropping the `--scopes` and `--installation-id` the user supplied. As a result the consent flow fell back to provider defaults (e.g. Slack's `users.profile:read`), and the post-authorization token retry mismatched the requested scopes. The CLI now forwards `scopes` (comma-joined) and `installationId` as query params, which the authorize and install endpoints already accept.
