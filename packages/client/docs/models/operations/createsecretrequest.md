# CreateSecretRequest

## Example Usage

```typescript
import { CreateSecretRequest } from '@vercel/client/models/operations';

let value: CreateSecretRequest = {
  name: 'my-api-key',
  requestBody: {
    name: 'my-api-key',
    value: 'some secret value',
    decryptable: true,
  },
};
```

## Fields

| Field         | Type                                                                                     | Required           | Description             | Example    |
| ------------- | ---------------------------------------------------------------------------------------- | ------------------ | ----------------------- | ---------- |
| `name`        | _string_                                                                                 | :heavy_check_mark: | The name of the secret. | my-api-key |
| `requestBody` | [operations.CreateSecretRequestBody](../../models/operations/createsecretrequestbody.md) | :heavy_minus_sign: | N/A                     |            |
