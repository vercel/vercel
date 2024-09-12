# ResponseBodyEvents

The webhooks events

## Example Usage

```typescript
import { ResponseBodyEvents } from "@vercel/sdk/models/operations";

let value: ResponseBodyEvents = "deployment.created";
```

## Values

```typescript
"budget.reached" | "budget.reset" | "domain.created" | "deployment.created" | "deployment.error" | "deployment.canceled" | "deployment.succeeded" | "deployment.ready" | "deployment.check-rerequested" | "deployment.promoted" | "edge-config.created" | "edge-config.deleted" | "edge-config.updated" | "integration-configuration.permission-upgraded" | "integration-configuration.removed" | "integration-configuration.scope-change-confirmed" | "project.created" | "project.removed" | "deployment-checks-completed" | "deployment-prepared" | "deployment" | "marketplace.invoice.created" | "marketplace.invoice.paid" | "marketplace.invoice.notpaid" | "test-webhook"
```