# RequestBody2

## Example Usage

```typescript
import { RequestBody2 } from '@vercel/client/models/operations';

let value: RequestBody2 = {
  name: 'subdomain',
  type: 'MX',
  ttl: 60,
  value: '2001:DB8::42',
  comment: 'used to verify ownership of domain',
};
```

## Fields

| Field     | Type                                                                                             | Required           | Description                                                                     | Example                            |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------- | ---------------------------------- |
| `name`    | _string_                                                                                         | :heavy_check_mark: | A subdomain name or an empty string for the root domain.                        | subdomain                          |
| `type`    | [operations.CreateRecordRequestBodyType](../../models/operations/createrecordrequestbodytype.md) | :heavy_check_mark: | The type of record, it could be one of the valid DNS records.                   |                                    |
| `ttl`     | _number_                                                                                         | :heavy_minus_sign: | The TTL value. Must be a number between 60 and 2147483647. Default value is 60. | 60                                 |
| `value`   | _string_                                                                                         | :heavy_check_mark: | An AAAA record pointing to an IPv6 address.                                     | 2001:DB8::42                       |
| `comment` | _string_                                                                                         | :heavy_minus_sign: | A comment to add context on what this DNS record is for                         | used to verify ownership of domain |
