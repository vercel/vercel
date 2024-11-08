# GetProjectsInternalContentHint

Similar to `contentHints`, but should not be exposed to the user.

## Example Usage

```typescript
import { GetProjectsInternalContentHint } from "@vercel/sdk/models/operations/getprojects.js";

let value: GetProjectsInternalContentHint = {
  type: "flags-secret",
  encryptedValue: "<value>",
};
```

## Fields

| Field                                                                                                                                                                                | Type                                                                                                                                                                                 | Required                                                                                                                                                                             | Description                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                                                                                                                                                                               | [operations.GetProjectsProjectsResponse200ApplicationJSONResponseBodyProjectsType](../../models/operations/getprojectsprojectsresponse200applicationjsonresponsebodyprojectstype.md) | :heavy_check_mark:                                                                                                                                                                   | N/A                                                                                                                                                                                  |
| `encryptedValue`                                                                                                                                                                     | *string*                                                                                                                                                                             | :heavy_check_mark:                                                                                                                                                                   | Contains the `value` of the env variable, encrypted with a special key to make decryption possible in the subscriber Lambda.                                                         |