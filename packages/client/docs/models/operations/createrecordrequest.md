# CreateRecordRequest

## Example Usage

```typescript
import { CreateRecordRequest } from '@vercel/client/models/operations';

let value: CreateRecordRequest = {
  domain: 'example.com',
  requestBody: {
    name: '<value>',
    type: 'MX',
    ttl: 60,
    srv: {
      priority: 10,
      weight: 10,
      port: 5000,
      target: 'host.example.com',
    },
    comment: 'used to verify ownership of domain',
  },
};
```

## Fields

| Field         | Type                                 | Required           | Description                                              | Example     |
| ------------- | ------------------------------------ | ------------------ | -------------------------------------------------------- | ----------- |
| `domain`      | _string_                             | :heavy_check_mark: | The domain used to create the DNS record.                | example.com |
| `teamId`      | _string_                             | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |             |
| `slug`        | _string_                             | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |             |
| `requestBody` | _operations.CreateRecordRequestBody_ | :heavy_minus_sign: | N/A                                                      |             |
