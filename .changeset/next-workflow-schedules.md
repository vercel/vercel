---
'@vercel/next': minor
'@vercel/build-utils': patch
---

Return the static schedules the Workflow SDK declares for an app's workflows (`experimental_schedule`), from the `config.json` it writes next to its generated flow route, as the build result's `schedules`. `vercel build` merges them with `vercel.json#schedules`, so a Next.js app's scheduled workflows need no `vercel.json` entry. `BuildResultV2Typical` gains the `schedules` field.
