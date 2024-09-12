# RequestBody3

## Example Usage

```typescript
import { RequestBody3 } from "@vercel/sdk/models/operations";

let value: RequestBody3 = {
  name: "subdomain",
  type: "CAA",
  ttl: 60,
  value: "cname.vercel-dns.com",
  comment: "used to verify ownership of domain",
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            | Example                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `name`                                                                                                 | *string*                                                                                               | :heavy_check_mark:                                                                                     | A subdomain name or an empty string for the root domain.                                               | subdomain                                                                                              |
| `type`                                                                                                 | [operations.CreateRecordRequestBodyDnsType](../../models/operations/createrecordrequestbodydnstype.md) | :heavy_check_mark:                                                                                     | The type of record, it could be one of the valid DNS records.                                          |                                                                                                        |
| `ttl`                                                                                                  | *number*                                                                                               | :heavy_minus_sign:                                                                                     | The TTL value. Must be a number between 60 and 2147483647. Default value is 60.                        | 60                                                                                                     |
| `value`                                                                                                | *string*                                                                                               | :heavy_check_mark:                                                                                     | An ALIAS virtual record pointing to a hostname resolved to an A record on server side.                 | cname.vercel-dns.com                                                                                   |
| `comment`                                                                                              | *string*                                                                                               | :heavy_minus_sign:                                                                                     | A comment to add context on what this DNS record is for                                                | used to verify ownership of domain                                                                     |