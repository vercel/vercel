# InternalContentHint

Similar to `contentHints`, but should not be exposed to the user.

## Example Usage

```typescript
import { InternalContentHint } from "@vercel/sdk/models/operations";

let value: InternalContentHint = {
  type: "flags-secret",
  encryptedValue: "<value>",
};
```

## Fields

| Field                                                                                                                                                              | Type                                                                                                                                                               | Required                                                                                                                                                           | Description                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                                                                                                                                                             | [operations.UpdateProjectDataCacheProjectsResponse200ApplicationJSONType](../../models/operations/updateprojectdatacacheprojectsresponse200applicationjsontype.md) | :heavy_check_mark:                                                                                                                                                 | N/A                                                                                                                                                                |
| `encryptedValue`                                                                                                                                                   | *string*                                                                                                                                                           | :heavy_check_mark:                                                                                                                                                 | Contains the `value` of the env variable, encrypted with a special key to make decryption possible in the subscriber Lambda.                                       |