# ListAliasesRequest

## Example Usage

```typescript
import { ListAliasesRequest } from "@vercel/sdk/models/operations";

let value: ListAliasesRequest = {
  domain: [
    "my-test-domain.com",
  ],
  from: 1540095775951,
  limit: 10,
  projectId: "prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB",
  since: 1540095775941,
  until: 1540095775951,
  rollbackDeploymentId: "dpl_XXX",
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    | Example                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `domain`                                                       | *operations.Domain*                                            | :heavy_minus_sign:                                             | Get only aliases of the given domain name                      | my-test-domain.com                                             |
| `from`                                                         | *number*                                                       | :heavy_minus_sign:                                             | Get only aliases created after the provided timestamp          | 1540095775951                                                  |
| `limit`                                                        | *number*                                                       | :heavy_minus_sign:                                             | Maximum number of aliases to list from a request               | 10                                                             |
| `projectId`                                                    | *string*                                                       | :heavy_minus_sign:                                             | Filter aliases from the given `projectId`                      | prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB                               |
| `since`                                                        | *number*                                                       | :heavy_minus_sign:                                             | Get aliases created after this JavaScript timestamp            | 1540095775941                                                  |
| `until`                                                        | *number*                                                       | :heavy_minus_sign:                                             | Get aliases created before this JavaScript timestamp           | 1540095775951                                                  |
| `rollbackDeploymentId`                                         | *string*                                                       | :heavy_minus_sign:                                             | Get aliases that would be rolled back for the given deployment | dpl_XXX                                                        |
| `teamId`                                                       | *string*                                                       | :heavy_minus_sign:                                             | The Team identifier to perform the request on behalf of.       |                                                                |
| `slug`                                                         | *string*                                                       | :heavy_minus_sign:                                             | The Team slug to perform the request on behalf of.             |                                                                |