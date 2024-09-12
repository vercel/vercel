# DeploymentType

Specify if the password will apply to every Deployment Target or just Preview

## Example Usage

```typescript
import { DeploymentType } from "@vercel/sdk/models/operations";

let value: DeploymentType = "all";
```

## Values

```typescript
"all" | "preview" | "prod_deployment_urls_and_all_previews"
```