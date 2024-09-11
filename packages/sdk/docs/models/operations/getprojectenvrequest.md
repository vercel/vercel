# GetProjectEnvRequest

## Example Usage

```typescript
import { GetProjectEnvRequest } from "@vercel/sdk/models/operations";

let value: GetProjectEnvRequest = {
  idOrName: "prj_XLKmu1DyR1eY7zq8UgeRKbA7yVLA",
  id: "<id>",
};
```

## Fields

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            | Example                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `idOrName`                                                             | *string*                                                               | :heavy_check_mark:                                                     | The unique project identifier or the project name                      | prj_XLKmu1DyR1eY7zq8UgeRKbA7yVLA                                       |
| `id`                                                                   | *string*                                                               | :heavy_check_mark:                                                     | The unique ID for the environment variable to get the decrypted value. |                                                                        |
| `teamId`                                                               | *string*                                                               | :heavy_minus_sign:                                                     | The Team identifier to perform the request on behalf of.               |                                                                        |
| `slug`                                                                 | *string*                                                               | :heavy_minus_sign:                                                     | The Team slug to perform the request on behalf of.                     |                                                                        |