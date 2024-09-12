# UpdateProjectProjectsDeploymentType

Specify if the Trusted IPs will apply to every Deployment Target or just Preview

## Example Usage

```typescript
import { UpdateProjectProjectsDeploymentType } from "@vercel/sdk/models/operations";

let value: UpdateProjectProjectsDeploymentType =
  "prod_deployment_urls_and_all_previews";
```

## Values

```typescript
"all" | "preview" | "production" | "prod_deployment_urls_and_all_previews"
```