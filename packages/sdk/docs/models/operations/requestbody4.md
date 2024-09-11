# RequestBody4

## Example Usage

```typescript
import { RequestBody4 } from "@vercel/sdk/models/operations";

let value: RequestBody4 = {
  name: "subdomain",
  type: "A",
  ttl: 60,
  value: "0 issue \\"letsencrypt.org\\"",
  comment: "used to verify ownership of domain",
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          | Example                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `name`                                                                                                               | *string*                                                                                                             | :heavy_check_mark:                                                                                                   | A subdomain name or an empty string for the root domain.                                                             | subdomain                                                                                                            |
| `type`                                                                                                               | [operations.CreateRecordRequestBodyDnsRequestType](../../models/operations/createrecordrequestbodydnsrequesttype.md) | :heavy_check_mark:                                                                                                   | The type of record, it could be one of the valid DNS records.                                                        |                                                                                                                      |
| `ttl`                                                                                                                | *number*                                                                                                             | :heavy_minus_sign:                                                                                                   | The TTL value. Must be a number between 60 and 2147483647. Default value is 60.                                      | 60                                                                                                                   |
| `value`                                                                                                              | *string*                                                                                                             | :heavy_check_mark:                                                                                                   | A CAA record to specify which Certificate Authorities (CAs) are allowed to issue certificates for the domain.        | 0 issue \"letsencrypt.org\"                                                                                          |
| `comment`                                                                                                            | *string*                                                                                                             | :heavy_minus_sign:                                                                                                   | A comment to add context on what this DNS record is for                                                              | used to verify ownership of domain                                                                                   |