# GetProjectsErl

## Example Usage

```typescript
import { GetProjectsErl } from "@vercel/sdk/models/operations/getprojects.js";

let value: GetProjectsErl = {
  algo: "token_bucket",
  window: 9944.01,
  limit: 4518.22,
  keys: [
    "<value>",
  ],
};
```

## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `algo`                                                                   | [operations.GetProjectsAlgo](../../models/operations/getprojectsalgo.md) | :heavy_check_mark:                                                       | N/A                                                                      |
| `window`                                                                 | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `limit`                                                                  | *number*                                                                 | :heavy_check_mark:                                                       | N/A                                                                      |
| `keys`                                                                   | *string*[]                                                               | :heavy_check_mark:                                                       | N/A                                                                      |