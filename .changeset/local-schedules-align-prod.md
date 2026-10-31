---
'@vercel-internals/local-schedules': minor
'vercel': patch
---

Align `vercel dev` Schedules with the deployed service. Function and path dispatches now send the `ce-vssexpression` header that `@vercel/schedules` requires, and Queue messages include `expression`. Path targets also receive the legacy Cron Job headers and `authorization: Bearer <CRON_SECRET>`, and are requested through `vercel dev`'s own routing, so they work in projects without a framework dev command. Local schedules now follow the hosted API: names start with a letter or number, single-fire times use minute precision, static schedules can only be enabled or disabled, a single-fire schedule can't be changed once its time arrives, `vercel schedules enable --until` and `--for` work with `--local`, payloads are limited to 8 KiB, and cron occurrences missed during sleep are skipped once the next one is due.
