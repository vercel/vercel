# ResponseBodyScopes

## Example Usage

```typescript
import { ResponseBodyScopes } from "@vercel/sdk/models/operations/getconfigurations.js";

let value: ResponseBodyScopes = {
  added: [
    "read-write:project-env-vars",
  ],
  upgraded: [
    "read:user",
  ],
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `added`                                                                              | [operations.ResponseBodyAdded](../../models/operations/responsebodyadded.md)[]       | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `upgraded`                                                                           | [operations.ResponseBodyUpgraded](../../models/operations/responsebodyupgraded.md)[] | :heavy_check_mark:                                                                   | N/A                                                                                  |