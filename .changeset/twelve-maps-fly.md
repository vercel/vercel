---
'@vercel/build-utils': patch
'@vercel/python': patch
'vercel': patch
---

Support workflow-triggered job services in queue infrastructure

Add `isWorkflowTriggeredService()` and `isQueueBackedService()` helpers so workflow services
are recognized by the queue broker, dev server, and build pipeline. Update Python runtime to
bootstrap workflow services as queue-backed workers.
