# SoftBlock

When the User account has been "soft blocked", this property will contain the date when the restriction was enacted, and the identifier for why.

## Example Usage

```typescript
import { SoftBlock } from "@vercel/sdk/models/components/authuser.js";

let value: SoftBlock = {
  blockedAt: 844.38,
  reason: "SUBSCRIPTION_CANCELED",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `blockedAt`                                                                              | *number*                                                                                 | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `reason`                                                                                 | [components.Reason](../../models/components/reason.md)                                   | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `blockedDueToOverageType`                                                                | [components.BlockedDueToOverageType](../../models/components/blockedduetooveragetype.md) | :heavy_minus_sign:                                                                       | N/A                                                                                      |