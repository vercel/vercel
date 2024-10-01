# VercelCache

## Example Usage

```typescript
import { VercelCache } from "@vercel/sdk/models/operations/getdeploymentevents.js";

let value: VercelCache = "MISS";
```

## Values

```typescript
"MISS" | "HIT" | "STALE" | "BYPASS" | "PRERENDER" | "REVALIDATED"
```