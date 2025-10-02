---
"vercel": minor
---

Add --status flag to list command for deployment filtering

The `vercel list` command now supports filtering deployments by their status using the `--status` or `-s` flag. This feature allows users to filter deployments by one or more status values.

Features:
- Filter by single status: `vercel list --status READY`
- Filter by multiple statuses: `vercel list --status READY,BUILDING`
- Support for all deployment statuses: BUILDING, ERROR, INITIALIZING, QUEUED, READY, CANCELED
- Input validation with clear error messages
- Compatible with existing filters (environment, meta, etc.)
- Comprehensive test coverage and telemetry tracking
