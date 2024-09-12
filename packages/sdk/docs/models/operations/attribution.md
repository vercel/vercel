# Attribution

Attribution information for the session or current page

## Example Usage

```typescript
import { Attribution } from "@vercel/sdk/models/operations";

let value: Attribution = {};
```

## Fields

| Field                                            | Type                                             | Required                                         | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| `sessionReferrer`                                | *string*                                         | :heavy_minus_sign:                               | Session referrer                                 |
| `landingPage`                                    | *string*                                         | :heavy_minus_sign:                               | Session landing page                             |
| `pageBeforeConversionPage`                       | *string*                                         | :heavy_minus_sign:                               | Referrer to the signup page                      |
| `utm`                                            | [operations.Utm](../../models/operations/utm.md) | :heavy_minus_sign:                               | N/A                                              |