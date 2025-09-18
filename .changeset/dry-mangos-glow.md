---
'vercel': patch
---

fix(cli): handle triggering re-auth with legacy token + flags

If CLI was using a legacy token (ie. was signed in on a version previous to `48.0.0`) and not having a SAML authorization for a team resource, certain commands failed to initiate the SAML re-authentication flow. This change ensures that the user is prompted to log in again in such cases.
