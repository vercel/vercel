# RemoveProjectEnvResponseBodyEnvsInternalContentHint

Similar to `contentHints`, but should not be exposed to the user.

## Example Usage

```typescript
import { RemoveProjectEnvResponseBodyEnvsInternalContentHint } from "@vercel/sdk/models/operations";

let value: RemoveProjectEnvResponseBodyEnvsInternalContentHint = {
  type: "flags-secret",
  encryptedValue: "<value>",
};
```

## Fields

| Field                                                                                                                                    | Type                                                                                                                                     | Required                                                                                                                                 | Description                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                                                                                                                                   | [operations.RemoveProjectEnvResponseBodyEnvsResponse200Type](../../models/operations/removeprojectenvresponsebodyenvsresponse200type.md) | :heavy_check_mark:                                                                                                                       | N/A                                                                                                                                      |
| `encryptedValue`                                                                                                                         | *string*                                                                                                                                 | :heavy_check_mark:                                                                                                                       | Contains the `value` of the env variable, encrypted with a special key to make decryption possible in the subscriber Lambda.             |