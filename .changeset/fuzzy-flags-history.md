---
'vercel': patch
---

Add `vercel flags versions <flag>` and `vercel flags versions diff <flag> --revision <number>` to inspect feature flag version history and changes.

Examples:

```bash
vercel flags versions my-flag
vercel flags versions my-flag --environment production
vercel flags versions diff my-flag --revision 4
```
