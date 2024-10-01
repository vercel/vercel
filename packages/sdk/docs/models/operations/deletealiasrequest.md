# DeleteAliasRequest

## Example Usage

```typescript
import { DeleteAliasRequest } from "@vercel/sdk/models/operations/deletealias.js";

let value: DeleteAliasRequest = {
  aliasId: "<id>",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `aliasId`                                                | *string*                                                 | :heavy_check_mark:                                       | The ID or alias that will be removed                     |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |