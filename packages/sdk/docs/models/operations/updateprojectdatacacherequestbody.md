# UpdateProjectDataCacheRequestBody

## Example Usage

```typescript
import { UpdateProjectDataCacheRequestBody } from "@vercel/sdk/models/operations";

let value: UpdateProjectDataCacheRequestBody = {
  disabled: true,
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   | Example                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `disabled`                                                    | *boolean*                                                     | :heavy_minus_sign:                                            | Enable or disable data cache for the project - default: false | true                                                          |