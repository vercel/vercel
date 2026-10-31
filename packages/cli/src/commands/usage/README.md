# `vercel usage` JSON output

`--json` emits a single JSON object on stdout. Costs are accrued before credits and discounts, not final invoice amounts.

The default range uses the monthly usage subscription's period when available, falling back to the account's billing period. Explicit `--since` and `--until` take precedence.

If the API reports costs available in another currency, the command exits with code 1 and a diagnostic on stderr instead of emitting partial totals or JSON. Choose a range within the current billing currency or view usage in the dashboard.

JSON preserves raw costs. Human output uses `<$0.01` or `<0.01 MIUs` for positive costs that would round to zero, with corresponding `>` bounds for negative costs. True zero costs remain `$0.00` or `0 MIUs`.

- `period`: `from` and `to` ISO timestamps; `context`: account or team name.
- `costUnit`: `USD` or `managed_infrastructure_units`, applying to all costs.
- `services[]`: `name`, `product` (stable slug), `quantity`, optional `unit`, `cost`, `included`, and `category` (`usage` or `subscription`). `unit` is a display label, not an enum. Subscription quantities are peak sampled license counts. Zero-usage rows are retained.
- `totals`: `cost`.
- Optional `creditBalance`: current `currency`, `allocated`, `used`, `remaining`, and optional `cadence`; omitted for custom date ranges.
- `--breakdown`: adds `breakdown.period` and `breakdown.data[]` with `periodKey`, `services`, and `totals`.
- `--group-by`: adds `groupBy.dimension` and `groupBy.data[]` with `name`, `services`, and `totals`.

## Migration

These changes apply to aggregate, breakdown, and grouped output:

| Previous field                              | Replacement                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pricingQuantity`, `totals.pricingQuantity` | `cost`, `totals.cost`; the old values were costs, not usage quantities.                  |
| Service or top-level `pricingUnit`          | Top-level `costUnit`, not product `unit`.                                                |
| `billedCost`                                | No direct replacement. `cost` is a gross upper bound, not overage after credit drawdown. |
| `effectiveCost`                             | Removed; no net-cost replacement.                                                        |
| `chargeCount`                               | Removed.                                                                                 |

Product `quantity` and `unit` are new fields, not renames of earlier fields. Use `product`, not the display `name`, to identify products in scripts.
