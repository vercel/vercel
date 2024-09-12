# CreateProjectInternalContentHint

Similar to `contentHints`, but should not be exposed to the user.

## Example Usage

```typescript
import { CreateProjectInternalContentHint } from "@vercel/sdk/models/operations";

let value: CreateProjectInternalContentHint = {
  type: "flags-secret",
  encryptedValue: "<value>",
};
```

## Fields

| Field                                                                                                                                                                          | Type                                                                                                                                                                           | Required                                                                                                                                                                       | Description                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                                                                                                                                                                         | [operations.CreateProjectProjectsResponse200ApplicationJSONResponseBodyEnvType](../../models/operations/createprojectprojectsresponse200applicationjsonresponsebodyenvtype.md) | :heavy_check_mark:                                                                                                                                                             | N/A                                                                                                                                                                            |
| `encryptedValue`                                                                                                                                                               | *string*                                                                                                                                                                       | :heavy_check_mark:                                                                                                                                                             | Contains the `value` of the env variable, encrypted with a special key to make decryption possible in the subscriber Lambda.                                                   |