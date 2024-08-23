# CreateOrTransferDomainRequestBody1

add

## Example Usage

```typescript
import { CreateOrTransferDomainRequestBody1 } from '@vercel/client/models/operations';

let value: CreateOrTransferDomainRequestBody1 = {
  name: 'example.com',
  cdnEnabled: true,
  method: 'transfer-in',
};
```

## Fields

| Field        | Type      | Required           | Description                                                               | Example     |
| ------------ | --------- | ------------------ | ------------------------------------------------------------------------- | ----------- |
| `name`       | _string_  | :heavy_check_mark: | The domain name you want to add.                                          | example.com |
| `cdnEnabled` | _boolean_ | :heavy_minus_sign: | Whether the domain has the Vercel Edge Network enabled or not.            | true        |
| `zone`       | _boolean_ | :heavy_minus_sign: | N/A                                                                       |             |
| `method`     | _string_  | :heavy_minus_sign: | The domain operation to perform. It can be either `add` or `transfer-in`. | transfer-in |
