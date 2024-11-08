# CreateWebhookEvents

The webhooks events

## Example Usage

```typescript
import { CreateWebhookEvents } from "@vercel/sdk/models/operations/createwebhook.js";

let value: CreateWebhookEvents = "deployment.created";
```

## Values

```typescript
"budget.reached" | "budget.reset" | "domain.created" | "deployment.created" | "deployment.error" | "deployment.canceled" | "deployment.succeeded" | "deployment.ready" | "deployment.check-rerequested" | "deployment.promoted" | "deployment.integration.action.start" | "deployment.integration.action.cancel" | "deployment.integration.action.cleanup" | "edge-config.created" | "edge-config.deleted" | "edge-config.items.updated" | "firewall.attack" | "integration-configuration.permission-upgraded" | "integration-configuration.removed" | "integration-configuration.scope-change-confirmed" | "project.created" | "project.removed" | "deployment-checks-completed" | "deployment-ready" | "deployment-prepared" | "deployment-error" | "deployment-check-rerequested" | "deployment-canceled" | "project-created" | "project-removed" | "domain-created" | "deployment" | "integration-configuration-permission-updated" | "integration-configuration-removed" | "integration-configuration-scope-change-confirmed" | "marketplace.invoice.created" | "marketplace.invoice.paid" | "marketplace.invoice.notpaid" | "marketplace.invoice.refunded" | "test-webhook"
```