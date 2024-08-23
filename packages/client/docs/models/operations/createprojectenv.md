# CreateProjectEnv

## Example Usage

```typescript
import { CreateProjectEnv } from '@vercel/client/models/operations';

let value: CreateProjectEnv = {
  type: 'system',
  key: '<key>',
  value: '<value>',
};
```

## Fields

| Field                  | Type                                                                                                         | Required           | Description                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| `target`               | _operations.CreateProjectProjectsTarget_                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `type`                 | [operations.CreateProjectProjectsResponseType](../../models/operations/createprojectprojectsresponsetype.md) | :heavy_check_mark: | N/A                                                                                      |
| `sunsetSecretId`       | _string_                                                                                                     | :heavy_minus_sign: | This is used to identiy variables that have been migrated from type secret to sensitive. |
| `id`                   | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `key`                  | _string_                                                                                                     | :heavy_check_mark: | N/A                                                                                      |
| `value`                | _string_                                                                                                     | :heavy_check_mark: | N/A                                                                                      |
| `configurationId`      | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `createdAt`            | _number_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `updatedAt`            | _number_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `createdBy`            | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `updatedBy`            | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `gitBranch`            | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `edgeConfigId`         | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `edgeConfigTokenId`    | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `contentHint`          | _operations.CreateProjectContentHint_                                                                        | :heavy_minus_sign: | N/A                                                                                      |
| `internalContentHint`  | [operations.CreateProjectInternalContentHint](../../models/operations/createprojectinternalcontenthint.md)   | :heavy_minus_sign: | Similar to `contentHints`, but should not be exposed to the user.                        |
| `decrypted`            | _boolean_                                                                                                    | :heavy_minus_sign: | Whether `value` and `vsmValue` are decrypted.                                            |
| `comment`              | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `customEnvironmentIds` | _string_[]                                                                                                   | :heavy_minus_sign: | N/A                                                                                      |
| `vsmValue`             | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
