# BuyDomainDomainsResponseBody

Domain purchase is being processed asynchronously.

## Example Usage

```typescript
import { BuyDomainDomainsResponseBody } from "@vercel/sdk/models/operations/buydomain.js";

let value: BuyDomainDomainsResponseBody = {
  domain: {
    uid: "<id>",
    ns: [
      "<value>",
    ],
    verified: false,
    created: 4909.66,
    pending: false,
  },
};
```

## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `domain`                                                                 | [operations.BuyDomainDomain](../../models/operations/buydomaindomain.md) | :heavy_check_mark:                                                       | N/A                                                                      |