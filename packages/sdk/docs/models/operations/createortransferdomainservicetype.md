# CreateOrTransferDomainServiceType

The type of service the domain is handled by. `external` if the DNS is externally handled, `zeit.world` if handled with Vercel, or `na` if the service is not available.

## Example Usage

```typescript
import { CreateOrTransferDomainServiceType } from "@vercel/sdk/models/operations";

let value: CreateOrTransferDomainServiceType = "zeit.world";
```

## Values

```typescript
"zeit.world" | "external" | "na"
```