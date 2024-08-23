# PatchDomainRequestBody1

update

## Example Usage

```typescript
import { PatchDomainRequestBody1 } from '@vercel/client/models/operations';

let value: PatchDomainRequestBody1 = {
  op: 'update',
};
```

## Fields

| Field               | Type       | Required           | Description                                                                    | Example |
| ------------------- | ---------- | ------------------ | ------------------------------------------------------------------------------ | ------- |
| `op`                | _string_   | :heavy_minus_sign: | N/A                                                                            | update  |
| `renew`             | _boolean_  | :heavy_minus_sign: | Specifies whether domain should be renewed.                                    |         |
| `customNameservers` | _string_[] | :heavy_minus_sign: | The custom nameservers for this project.                                       |         |
| `zone`              | _boolean_  | :heavy_minus_sign: | Specifies whether this is a DNS zone that intends to use Vercel's nameservers. |         |
