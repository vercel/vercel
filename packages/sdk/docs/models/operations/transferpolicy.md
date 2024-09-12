# TransferPolicy

The domain's transfer policy (depends on TLD requirements). `charge-and-renew`: transfer will charge for renewal and will renew the existing domain's registration. `no-charge-no-change`: transfer will have no change to registration period and does not require charge. `no-change`: transfer charge is required, but no change in registration period. `new-term`: transfer charge is required and a new registry term is set based on the transfer date. `not-supported`: transfers are not supported for this domain or TLD. `null`: This TLD is not supported by Vercel's Registrar.

## Example Usage

```typescript
import { TransferPolicy } from "@vercel/sdk/models/operations";

let value: TransferPolicy = "no-change";
```

## Values

```typescript
"charge-and-renew" | "no-charge-no-change" | "no-change" | "new-term" | "not-supported"
```