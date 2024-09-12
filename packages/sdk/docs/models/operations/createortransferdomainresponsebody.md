# CreateOrTransferDomainResponseBody

## Example Usage

```typescript
import { CreateOrTransferDomainResponseBody } from "@vercel/sdk/models/operations";

let value: CreateOrTransferDomainResponseBody = {
  domain: {
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
    boughtAt: 1613602938882,
    createdAt: 1613602938882,
    expiresAt: 1613602938882,
    id: "EmTbe5CEJyTk2yVAHBUWy4A3sRusca3GCwRjTC1bpeVnt1",
    name: "example.com",
    orderedAt: 1613602938882,
    renew: true,
    serviceType: "zeit.world",
    transferredAt: 1613602938882,
    transferStartedAt: 1613602938882,
    userId: "<value>",
    teamId: "<value>",
  },
};
```

## Fields

| Field                                                                                              | Type                                                                                               | Required                                                                                           | Description                                                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `domain`                                                                                           | [operations.CreateOrTransferDomainDomain](../../models/operations/createortransferdomaindomain.md) | :heavy_check_mark:                                                                                 | N/A                                                                                                |