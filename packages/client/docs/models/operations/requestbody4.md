# RequestBody4

## Example Usage

```typescript
import { RequestBody4 } from "@vercel/client/models/operations";

let value: RequestBody4 = {
  name: "subdomain",
  type: "A",
  ttl: 60,
  value: "0 issue \\"letsencrypt.org\\"",
  comment: "used to verify ownership of domain",
};
```

## Fields

| Field     | Type                                                                                                                 | Required           | Description                                                                                                   | Example                            |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `name`    | _string_                                                                                                             | :heavy_check_mark: | A subdomain name or an empty string for the root domain.                                                      | subdomain                          |
| `type`    | [operations.CreateRecordRequestBodyDnsRequestType](../../models/operations/createrecordrequestbodydnsrequesttype.md) | :heavy_check_mark: | The type of record, it could be one of the valid DNS records.                                                 |                                    |
| `ttl`     | _number_                                                                                                             | :heavy_minus_sign: | The TTL value. Must be a number between 60 and 2147483647. Default value is 60.                               | 60                                 |
| `value`   | _string_                                                                                                             | :heavy_check_mark: | A CAA record to specify which Certificate Authorities (CAs) are allowed to issue certificates for the domain. | 0 issue \"letsencrypt.org\"        |
| `comment` | _string_                                                                                                             | :heavy_minus_sign: | A comment to add context on what this DNS record is for                                                       | used to verify ownership of domain |
