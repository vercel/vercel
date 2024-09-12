# Billing

An object containing billing infomation associated with the User account.

## Example Usage

```typescript
import { Billing } from "@vercel/sdk/models/components";

let value: Billing = {
  period: {
    start: 3542.25,
    end: 7868.6,
  },
  plan: "pro",
};
```

## Fields

| Field                                                                        | Type                                                                         | Required                                                                     | Description                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `currency`                                                                   | [components.Currency](../../models/components/currency.md)                   | :heavy_minus_sign:                                                           | N/A                                                                          |
| `cancelation`                                                                | *number*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `period`                                                                     | [components.Period](../../models/components/period.md)                       | :heavy_check_mark:                                                           | N/A                                                                          |
| `contract`                                                                   | [components.Contract](../../models/components/contract.md)                   | :heavy_minus_sign:                                                           | N/A                                                                          |
| `plan`                                                                       | [components.Plan](../../models/components/plan.md)                           | :heavy_check_mark:                                                           | N/A                                                                          |
| `planIteration`                                                              | *string*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `platform`                                                                   | [components.Platform](../../models/components/platform.md)                   | :heavy_minus_sign:                                                           | N/A                                                                          |
| `orbCustomerId`                                                              | *string*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `syncedAt`                                                                   | *number*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `programType`                                                                | [components.ProgramType](../../models/components/programtype.md)             | :heavy_minus_sign:                                                           | N/A                                                                          |
| `trial`                                                                      | [components.Trial](../../models/components/trial.md)                         | :heavy_minus_sign:                                                           | N/A                                                                          |
| `email`                                                                      | *string*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `tax`                                                                        | [components.Tax](../../models/components/tax.md)                             | :heavy_minus_sign:                                                           | N/A                                                                          |
| `language`                                                                   | *string*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `address`                                                                    | [components.Address](../../models/components/address.md)                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `name`                                                                       | *string*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `invoiceItems`                                                               | [components.InvoiceItems](../../models/components/invoiceitems.md)           | :heavy_minus_sign:                                                           | N/A                                                                          |
| `invoiceSettings`                                                            | [components.InvoiceSettings](../../models/components/invoicesettings.md)     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `subscriptions`                                                              | [components.Subscriptions](../../models/components/subscriptions.md)[]       | :heavy_minus_sign:                                                           | N/A                                                                          |
| `controls`                                                                   | [components.Controls](../../models/components/controls.md)                   | :heavy_minus_sign:                                                           | N/A                                                                          |
| `purchaseOrder`                                                              | *string*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `status`                                                                     | [components.Status](../../models/components/status.md)                       | :heavy_minus_sign:                                                           | N/A                                                                          |
| `pricingExperiment`                                                          | [components.PricingExperiment](../../models/components/pricingexperiment.md) | :heavy_minus_sign:                                                           | N/A                                                                          |
| `orbMigrationScheduledAt`                                                    | *number*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `forceOrbMigration`                                                          | *boolean*                                                                    | :heavy_minus_sign:                                                           | N/A                                                                          |
| `awsMarketplace`                                                             | [components.AwsMarketplace](../../models/components/awsmarketplace.md)       | :heavy_minus_sign:                                                           | N/A                                                                          |
| `reseller`                                                                   | *string*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |