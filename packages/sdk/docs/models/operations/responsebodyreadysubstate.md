# ResponseBodyReadySubstate

Since June 2023 Substate of deployment when readyState is 'READY' Tracks whether or not deployment has seen production traffic: - STAGED: never seen production traffic - PROMOTED: has seen production traffic

## Example Usage

```typescript
import { ResponseBodyReadySubstate } from "@vercel/sdk/models/operations/getdeployment.js";

let value: ResponseBodyReadySubstate = "STAGED";
```

## Values

```typescript
"STAGED" | "PROMOTED"
```