---
'vercel': patch
---

Add CLI support for managing conditional feature flag rules.

Example command runs:

```bash
vercel flags rules ls my-feature --environment production
vercel flags rules ls my-feature --environment production --json
vercel flags rules add my-feature --environment production --condition user.plan:eq:pro --variant on
vercel flags rules add my-feature --environment production --condition segment:eq:seg_beta123 --variant on
vercel flags rules add my-feature --environment production --condition user.plan:eq:pro --by user.userId --weight off=90 --weight on=10 --position 1
vercel flags rules update my-feature rule_123 --environment production --condition user.plan:eq:enterprise
vercel flags rules update my-feature rule_123 --environment production --variant off
vercel flags rules move my-feature rule_123 --environment production --position 1
vercel flags rules remove my-feature rule_123 --environment production
```
