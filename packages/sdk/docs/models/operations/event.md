# Event

One of `HIT` or `MISS`. `HIT` specifies that a cached artifact for `hash` was found in the cache. `MISS` specifies that a cached artifact with `hash` was not found.

## Example Usage

```typescript
import { Event } from "@vercel/sdk/models/operations";

let value: Event = "MISS";
```

## Values

```typescript
"HIT" | "MISS"
```