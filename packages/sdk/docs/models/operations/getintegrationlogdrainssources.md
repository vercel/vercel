# GetIntegrationLogDrainsSources

The sources from which logs are currently being delivered to this log drain.

## Example Usage

```typescript
import { GetIntegrationLogDrainsSources } from "@vercel/sdk/models/operations";

let value: GetIntegrationLogDrainsSources = "firewall";
```

## Values

```typescript
"build" | "edge" | "lambda" | "static" | "external" | "firewall"
```