---
'vercel': patch
---

cli(metrics): align schema with query engine and rename incomingRequest to edgeRequest

- Remove `tokens` unit type (now `count`), drop `unique` aggregation, add `p50`
- Remove unsupported events: `analyticsEvent`, `analyticsPageview`, `blobStoreState`, `dataCacheState`
- Update dimensions, measures, and `filterOnly` flags across all events
- Rename `incomingRequest` to `edgeRequest` with query engine aliasing for agent understanding
