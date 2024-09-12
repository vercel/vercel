# CreateLogDrainSources

The sources from which logs are currently being delivered to this log drain.

## Example Usage

```typescript
import { CreateLogDrainSources } from "@vercel/sdk/models/operations";

let value: CreateLogDrainSources = "static";
```

## Values

```typescript
"build" | "edge" | "lambda" | "static" | "external" | "firewall"
```