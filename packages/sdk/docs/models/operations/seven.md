# Seven

## Example Usage

```typescript
import { Seven } from "@vercel/sdk/models/operations";

let value: Seven = {
  name: "<value>",
  type: "TXT",
  ttl: 60,
  srv: {
    priority: 10,
    weight: 10,
    port: 5000,
    target: "host.example.com",
  },
  comment: "used to verify ownership of domain",
};
```

## Fields

| Field                                                                                                                  | Type                                                                                                                   | Required                                                                                                               | Description                                                                                                            | Example                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`                                                                                                                 | *string*                                                                                                               | :heavy_check_mark:                                                                                                     | A subdomain name or an empty string for the root domain.                                                               |                                                                                                                        |
| `type`                                                                                                                 | [operations.CreateRecordRequestBodyDnsRequest7Type](../../models/operations/createrecordrequestbodydnsrequest7type.md) | :heavy_check_mark:                                                                                                     | The type of record, it could be one of the valid DNS records.                                                          |                                                                                                                        |
| `ttl`                                                                                                                  | *number*                                                                                                               | :heavy_minus_sign:                                                                                                     | The TTL value. Must be a number between 60 and 2147483647. Default value is 60.                                        | 60                                                                                                                     |
| `srv`                                                                                                                  | [operations.RequestBodySrv](../../models/operations/requestbodysrv.md)                                                 | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |                                                                                                                        |
| `comment`                                                                                                              | *string*                                                                                                               | :heavy_minus_sign:                                                                                                     | A comment to add context on what this DNS record is for                                                                | used to verify ownership of domain                                                                                     |