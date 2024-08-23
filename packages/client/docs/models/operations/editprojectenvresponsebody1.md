# EditProjectEnvResponseBody1

## Example Usage

```typescript
import { EditProjectEnvResponseBody1 } from '@vercel/client/models/operations';

let value: EditProjectEnvResponseBody1 = {
  type: 'system',
  key: '<key>',
  value: '<value>',
};
```

## Fields

| Field                  | Type                                                                                                                                 | Required           | Description                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| `target`               | _operations.EditProjectEnvResponseBodyTarget_                                                                                        | :heavy_minus_sign: | N/A                                                                                      |
| `type`                 | [operations.EditProjectEnvResponseBodyType](../../models/operations/editprojectenvresponsebodytype.md)                               | :heavy_check_mark: | N/A                                                                                      |
| `sunsetSecretId`       | _string_                                                                                                                             | :heavy_minus_sign: | This is used to identiy variables that have been migrated from type secret to sensitive. |
| `id`                   | _string_                                                                                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `key`                  | _string_                                                                                                                             | :heavy_check_mark: | N/A                                                                                      |
| `value`                | _string_                                                                                                                             | :heavy_check_mark: | N/A                                                                                      |
| `configurationId`      | _string_                                                                                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `createdAt`            | _number_                                                                                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `updatedAt`            | _number_                                                                                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `createdBy`            | _string_                                                                                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `updatedBy`            | _string_                                                                                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `gitBranch`            | _string_                                                                                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `edgeConfigId`         | _string_                                                                                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `edgeConfigTokenId`    | _string_                                                                                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `contentHint`          | _operations.EditProjectEnvResponseBodyContentHint_                                                                                   | :heavy_minus_sign: | N/A                                                                                      |
| `internalContentHint`  | [operations.EditProjectEnvResponseBodyInternalContentHint](../../models/operations/editprojectenvresponsebodyinternalcontenthint.md) | :heavy_minus_sign: | Similar to `contentHints`, but should not be exposed to the user.                        |
| `decrypted`            | _boolean_                                                                                                                            | :heavy_minus_sign: | Whether `value` and `vsmValue` are decrypted.                                            |
| `comment`              | _string_                                                                                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `customEnvironmentIds` | _string_[]                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
