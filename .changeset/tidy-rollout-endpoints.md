---
'vercel': minor
---

Add `--final-percentage` to feature flag rollouts and rollout rule outcomes. For example, `vercel flags rollout my-feature -e production --by user.userId --stage 5,6h --stage 25,12h --final-percentage 50` finishes at 50% indefinitely.

The option accepts 0–100 with up to three decimal places. Existing final percentages are preserved when omitted, and new rollouts still default to 100%. Show the configured endpoint in rollout summaries, flag inspection, rule listings, and version diffs.
