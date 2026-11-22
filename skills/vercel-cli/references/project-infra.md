# Project Infrastructure

- **Cache:** distinguish invalidation from destructive deletion. Choose the cache layer and scope relevant to the observed problem.
- **Cron:** creating a schedule can write `vercel.json`; it is not an inspection operation. Authenticate the handler and account for firewall rules that can still block it.
- **Deploy hooks:** hook URLs authorize deployment triggers. Treat them as credentials when displaying or storing results.
- **Git connections:** verify the resolved project and repository before changing the connection; deployment provenance depends on it.
- **Edge Config:** contents and access tokens may be sensitive. Read only the keys needed for the task.
- **Routing and redirects:** see [Routing Rules](routing.md) for staging, precedence, and publication boundaries.
- **Custom environments:** purchased capacity is separate from environment creation and deployment targeting. Confirm the purchase units and resulting capacity from current help/output before changing billing.
- **Rolling releases:** inspect the active deployment and stage before advancing, completing, or aborting. A completed command is not evidence that all production traffic moved to the intended deployment.
