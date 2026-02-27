# Billing

## Checking Balance

```bash
vercel integration balance <slug>                      # show balance and thresholds
vercel integration balance <slug> --format=json        # as JSON
```

## Setting Spend Thresholds

```bash
vercel ir create-threshold <resource> <minimum> <spend> <limit>
vercel ir create-threshold <resource> <minimum> <spend> <limit> --yes  # skip confirmation
```

- **minimum** — balance floor; when balance drops below this, auto-replenish is triggered
- **spend** — the replenishment amount added when balance hits minimum
- **limit** — hard spending cap

Works for both resource-level and installation-level thresholds (the CLI detects which type the integration uses).
