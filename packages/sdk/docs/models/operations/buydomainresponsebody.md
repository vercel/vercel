# BuyDomainResponseBody

Successful response for purchasing a Domain.

## Example Usage

```typescript
import { BuyDomainResponseBody } from "@vercel/sdk/models/operations/buydomain.js";

let value: BuyDomainResponseBody = {
  domain: {
    uid: "<id>",
    ns: [
      "<value>",
    ],
    verified: false,
    created: 7381.52,
    pending: false,
  },
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `domain`                                                                               | [operations.BuyDomainDomainsDomain](../../models/operations/buydomaindomainsdomain.md) | :heavy_check_mark:                                                                     | N/A                                                                                    |