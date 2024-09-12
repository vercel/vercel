# BuyDomainResponseBody

Successful response for purchasing a Domain.

## Example Usage

```typescript
import { BuyDomainResponseBody } from "@vercel/sdk/models/operations";

let value: BuyDomainResponseBody = {
  domain: {
    uid: "<value>",
    ns: [
      "<value>",
    ],
    verified: false,
    created: 1372.51,
    pending: false,
  },
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `domain`                                                                               | [operations.BuyDomainDomainsDomain](../../models/operations/buydomaindomainsdomain.md) | :heavy_check_mark:                                                                     | N/A                                                                                    |