# CreateLogDrainSources

The sources from which logs are currently being delivered to this log drain.

## Example Usage

```typescript
import { CreateLogDrainSources } from "@vercel/sdk/models/operations/createlogdrain.js";

let value: CreateLogDrainSources = "build";
```

## Values

```typescript
"build" | "edge" | "lambda" | "static" | "external" | "firewall"
```