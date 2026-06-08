---
'vercel': patch
---

Fix two latent issues in `vercel dev`'s cron simulator and consolidate the cron utilities into `util/cron.ts`:

- **Strict input validation.** `getNextCronDelay` now returns `null` for syntactically valid but out-of-range expressions (`60 * * * *`, `0 24 * * *`, `0 0 * * 8`, etc.) instead of silently producing a never-matching schedule.
- **`dow=7` as Sunday.** Day-of-week values of `7` are now treated as Sunday (matching `validateCronSchedule`), instead of being silently dropped.

`validateCronSchedule` is now exported from `util/cron.ts`; the existing re-export from `commands/crons/add.ts` is preserved so external consumers keep working.
