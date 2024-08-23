# FilterProjectEnvsResponseBody1

## Example Usage

```typescript
import { FilterProjectEnvsResponseBody1 } from '@vercel/client/models/operations';

let value: FilterProjectEnvsResponseBody1 = {};
```

## Fields

| Field                  | Type                                                                                                         | Required           | Description                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| `target`               | _operations.FilterProjectEnvsResponseBodyTarget_                                                             | :heavy_minus_sign: | N/A                                                                                      |
| `type`                 | [operations.FilterProjectEnvsResponseBodyType](../../models/operations/filterprojectenvsresponsebodytype.md) | :heavy_minus_sign: | N/A                                                                                      |
| `sunsetSecretId`       | _string_                                                                                                     | :heavy_minus_sign: | This is used to identiy variables that have been migrated from type secret to sensitive. |
| `id`                   | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `key`                  | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `value`                | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `configurationId`      | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `createdAt`            | _number_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `updatedAt`            | _number_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `createdBy`            | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `updatedBy`            | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `gitBranch`            | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `edgeConfigId`         | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `edgeConfigTokenId`    | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `contentHint`          | _operations.ResponseBodyContentHint_                                                                         | :heavy_minus_sign: | N/A                                                                                      |
| `internalContentHint`  | [operations.ResponseBodyInternalContentHint](../../models/operations/responsebodyinternalcontenthint.md)     | :heavy_minus_sign: | Similar to `contentHints`, but should not be exposed to the user.                        |
| `decrypted`            | _boolean_                                                                                                    | :heavy_minus_sign: | Whether `value` and `vsmValue` are decrypted.                                            |
| `comment`              | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `customEnvironmentIds` | _string_[]                                                                                                   | :heavy_minus_sign: | N/A                                                                                      |
| `vsmValue`             | _string_                                                                                                     | :heavy_minus_sign: | N/A                                                                                      |
| `system`               | _boolean_                                                                                                    | :heavy_minus_sign: | N/A                                                                                      |
