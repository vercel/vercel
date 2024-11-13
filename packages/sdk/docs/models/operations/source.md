# Source

One of `LOCAL` or `REMOTE`. `LOCAL` specifies that the cache event was from the user's filesystem cache. `REMOTE` specifies that the cache event is from a remote cache.

## Example Usage

```typescript
import { Source } from "@vercel/sdk/models/operations/recordevents.js";

let value: Source = "LOCAL";
```

## Values

```typescript
"LOCAL" | "REMOTE"
```