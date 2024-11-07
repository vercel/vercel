# Billing

IMPORTANT: If extending Billing, particularly with optional fields, make sure you also update `sync-orb-subscription-to-owner.ts` to handle the items when the object is recreated.

## Example Usage

```typescript
import { Billing } from "@vercel/sdk/models/operations/createteam.js";

let value: Billing = {};
```

## Fields

| Field       | Type        | Required    | Description |
| ----------- | ----------- | ----------- | ----------- |