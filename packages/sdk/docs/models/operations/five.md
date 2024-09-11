# Five

## Example Usage

```typescript
import { Five } from "@vercel/sdk/models/operations";

let value: Five = {
  owner: "<value>",
  ref: "<value>",
  slug: "<value>",
  type: "bitbucket",
};
```

## Fields

| Field                                                                                                                                    | Type                                                                                                                                     | Required                                                                                                                                 | Description                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `owner`                                                                                                                                  | *string*                                                                                                                                 | :heavy_check_mark:                                                                                                                       | N/A                                                                                                                                      |
| `ref`                                                                                                                                    | *string*                                                                                                                                 | :heavy_check_mark:                                                                                                                       | N/A                                                                                                                                      |
| `sha`                                                                                                                                    | *string*                                                                                                                                 | :heavy_minus_sign:                                                                                                                       | N/A                                                                                                                                      |
| `slug`                                                                                                                                   | *string*                                                                                                                                 | :heavy_check_mark:                                                                                                                       | N/A                                                                                                                                      |
| `type`                                                                                                                                   | [operations.CreateDeploymentGitSourceDeploymentsRequestType](../../models/operations/createdeploymentgitsourcedeploymentsrequesttype.md) | :heavy_check_mark:                                                                                                                       | N/A                                                                                                                                      |