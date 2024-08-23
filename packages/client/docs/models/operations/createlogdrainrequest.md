# CreateLogDrainRequest

## Example Usage

```typescript
import { CreateLogDrainRequest } from '@vercel/client/models/operations';

let value: CreateLogDrainRequest = {
  requestBody: {
    name: 'My first log drain',
    secret: 'a1Xsfd325fXcs',
    deliveryFormat: 'json',
    url: 'https://example.com/log-drain',
  },
};
```

## Fields

| Field         | Type                                                                                         | Required           | Description                                              |
| ------------- | -------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| `teamId`      | _string_                                                                                     | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                                                                     | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | [operations.CreateLogDrainRequestBody](../../models/operations/createlogdrainrequestbody.md) | :heavy_minus_sign: | N/A                                                      |
