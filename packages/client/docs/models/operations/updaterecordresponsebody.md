# UpdateRecordResponseBody

## Example Usage

```typescript
import { UpdateRecordResponseBody } from '@vercel/client/models/operations';

let value: UpdateRecordResponseBody = {
  creator: '<value>',
  domain: 'messy-occupation.com',
  id: '<id>',
  name: '<value>',
  recordType: 'SRV',
  type: 'record-sys',
  value: '<value>',
};
```

## Fields

| Field        | Type                                                                             | Required           | Description |
| ------------ | -------------------------------------------------------------------------------- | ------------------ | ----------- |
| `createdAt`  | _number_                                                                         | :heavy_minus_sign: | N/A         |
| `creator`    | _string_                                                                         | :heavy_check_mark: | N/A         |
| `domain`     | _string_                                                                         | :heavy_check_mark: | N/A         |
| `id`         | _string_                                                                         | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                         | :heavy_check_mark: | N/A         |
| `recordType` | [operations.RecordType](../../models/operations/recordtype.md)                   | :heavy_check_mark: | N/A         |
| `ttl`        | _number_                                                                         | :heavy_minus_sign: | N/A         |
| `type`       | [operations.UpdateRecordDnsType](../../models/operations/updaterecorddnstype.md) | :heavy_check_mark: | N/A         |
| `value`      | _string_                                                                         | :heavy_check_mark: | N/A         |
| `comment`    | _string_                                                                         | :heavy_minus_sign: | N/A         |
