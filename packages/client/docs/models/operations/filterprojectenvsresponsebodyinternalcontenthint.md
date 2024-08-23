# FilterProjectEnvsResponseBodyInternalContentHint

Similar to `contentHints`, but should not be exposed to the user.

## Example Usage

```typescript
import { FilterProjectEnvsResponseBodyInternalContentHint } from '@vercel/client/models/operations';

let value: FilterProjectEnvsResponseBodyInternalContentHint = {
  type: 'flags-secret',
  encryptedValue: '<value>',
};
```

## Fields

| Field            | Type                                                                                                                                                                     | Required           | Description                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `type`           | [operations.FilterProjectEnvsResponseBodyEnvsResponse200ApplicationJSONType](../../models/operations/filterprojectenvsresponsebodyenvsresponse200applicationjsontype.md) | :heavy_check_mark: | N/A                                                                                                                          |
| `encryptedValue` | _string_                                                                                                                                                                 | :heavy_check_mark: | Contains the `value` of the env variable, encrypted with a special key to make decryption possible in the subscriber Lambda. |
