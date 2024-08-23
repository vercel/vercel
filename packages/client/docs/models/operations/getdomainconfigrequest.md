# GetDomainConfigRequest

## Example Usage

```typescript
import { GetDomainConfigRequest } from '@vercel/client/models/operations';

let value: GetDomainConfigRequest = {
  domain: 'example.com',
};
```

## Fields

| Field    | Type                                                   | Required           | Description                                                                                                                                                                                                                                                    | Example     |
| -------- | ------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `domain` | _string_                                               | :heavy_check_mark: | The name of the domain.                                                                                                                                                                                                                                        | example.com |
| `strict` | [operations.Strict](../../models/operations/strict.md) | :heavy_minus_sign: | When true, the response will only include the nameservers assigned directly to the specified domain. When false and there are no nameservers assigned directly to the specified domain, the response will include the nameservers of the domain's parent zone. |             |
| `teamId` | _string_                                               | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.                                                                                                                                                                                                       |             |
| `slug`   | _string_                                               | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                                                                                                                                                                                                             |             |
