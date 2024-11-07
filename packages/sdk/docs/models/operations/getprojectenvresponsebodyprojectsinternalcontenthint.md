# GetProjectEnvResponseBodyProjectsInternalContentHint

Similar to `contentHints`, but should not be exposed to the user.

## Example Usage

```typescript
import { GetProjectEnvResponseBodyProjectsInternalContentHint } from "@vercel/sdk/models/operations/getprojectenv.js";

let value: GetProjectEnvResponseBodyProjectsInternalContentHint = {
  type: "flags-secret",
  encryptedValue: "<value>",
};
```

## Fields

| Field                                                                                                                                      | Type                                                                                                                                       | Required                                                                                                                                   | Description                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                                                                                                                                     | [operations.GetProjectEnvResponseBodyProjectsResponse200Type](../../models/operations/getprojectenvresponsebodyprojectsresponse200type.md) | :heavy_check_mark:                                                                                                                         | N/A                                                                                                                                        |
| `encryptedValue`                                                                                                                           | *string*                                                                                                                                   | :heavy_check_mark:                                                                                                                         | Contains the `value` of the env variable, encrypted with a special key to make decryption possible in the subscriber Lambda.               |