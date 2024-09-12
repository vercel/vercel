# VirtualExperienceScore

## Example Usage

```typescript
import { VirtualExperienceScore } from "@vercel/sdk/models/operations";

let value: VirtualExperienceScore = {
  value: 30,
  previousValue: 35,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                                                                    | Type                                                                                                                                     | Required                                                                                                                                 | Description                                                                                                                              | Example                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `value`                                                                                                                                  | *number*                                                                                                                                 | :heavy_check_mark:                                                                                                                       | The calculated Virtual Experience Score value, between 0 and 100                                                                         | 30                                                                                                                                       |
| `previousValue`                                                                                                                          | *number*                                                                                                                                 | :heavy_minus_sign:                                                                                                                       | A previous Virtual Experience Score value to display a delta, between 0 and 100                                                          | 35                                                                                                                                       |
| `source`                                                                                                                                 | [operations.UpdateCheckChecksRequestRequestBodyOutputSource](../../models/operations/updatecheckchecksrequestrequestbodyoutputsource.md) | :heavy_check_mark:                                                                                                                       | N/A                                                                                                                                      |                                                                                                                                          |