# CreateAuthTokenRequestBody2

## Example Usage

```typescript
import { CreateAuthTokenRequestBody2 } from "@vercel/sdk/models/operations";

let value: CreateAuthTokenRequestBody2 = {
  type: "oauth2-token",
  name: "<value>",
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `type`                                                                                                 | [operations.CreateAuthTokenRequestBodyType](../../models/operations/createauthtokenrequestbodytype.md) | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `name`                                                                                                 | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `clientId`                                                                                             | *string*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `installationId`                                                                                       | *string*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |
| `expiresAt`                                                                                            | *number*                                                                                               | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |