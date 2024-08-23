# GetProjectEnvResponseBody1

## Example Usage

```typescript
import { GetProjectEnvResponseBody1 } from '@vercel/client/models/operations';

let value: GetProjectEnvResponseBody1 = {
  decrypted: false,
  type: 'plain',
  key: '<key>',
};
```

## Fields

| Field                  | Type                                                                                                                               | Required           | Description                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `decrypted`            | _boolean_                                                                                                                          | :heavy_check_mark: | N/A                                                                                      |
| `target`               | _operations.GetProjectEnvResponseBodyTarget_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `type`                 | [operations.GetProjectEnvResponseBodyType](../../models/operations/getprojectenvresponsebodytype.md)                               | :heavy_check_mark: | N/A                                                                                      |
| `sunsetSecretId`       | _string_                                                                                                                           | :heavy_minus_sign: | This is used to identiy variables that have been migrated from type secret to sensitive. |
| `id`                   | _string_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
| `key`                  | _string_                                                                                                                           | :heavy_check_mark: | N/A                                                                                      |
| `configurationId`      | _string_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
| `createdAt`            | _number_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
| `updatedAt`            | _number_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
| `createdBy`            | _string_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
| `updatedBy`            | _string_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
| `gitBranch`            | _string_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
| `edgeConfigId`         | _string_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
| `edgeConfigTokenId`    | _string_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
| `contentHint`          | _operations.GetProjectEnvResponseBodyContentHint_                                                                                  | :heavy_minus_sign: | N/A                                                                                      |
| `internalContentHint`  | [operations.GetProjectEnvResponseBodyInternalContentHint](../../models/operations/getprojectenvresponsebodyinternalcontenthint.md) | :heavy_minus_sign: | Similar to `contentHints`, but should not be exposed to the user.                        |
| `comment`              | _string_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
| `customEnvironmentIds` | _string_[]                                                                                                                         | :heavy_minus_sign: | N/A                                                                                      |
| `vsmValue`             | _string_                                                                                                                           | :heavy_minus_sign: | N/A                                                                                      |
