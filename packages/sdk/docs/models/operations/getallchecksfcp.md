# GetAllChecksFCP

## Example Usage

```typescript
import { GetAllChecksFCP } from "@vercel/sdk/models/operations/getallchecks.js";

let value: GetAllChecksFCP = {
  value: 2961.40,
  source: "web-vitals",
};
```

## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `value`                                                                        | *number*                                                                       | :heavy_check_mark:                                                             | N/A                                                                            |
| `previousValue`                                                                | *number*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            |
| `source`                                                                       | [operations.GetAllChecksSource](../../models/operations/getallcheckssource.md) | :heavy_check_mark:                                                             | N/A                                                                            |