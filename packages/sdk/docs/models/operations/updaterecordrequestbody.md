# UpdateRecordRequestBody

## Example Usage

```typescript
import { UpdateRecordRequestBody } from "@vercel/sdk/models/operations/updaterecord.js";

let value: UpdateRecordRequestBody = {
  name: "example-1",
  value: "google.com",
  type: "A",
  ttl: 60,
  srv: {
    target: "example2.com.",
    weight: 185313,
    port: 27205,
    priority: 519985,
  },
  https: {
    priority: 451807,
    target: "example2.com.",
  },
  comment: "used to verify ownership of domain",
};
```

## Fields

| Field                                                                      | Type                                                                       | Required                                                                   | Description                                                                | Example                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `name`                                                                     | *string*                                                                   | :heavy_minus_sign:                                                         | The name of the DNS record                                                 | example-1                                                                  |
| `value`                                                                    | *string*                                                                   | :heavy_minus_sign:                                                         | The value of the DNS record                                                | google.com                                                                 |
| `type`                                                                     | [operations.UpdateRecordType](../../models/operations/updaterecordtype.md) | :heavy_minus_sign:                                                         | The type of the DNS record                                                 | A                                                                          |
| `ttl`                                                                      | *number*                                                                   | :heavy_minus_sign:                                                         | The Time to live (TTL) value of the DNS record                             | 60                                                                         |
| `mxPriority`                                                               | *number*                                                                   | :heavy_minus_sign:                                                         | The MX priority value of the DNS record                                    |                                                                            |
| `srv`                                                                      | [operations.Srv](../../models/operations/srv.md)                           | :heavy_minus_sign:                                                         | N/A                                                                        |                                                                            |
| `https`                                                                    | [operations.Https](../../models/operations/https.md)                       | :heavy_minus_sign:                                                         | N/A                                                                        |                                                                            |
| `comment`                                                                  | *string*                                                                   | :heavy_minus_sign:                                                         | A comment to add context on what this DNS record is for                    | used to verify ownership of domain                                         |