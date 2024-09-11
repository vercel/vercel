# UpdateProjectProtectionBypassRequest

## Example Usage

```typescript
import { UpdateProjectProtectionBypassRequest } from "@vercel/sdk/models/operations";

let value: UpdateProjectProtectionBypassRequest = {
  idOrName: "<value>",
};
```

## Fields

| Field                                                                                                                      | Type                                                                                                                       | Required                                                                                                                   | Description                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `idOrName`                                                                                                                 | *string*                                                                                                                   | :heavy_check_mark:                                                                                                         | The unique project identifier or the project name                                                                          |
| `teamId`                                                                                                                   | *string*                                                                                                                   | :heavy_minus_sign:                                                                                                         | The Team identifier to perform the request on behalf of.                                                                   |
| `slug`                                                                                                                     | *string*                                                                                                                   | :heavy_minus_sign:                                                                                                         | The Team slug to perform the request on behalf of.                                                                         |
| `requestBody`                                                                                                              | [operations.UpdateProjectProtectionBypassRequestBody](../../models/operations/updateprojectprotectionbypassrequestbody.md) | :heavy_minus_sign:                                                                                                         | N/A                                                                                                                        |