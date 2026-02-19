---
'vercel': patch
---

Remove metrics schema entries not supported by the query engine

Removes events (`prReview`, `prReviewModelUsage`, `reviewedPrComplete`), a measure (`coldStartDurationMs` from `functionExecution`), and several dimensions (`originHostname`, `originPath`, `originRoute` from `functionExecution`; `requestHostname` from `aiGatewayRequest`, `blobDataTransfer`, `imageTransformation`, `imageTransformationFailure`; `environment` and `projectId` from `blobDataTransfer` and `blobOperation`) that the observability query engine rejects.
