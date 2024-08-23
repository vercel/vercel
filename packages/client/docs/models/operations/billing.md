# Billing

IMPORTANT: If extending Billing, particularly with optional fields, make sure you also update `sync-orb-subscription-to-owner.ts` to handle the items when the object is recreated.

## Example Usage

```typescript
import { Billing } from '@vercel/client/models/operations';

let value: Billing = {
  period: {
    start: 3476.98,
    end: 688.52,
  },
  plan: 'pro',
};
```

## Fields

| Field                     | Type                                                                         | Required           | Description |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------ | ----------- |
| `currency`                | [operations.Currency](../../models/operations/currency.md)                   | :heavy_minus_sign: | N/A         |
| `cancelation`             | _number_                                                                     | :heavy_minus_sign: | N/A         |
| `period`                  | [operations.Period](../../models/operations/period.md)                       | :heavy_check_mark: | N/A         |
| `contract`                | [operations.Contract](../../models/operations/contract.md)                   | :heavy_minus_sign: | N/A         |
| `plan`                    | [operations.CreateTeamPlan](../../models/operations/createteamplan.md)       | :heavy_check_mark: | N/A         |
| `planIteration`           | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `platform`                | [operations.Platform](../../models/operations/platform.md)                   | :heavy_minus_sign: | N/A         |
| `orbCustomerId`           | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `syncedAt`                | _number_                                                                     | :heavy_minus_sign: | N/A         |
| `programType`             | [operations.ProgramType](../../models/operations/programtype.md)             | :heavy_minus_sign: | N/A         |
| `trial`                   | [operations.Trial](../../models/operations/trial.md)                         | :heavy_minus_sign: | N/A         |
| `email`                   | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `tax`                     | [operations.Tax](../../models/operations/tax.md)                             | :heavy_minus_sign: | N/A         |
| `language`                | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `address`                 | [operations.Address](../../models/operations/address.md)                     | :heavy_minus_sign: | N/A         |
| `name`                    | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `invoiceItems`            | [operations.InvoiceItems](../../models/operations/invoiceitems.md)           | :heavy_minus_sign: | N/A         |
| `invoiceSettings`         | [operations.InvoiceSettings](../../models/operations/invoicesettings.md)     | :heavy_minus_sign: | N/A         |
| `subscriptions`           | [operations.Subscriptions](../../models/operations/subscriptions.md)[]       | :heavy_minus_sign: | N/A         |
| `controls`                | [operations.Controls](../../models/operations/controls.md)                   | :heavy_minus_sign: | N/A         |
| `purchaseOrder`           | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `status`                  | [operations.CreateTeamStatus](../../models/operations/createteamstatus.md)   | :heavy_minus_sign: | N/A         |
| `pricingExperiment`       | [operations.PricingExperiment](../../models/operations/pricingexperiment.md) | :heavy_minus_sign: | N/A         |
| `orbMigrationScheduledAt` | _number_                                                                     | :heavy_minus_sign: | N/A         |
| `forceOrbMigration`       | _boolean_                                                                    | :heavy_minus_sign: | N/A         |
| `awsMarketplace`          | [operations.AwsMarketplace](../../models/operations/awsmarketplace.md)       | :heavy_minus_sign: | N/A         |
| `reseller`                | _string_                                                                     | :heavy_minus_sign: | N/A         |
