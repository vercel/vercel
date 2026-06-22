---
'vercel': minor
---

Add `vercel flags segments` commands for listing, inspecting, creating, updating, and deleting feature flag segments.

Examples:

```bash
vercel flags segments ls
vercel flags segments inspect beta-users --json
vercel flags segments create beta-users --label "Beta users" --add include:user.id=user_123 --add include:user.id=user_456
vercel flags segments create enterprise-users --label "Enterprise users" --add rule:user.plan:eq:enterprise
vercel flags segments update beta-users --add include:user.id=user_789 --remove include:user.id=user_123
vercel flags segments update enterprise-users --add rule:user.email:ends-with:@company.com --remove rule:user.plan:eq:pro
vercel flags segments update enterprise-users --data '{"rules":[],"include":{"user":{"email":[{"value":"me@company.com"}]}},"exclude":{}}'
vercel flags segments rm beta-users --yes
```
