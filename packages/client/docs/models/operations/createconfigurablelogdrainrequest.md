# CreateConfigurableLogDrainRequest

## Example Usage

```typescript
import { CreateConfigurableLogDrainRequest } from '@vercel/client/models/operations';

let value: CreateConfigurableLogDrainRequest = {
  requestBody: {
    deliveryFormat: 'json',
    url: 'http://able-bonnet.biz',
    sources: ['firewall'],
  },
};
```

## Fields

| Field         | Type                                                                                                                 | Required           | Description                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| `teamId`      | _string_                                                                                                             | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                                                                                             | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | [operations.CreateConfigurableLogDrainRequestBody](../../models/operations/createconfigurablelogdrainrequestbody.md) | :heavy_minus_sign: | N/A                                                      |
