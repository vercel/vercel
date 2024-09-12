# Two

## Example Usage

```typescript
import { Two } from "@vercel/sdk/models/operations";

let value: Two = {
  org: "<value>",
  ref: "<value>",
  repo: "<value>",
  type: "github",
};
```

## Fields

| Field                                                                | Type                                                                 | Required                                                             | Description                                                          |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `org`                                                                | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `ref`                                                                | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `repo`                                                               | *string*                                                             | :heavy_check_mark:                                                   | N/A                                                                  |
| `sha`                                                                | *string*                                                             | :heavy_minus_sign:                                                   | N/A                                                                  |
| `type`                                                               | [operations.GitSourceType](../../models/operations/gitsourcetype.md) | :heavy_check_mark:                                                   | N/A                                                                  |