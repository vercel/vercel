---
'vercel': patch
---

Add `vercel flags rollout` for staged, time-based progressive rollouts.

Examples:

```bash
vercel flags rollout redesigned-checkout \
  --environment production \
  --by user.userId \
  --stage 5,6h \
  --stage 10,6h \
  --stage 25,12h \
  --stage 50,1d
```

```bash
vercel flags rollout redesigned-checkout \
  --environment production \
  --by user.userId \
  --stage 5,30m \
  --stage 25,2h \
  --stage 50,8h \
  --start now
```

```bash
vercel flags rollout welcome-message \
  --environment production \
  --by user.userId \
  --from-variant control \
  --to-variant treatment \
  --default-variant control \
  --stage 10,2h \
  --stage 50,12h \
  --start 2026-04-16T09:00:00Z
```

```bash
vercel flags rollout redesigned-checkout \
  --environment production \
  --stage 10,6h \
  --stage 50,1d \
  --message "Adjust production rollout schedule"
```
