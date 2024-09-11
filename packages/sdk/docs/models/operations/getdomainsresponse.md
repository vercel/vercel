# GetDomainsResponse

## Example Usage

```typescript
import { GetDomainsResponse } from "@vercel/sdk/models/operations";

let value: GetDomainsResponse = {
  result: {
    domains: [
      {
        verified: true,
        nameservers: [
          "ns1.nameserver.net",
          "ns2.nameserver.net",
        ],
        intendedNameservers: [
          "ns1.vercel-dns.com",
          "ns2.vercel-dns.com",
        ],
        customNameservers: [
          "ns1.nameserver.net",
          "ns2.nameserver.net",
        ],
        creator: {
          username: "vercel_user",
          email: "demo@example.com",
          id: "ZspSRT4ljIEEmMHgoDwKWDei",
        },
        teamId: "<value>",
        createdAt: 1613602938882,
        boughtAt: 1613602938882,
        expiresAt: 1613602938882,
        id: "EmTbe5CEJyTk2yVAHBUWy4A3sRusca3GCwRjTC1bpeVnt1",
        name: "example.com",
        orderedAt: 1613602938882,
        renew: true,
        serviceType: "zeit.world",
        transferredAt: 1613602938882,
        transferStartedAt: 1613602938882,
        userId: "<value>",
      },
    ],
    pagination: {
      count: 20,
      next: 1540095775951,
      prev: 1540095775951,
    },
  },
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `result`                                                                               | [operations.GetDomainsResponseBody](../../models/operations/getdomainsresponsebody.md) | :heavy_check_mark:                                                                     | N/A                                                                                    |