# Nine

## Example Usage

```typescript
import { Nine } from '@vercel/client/models/operations';

let value: Nine = {
  name: 'subdomain',
  type: 'A',
  ttl: 60,
  value: 'ns1.example.com',
  comment: 'used to verify ownership of domain',
};
```

## Fields

| Field     | Type                                                                                                                   | Required           | Description                                                                     | Example                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------- | ---------------------------------- |
| `name`    | _string_                                                                                                               | :heavy_check_mark: | A subdomain name.                                                               | subdomain                          |
| `type`    | [operations.CreateRecordRequestBodyDnsRequest9Type](../../models/operations/createrecordrequestbodydnsrequest9type.md) | :heavy_check_mark: | The type of record, it could be one of the valid DNS records.                   |                                    |
| `ttl`     | _number_                                                                                                               | :heavy_minus_sign: | The TTL value. Must be a number between 60 and 2147483647. Default value is 60. | 60                                 |
| `value`   | _string_                                                                                                               | :heavy_minus_sign: | An NS domain value.                                                             | ns1.example.com                    |
| `comment` | _string_                                                                                                               | :heavy_minus_sign: | A comment to add context on what this DNS record is for                         | used to verify ownership of domain |
