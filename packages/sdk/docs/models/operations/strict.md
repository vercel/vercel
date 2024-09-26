# Strict

When true, the response will only include the nameservers assigned directly to the specified domain. When false and there are no nameservers assigned directly to the specified domain, the response will include the nameservers of the domain's parent zone.

## Example Usage

```typescript
import { Strict } from "@vercel/sdk/models/operations/getdomainconfig.js";

let value: Strict = "true";
```

## Values

```typescript
"true" | "false"
```