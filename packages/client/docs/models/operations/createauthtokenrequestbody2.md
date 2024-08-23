# CreateAuthTokenRequestBody2

## Example Usage

```typescript
import { CreateAuthTokenRequestBody2 } from '@vercel/client/models/operations';

let value: CreateAuthTokenRequestBody2 = {
  type: 'oauth2-token',
  name: '<value>',
};
```

## Fields

| Field            | Type                                                                                                   | Required           | Description |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `type`           | [operations.CreateAuthTokenRequestBodyType](../../models/operations/createauthtokenrequestbodytype.md) | :heavy_check_mark: | N/A         |
| `name`           | _string_                                                                                               | :heavy_check_mark: | N/A         |
| `clientId`       | _string_                                                                                               | :heavy_minus_sign: | N/A         |
| `installationId` | _string_                                                                                               | :heavy_minus_sign: | N/A         |
| `expiresAt`      | _number_                                                                                               | :heavy_minus_sign: | N/A         |
