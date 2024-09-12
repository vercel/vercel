# GetDeploymentsState

In which state is the deployment.

## Example Usage

```typescript
import { GetDeploymentsState } from "@vercel/sdk/models/operations";

let value: GetDeploymentsState = "READY";
```

## Values

```typescript
"BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED" | "DELETED"
```