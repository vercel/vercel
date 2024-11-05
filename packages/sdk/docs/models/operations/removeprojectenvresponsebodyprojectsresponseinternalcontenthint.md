# RemoveProjectEnvResponseBodyProjectsResponseInternalContentHint

Similar to `contentHints`, but should not be exposed to the user.

## Example Usage

```typescript
import { RemoveProjectEnvResponseBodyProjectsResponseInternalContentHint } from "@vercel/sdk/models/operations/removeprojectenv.js";

let value: RemoveProjectEnvResponseBodyProjectsResponseInternalContentHint = {
  type: "flags-secret",
  encryptedValue: "<value>",
};
```

## Fields

| Field                                                                                                                                                                            | Type                                                                                                                                                                             | Required                                                                                                                                                                         | Description                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                                                                                                                                                                           | [operations.RemoveProjectEnvResponseBodyProjectsResponse200ApplicationJson3Type](../../models/operations/removeprojectenvresponsebodyprojectsresponse200applicationjson3type.md) | :heavy_check_mark:                                                                                                                                                               | N/A                                                                                                                                                                              |
| `encryptedValue`                                                                                                                                                                 | *string*                                                                                                                                                                         | :heavy_check_mark:                                                                                                                                                               | Contains the `value` of the env variable, encrypted with a special key to make decryption possible in the subscriber Lambda.                                                     |