# CreateTeamAnalytics

Will be used to create an invoice item. The price must be in cents: 2000 for $20.

## Example Usage

```typescript
import { CreateTeamAnalytics } from "@vercel/sdk/models/operations";

let value: CreateTeamAnalytics = {
  price: 7104.56,
  quantity: 8852.08,
  hidden: false,
};
```

## Fields

| Field                                                                                                 | Type                                                                                                  | Required                                                                                              | Description                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `tier`                                                                                                | *number*                                                                                              | :heavy_minus_sign:                                                                                    | N/A                                                                                                   |
| `price`                                                                                               | *number*                                                                                              | :heavy_check_mark:                                                                                    | N/A                                                                                                   |
| `quantity`                                                                                            | *number*                                                                                              | :heavy_check_mark:                                                                                    | N/A                                                                                                   |
| `highestQuantity`                                                                                     | *number*                                                                                              | :heavy_minus_sign:                                                                                    | The highest quantity in the current period. Used to render the correct enable/disable UI for add-ons. |
| `name`                                                                                                | *string*                                                                                              | :heavy_minus_sign:                                                                                    | N/A                                                                                                   |
| `hidden`                                                                                              | *boolean*                                                                                             | :heavy_check_mark:                                                                                    | N/A                                                                                                   |
| `createdAt`                                                                                           | *number*                                                                                              | :heavy_minus_sign:                                                                                    | N/A                                                                                                   |
| `disabledAt`                                                                                          | *number*                                                                                              | :heavy_minus_sign:                                                                                    | N/A                                                                                                   |
| `frequency`                                                                                           | [operations.CreateTeamTeamsFrequency](../../models/operations/createteamteamsfrequency.md)            | :heavy_minus_sign:                                                                                    | N/A                                                                                                   |
| `maxQuantity`                                                                                         | *number*                                                                                              | :heavy_minus_sign:                                                                                    | N/A                                                                                                   |