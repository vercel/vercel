# Billing

An object containing billing infomation associated with the User account.

## Example Usage

```typescript
import { Billing } from '@vercel/client/models/components';

let value: Billing = {
  period: {
    start: 3929.67,
    end: 7008.56,
  },
  plan: 'hobby',
};
```

## Fields

| Field                     | Type                                                                         | Required           | Description |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------ | ----------- |
| `currency`                | [components.Currency](../../models/components/currency.md)                   | :heavy_minus_sign: | N/A         |
| `cancelation`             | _number_                                                                     | :heavy_minus_sign: | N/A         |
| `period`                  | [components.Period](../../models/components/period.md)                       | :heavy_check_mark: | N/A         |
| `contract`                | [components.Contract](../../models/components/contract.md)                   | :heavy_minus_sign: | N/A         |
| `plan`                    | [components.Plan](../../models/components/plan.md)                           | :heavy_check_mark: | N/A         |
| `planIteration`           | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `platform`                | [components.Platform](../../models/components/platform.md)                   | :heavy_minus_sign: | N/A         |
| `orbCustomerId`           | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `syncedAt`                | _number_                                                                     | :heavy_minus_sign: | N/A         |
| `programType`             | [components.ProgramType](../../models/components/programtype.md)             | :heavy_minus_sign: | N/A         |
| `trial`                   | [components.Trial](../../models/components/trial.md)                         | :heavy_minus_sign: | N/A         |
| `email`                   | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `tax`                     | [components.Tax](../../models/components/tax.md)                             | :heavy_minus_sign: | N/A         |
| `language`                | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `address`                 | [components.Address](../../models/components/address.md)                     | :heavy_minus_sign: | N/A         |
| `name`                    | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `invoiceItems`            | [components.InvoiceItems](../../models/components/invoiceitems.md)           | :heavy_minus_sign: | N/A         |
| `invoiceSettings`         | [components.InvoiceSettings](../../models/components/invoicesettings.md)     | :heavy_minus_sign: | N/A         |
| `subscriptions`           | [components.Subscriptions](../../models/components/subscriptions.md)[]       | :heavy_minus_sign: | N/A         |
| `controls`                | [components.Controls](../../models/components/controls.md)                   | :heavy_minus_sign: | N/A         |
| `purchaseOrder`           | _string_                                                                     | :heavy_minus_sign: | N/A         |
| `status`                  | [components.Status](../../models/components/status.md)                       | :heavy_minus_sign: | N/A         |
| `pricingExperiment`       | [components.PricingExperiment](../../models/components/pricingexperiment.md) | :heavy_minus_sign: | N/A         |
| `orbMigrationScheduledAt` | _number_                                                                     | :heavy_minus_sign: | N/A         |
| `forceOrbMigration`       | _boolean_                                                                    | :heavy_minus_sign: | N/A         |
| `awsMarketplace`          | [components.AwsMarketplace](../../models/components/awsmarketplace.md)       | :heavy_minus_sign: | N/A         |
| `reseller`                | _string_                                                                     | :heavy_minus_sign: | N/A         |
