# CreateOrTransferDomainCreator

An object containing information of the domain creator, including the user's id, username, and email.

## Example Usage

```typescript
import { CreateOrTransferDomainCreator } from '@vercel/client/models/operations';

let value: CreateOrTransferDomainCreator = {
  username: 'vercel_user',
  email: 'demo@example.com',
  id: 'ZspSRT4ljIEEmMHgoDwKWDei',
};
```

## Fields

| Field              | Type      | Required           | Description |
| ------------------ | --------- | ------------------ | ----------- |
| `username`         | _string_  | :heavy_check_mark: | N/A         |
| `email`            | _string_  | :heavy_check_mark: | N/A         |
| `customerId`       | _string_  | :heavy_minus_sign: | N/A         |
| `isDomainReseller` | _boolean_ | :heavy_minus_sign: | N/A         |
| `id`               | _string_  | :heavy_check_mark: | N/A         |
