# GetConfigurationResponseBodyIntegrationsResponseSource

Source defines where the configuration was installed from. It is used to analyze user engagement for integration installations in product metrics.

## Example Usage

```typescript
import { GetConfigurationResponseBodyIntegrationsResponseSource } from "@vercel/sdk/models/operations/getconfiguration.js";

let value: GetConfigurationResponseBodyIntegrationsResponseSource =
  "marketplace";
```

## Values

```typescript
"marketplace" | "deploy-button" | "external"
```