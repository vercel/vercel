# UpdateProjectDeploymentType

Specify if the Vercel Authentication (SSO Protection) will apply to every Deployment Target or just Preview

## Example Usage

```typescript
import { UpdateProjectDeploymentType } from "@vercel/sdk/models/operations/updateproject.js";

let value: UpdateProjectDeploymentType = "all";
```

## Values

```typescript
"all" | "preview" | "prod_deployment_urls_and_all_previews"
```