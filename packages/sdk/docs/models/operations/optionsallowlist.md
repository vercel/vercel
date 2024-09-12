# OptionsAllowlist

Specify a list of paths that should not be protected by Deployment Protection to enable Cors preflight requests

## Example Usage

```typescript
import { OptionsAllowlist } from "@vercel/sdk/models/operations";

let value: OptionsAllowlist = {
  paths: [
    {
      value: "<value>",
    },
  ],
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `paths`                                                | [operations.Paths](../../models/operations/paths.md)[] | :heavy_check_mark:                                     | N/A                                                    |