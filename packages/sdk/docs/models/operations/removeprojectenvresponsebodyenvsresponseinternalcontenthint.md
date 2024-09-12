# RemoveProjectEnvResponseBodyEnvsResponseInternalContentHint

Similar to `contentHints`, but should not be exposed to the user.

## Example Usage

```typescript
import { RemoveProjectEnvResponseBodyEnvsResponseInternalContentHint } from "@vercel/sdk/models/operations";

let value: RemoveProjectEnvResponseBodyEnvsResponseInternalContentHint = {
  type: "flags-secret",
  encryptedValue: "<value>",
};
```

## Fields

| Field                                                                                                                                                                    | Type                                                                                                                                                                     | Required                                                                                                                                                                 | Description                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                                                                                                                                                                   | [operations.RemoveProjectEnvResponseBodyEnvsResponse200ApplicationJson3Type](../../models/operations/removeprojectenvresponsebodyenvsresponse200applicationjson3type.md) | :heavy_check_mark:                                                                                                                                                       | N/A                                                                                                                                                                      |
| `encryptedValue`                                                                                                                                                         | *string*                                                                                                                                                                 | :heavy_check_mark:                                                                                                                                                       | Contains the `value` of the env variable, encrypted with a special key to make decryption possible in the subscriber Lambda.                                             |