# ReadyState

The state of the deployment depending on the process of deploying, or if it is ready or in an error state

## Example Usage

```typescript
import { ReadyState } from "@vercel/sdk/models/operations";

let value: ReadyState = "READY";
```

## Values

```typescript
"INITIALIZING" | "BUILDING" | "UPLOADING" | "DEPLOYING" | "READY" | "ARCHIVED" | "ERROR" | "QUEUED" | "CANCELED"
```