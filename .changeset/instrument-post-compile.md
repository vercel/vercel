---
'@vercel/next': patch
---

Instrument post-compile phases (`buildCallback`, `glob node_modules`, legacy serverless function creation, `serverBuild`) with start/heartbeat/end log lines. Heartbeats fire every 15s so phases that wedge surface in `vercel inspect --logs` instead of producing silent stalls.
