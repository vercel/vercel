---
'vercel': patch
---

fix(cli): handle triggering re-auth with legacy token + flags

If the CLI was using a legacy token (ie, was signed in on a version previous to 48.0.0) and did not have a SAML authorization for a team resource, commands with flags unknown to vc login failed to initiate the SAML re-authentication flow as we were parsing all arguments. This change ensures that the user is prompted to log in again in such cases.
