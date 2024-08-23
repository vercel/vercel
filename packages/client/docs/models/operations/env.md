# Env

## Example Usage

```typescript
import { Env } from '@vercel/client/models/operations';

let value: Env = {
  type: 'sensitive',
  key: '<key>',
  value: '<value>',
};
```

## Fields

| Field                  | Type                                                                                           | Required           | Description                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `target`               | _operations.UpdateProjectDataCacheTarget_                                                      | :heavy_minus_sign: | N/A                                                                                      |
| `type`                 | [operations.UpdateProjectDataCacheType](../../models/operations/updateprojectdatacachetype.md) | :heavy_check_mark: | N/A                                                                                      |
| `sunsetSecretId`       | _string_                                                                                       | :heavy_minus_sign: | This is used to identiy variables that have been migrated from type secret to sensitive. |
| `id`                   | _string_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `key`                  | _string_                                                                                       | :heavy_check_mark: | N/A                                                                                      |
| `value`                | _string_                                                                                       | :heavy_check_mark: | N/A                                                                                      |
| `configurationId`      | _string_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `createdAt`            | _number_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `updatedAt`            | _number_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `createdBy`            | _string_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `updatedBy`            | _string_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `gitBranch`            | _string_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `edgeConfigId`         | _string_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `edgeConfigTokenId`    | _string_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `contentHint`          | _operations.ContentHint_                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `internalContentHint`  | [operations.InternalContentHint](../../models/operations/internalcontenthint.md)               | :heavy_minus_sign: | Similar to `contentHints`, but should not be exposed to the user.                        |
| `decrypted`            | _boolean_                                                                                      | :heavy_minus_sign: | Whether `value` and `vsmValue` are decrypted.                                            |
| `comment`              | _string_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
| `customEnvironmentIds` | _string_[]                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `vsmValue`             | _string_                                                                                       | :heavy_minus_sign: | N/A                                                                                      |
