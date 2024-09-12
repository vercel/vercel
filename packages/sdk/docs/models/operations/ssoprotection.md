# SsoProtection

Ensures visitors to your Preview Deployments are logged into Vercel and have a minimum of Viewer access on your team

## Example Usage

```typescript
import { SsoProtection } from "@vercel/sdk/models/operations";

let value: SsoProtection = {};
```

## Fields

| Field                                                                                                       | Type                                                                                                        | Required                                                                                                    | Description                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `deploymentType`                                                                                            | [operations.UpdateProjectDeploymentType](../../models/operations/updateprojectdeploymenttype.md)            | :heavy_minus_sign:                                                                                          | Specify if the Vercel Authentication (SSO Protection) will apply to every Deployment Target or just Preview |