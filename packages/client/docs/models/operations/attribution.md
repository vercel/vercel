# Attribution

Attribution information for the session or current page

## Example Usage

```typescript
import { Attribution } from '@vercel/client/models/operations';

let value: Attribution = {};
```

## Fields

| Field                      | Type                                             | Required           | Description                 |
| -------------------------- | ------------------------------------------------ | ------------------ | --------------------------- |
| `sessionReferrer`          | _string_                                         | :heavy_minus_sign: | Session referrer            |
| `landingPage`              | _string_                                         | :heavy_minus_sign: | Session landing page        |
| `pageBeforeConversionPage` | _string_                                         | :heavy_minus_sign: | Referrer to the signup page |
| `utm`                      | [operations.Utm](../../models/operations/utm.md) | :heavy_minus_sign: | N/A                         |
