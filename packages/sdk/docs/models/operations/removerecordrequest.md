# RemoveRecordRequest

## Example Usage

```typescript
import { RemoveRecordRequest } from "@vercel/sdk/models/operations";

let value: RemoveRecordRequest = {
  domain: "example.com",
  recordId: "rec_V0fra8eEgQwEpFhYG2vTzC3K",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              | Example                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `domain`                                                 | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      | example.com                                              |
| `recordId`                                               | *string*                                                 | :heavy_check_mark:                                       | N/A                                                      | rec_V0fra8eEgQwEpFhYG2vTzC3K                             |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |                                                          |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |                                                          |