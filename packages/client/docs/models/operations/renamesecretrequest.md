# RenameSecretRequest

## Example Usage

```typescript
import { RenameSecretRequest } from '@vercel/client/models/operations';

let value: RenameSecretRequest = {
  name: 'my-api-key',
  requestBody: {
    name: 'my-api-key',
  },
};
```

## Fields

| Field         | Type                                                                                     | Required           | Description                                              | Example    |
| ------------- | ---------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- | ---------- |
| `name`        | _string_                                                                                 | :heavy_check_mark: | The name of the secret.                                  | my-api-key |
| `teamId`      | _string_                                                                                 | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |            |
| `slug`        | _string_                                                                                 | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |            |
| `requestBody` | [operations.RenameSecretRequestBody](../../models/operations/renamesecretrequestbody.md) | :heavy_minus_sign: | N/A                                                      |            |
