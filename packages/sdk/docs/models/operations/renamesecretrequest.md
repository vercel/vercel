# RenameSecretRequest

## Example Usage

```typescript
import { RenameSecretRequest } from "@vercel/sdk/models/operations";

let value: RenameSecretRequest = {
  name: "my-api-key",
  requestBody: {
    name: "my-api-key",
  },
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              | Example                                                                                  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `name`                                                                                   | *string*                                                                                 | :heavy_check_mark:                                                                       | The name of the secret.                                                                  | my-api-key                                                                               |
| `teamId`                                                                                 | *string*                                                                                 | :heavy_minus_sign:                                                                       | The Team identifier to perform the request on behalf of.                                 |                                                                                          |
| `slug`                                                                                   | *string*                                                                                 | :heavy_minus_sign:                                                                       | The Team slug to perform the request on behalf of.                                       |                                                                                          |
| `requestBody`                                                                            | [operations.RenameSecretRequestBody](../../models/operations/renamesecretrequestbody.md) | :heavy_minus_sign:                                                                       | N/A                                                                                      |                                                                                          |