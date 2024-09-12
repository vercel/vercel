# GetDeploymentsState

In which state is the deployment.

## Example Usage

```typescript
import { GetDeploymentsState } from "@vercel/sdk/models/operations/getdeployments.js";

let value: GetDeploymentsState = "READY";
```

## Values

```typescript
"BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED" | "DELETED"
```