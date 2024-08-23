# CreateWebhookRequest

## Example Usage

```typescript
import { CreateWebhookRequest } from '@vercel/client/models/operations';

let value: CreateWebhookRequest = {};
```

## Fields

| Field         | Type                                                                                       | Required           | Description                                              |
| ------------- | ------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------- |
| `teamId`      | _string_                                                                                   | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                                                                   | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | [operations.CreateWebhookRequestBody](../../models/operations/createwebhookrequestbody.md) | :heavy_minus_sign: | N/A                                                      |
