# UpdateCheckTBT

## Example Usage

```typescript
import { UpdateCheckTBT } from "@vercel/sdk/models/operations";

let value: UpdateCheckTBT = {
  value: 2088.76,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                                                                                                | Type                                                                                                                                                                 | Required                                                                                                                                                             | Description                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`                                                                                                                                                              | *number*                                                                                                                                                             | :heavy_check_mark:                                                                                                                                                   | N/A                                                                                                                                                                  |
| `previousValue`                                                                                                                                                      | *number*                                                                                                                                                             | :heavy_minus_sign:                                                                                                                                                   | N/A                                                                                                                                                                  |
| `source`                                                                                                                                                             | [operations.UpdateCheckChecksResponse200ApplicationJSONResponseBodySource](../../models/operations/updatecheckchecksresponse200applicationjsonresponsebodysource.md) | :heavy_check_mark:                                                                                                                                                   | N/A                                                                                                                                                                  |