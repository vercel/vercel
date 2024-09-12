# FilterProjectEnvsRequest

## Example Usage

```typescript
import { FilterProjectEnvsRequest } from "@vercel/sdk/models/operations";

let value: FilterProjectEnvsRequest = {
  idOrName: "prj_XLKmu1DyR1eY7zq8UgeRKbA7yVLA",
  gitBranch: "feature-1",
  source: "vercel-cli:pull",
};
```

## Fields

| Field                                                                                                   | Type                                                                                                    | Required                                                                                                | Description                                                                                             | Example                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `idOrName`                                                                                              | *string*                                                                                                | :heavy_check_mark:                                                                                      | The unique project identifier or the project name                                                       | prj_XLKmu1DyR1eY7zq8UgeRKbA7yVLA                                                                        |
| `gitBranch`                                                                                             | *string*                                                                                                | :heavy_minus_sign:                                                                                      | If defined, the git branch of the environment variable to filter the results (must have target=preview) | feature-1                                                                                               |
| `decrypt`                                                                                               | [operations.Decrypt](../../models/operations/decrypt.md)                                                | :heavy_minus_sign:                                                                                      | If true, the environment variable value will be decrypted                                               | true                                                                                                    |
| `source`                                                                                                | *string*                                                                                                | :heavy_minus_sign:                                                                                      | The source that is calling the endpoint.                                                                | vercel-cli:pull                                                                                         |
| `teamId`                                                                                                | *string*                                                                                                | :heavy_minus_sign:                                                                                      | The Team identifier to perform the request on behalf of.                                                |                                                                                                         |
| `slug`                                                                                                  | *string*                                                                                                | :heavy_minus_sign:                                                                                      | The Team slug to perform the request on behalf of.                                                      |                                                                                                         |