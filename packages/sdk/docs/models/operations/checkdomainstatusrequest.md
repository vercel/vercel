# CheckDomainStatusRequest

## Example Usage

```typescript
import { CheckDomainStatusRequest } from "@vercel/sdk/models/operations";

let value: CheckDomainStatusRequest = {
  name: "example.com",
};
```

## Fields

| Field                                                               | Type                                                                | Required                                                            | Description                                                         | Example                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `name`                                                              | *string*                                                            | :heavy_check_mark:                                                  | The name of the domain for which we would like to check the status. | example.com                                                         |
| `teamId`                                                            | *string*                                                            | :heavy_minus_sign:                                                  | The Team identifier to perform the request on behalf of.            |                                                                     |
| `slug`                                                              | *string*                                                            | :heavy_minus_sign:                                                  | The Team slug to perform the request on behalf of.                  |                                                                     |