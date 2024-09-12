# ResponseBodyReadySubstate

Since June 2023 Substate of deployment when readyState is 'READY' Tracks whether or not deployment has seen production traffic: - STAGED: never seen production traffic - PROMOTED: has seen production traffic

## Example Usage

```typescript
import { ResponseBodyReadySubstate } from "@vercel/sdk/models/operations";

let value: ResponseBodyReadySubstate = "PROMOTED";
```

## Values

```typescript
"STAGED" | "PROMOTED"
```