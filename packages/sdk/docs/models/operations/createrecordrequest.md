# CreateRecordRequest

## Example Usage

```typescript
import { CreateRecordRequest } from "@vercel/sdk/models/operations/createrecord.js";

let value: CreateRecordRequest = {
  domain: "example.com",
  requestBody: {
    name: "subdomain",
    type: "A",
    ttl: 60,
    value: "192.0.2.42",
    comment: "used to verify ownership of domain",
  },
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              | Example                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `domain`                                                 | *string*                                                 | :heavy_check_mark:                                       | The domain used to create the DNS record.                | example.com                                              |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |                                                          |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |                                                          |
| `requestBody`                                            | *operations.CreateRecordRequestBody*                     | :heavy_minus_sign:                                       | N/A                                                      |                                                          |