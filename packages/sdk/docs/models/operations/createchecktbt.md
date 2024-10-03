# CreateCheckTBT

## Example Usage

```typescript
import { CreateCheckTBT } from "@vercel/sdk/models/operations/createcheck.js";

let value: CreateCheckTBT = {
  value: 8379.45,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                                          | Type                                                                                                           | Required                                                                                                       | Description                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `value`                                                                                                        | *number*                                                                                                       | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `previousValue`                                                                                                | *number*                                                                                                       | :heavy_minus_sign:                                                                                             | N/A                                                                                                            |
| `source`                                                                                                       | [operations.CreateCheckChecksResponse200Source](../../models/operations/createcheckchecksresponse200source.md) | :heavy_check_mark:                                                                                             | N/A                                                                                                            |