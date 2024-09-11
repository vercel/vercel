# CreateWebhookRequestBody

## Example Usage

```typescript
import { CreateWebhookRequestBody } from "@vercel/sdk/models/operations";

let value: CreateWebhookRequestBody = {
  url: "https://oval-taxi.info",
  events: [
    "deployment.canceled",
  ],
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `url`                                                    | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      |
| `events`                                                 | [operations.Events](../../models/operations/events.md)[] | :heavy_check_mark:                                       | N/A                                                      |
| `projectIds`                                             | *string*[]                                               | :heavy_minus_sign:                                       | N/A                                                      |