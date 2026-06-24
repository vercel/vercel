---
---

Fix the Vercel Auth project-creation e2e test by disabling redirect-following so a protected deployment's 401 is observed directly instead of following the SSO redirect to a 200 login page.
