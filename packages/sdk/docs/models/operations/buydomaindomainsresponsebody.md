# BuyDomainDomainsResponseBody

Domain purchase is being processed asynchronously.

## Example Usage

```typescript
import { BuyDomainDomainsResponseBody } from "@vercel/sdk/models/operations";

let value: BuyDomainDomainsResponseBody = {
  domain: {
    uid: "<value>",
    ns: [
      "<value>",
    ],
    verified: false,
    created: 216.88,
    pending: false,
  },
};
```

## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `domain`                                                                 | [operations.BuyDomainDomain](../../models/operations/buydomaindomain.md) | :heavy_check_mark:                                                       | N/A                                                                      |