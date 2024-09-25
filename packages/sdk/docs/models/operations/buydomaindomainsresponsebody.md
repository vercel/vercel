# BuyDomainDomainsResponseBody

Domain purchase is being processed asynchronously.

## Example Usage

```typescript
import { BuyDomainDomainsResponseBody } from "@vercel/sdk/models/operations/buydomain.js";

let value: BuyDomainDomainsResponseBody = {
  domain: {
    uid: "<value>",
    ns: [
      "<value>",
    ],
    verified: false,
    created: 3970.14,
    pending: false,
  },
};
```

## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `domain`                                                                 | [operations.BuyDomainDomain](../../models/operations/buydomaindomain.md) | :heavy_check_mark:                                                       | N/A                                                                      |