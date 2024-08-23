# Secrets

Data representing a secret.

## Example Usage

```typescript
import { Secrets } from '@vercel/client/models/operations';

let value: Secrets = {
  created: new Date('2021-02-10T13:11:49.180Z'),
  name: 'my-api-key',
  teamId: 'team_LLHUOMOoDlqOp8wPE4kFo9pE',
  uid: 'sec_XCG7t7AIHuO2SBA8667zNUiM',
  userId: '2qDDuGFTWXBLDNnqZfWPDp1A',
  createdAt: 1609492210000,
  projectId: 'prj_2WjyKQmM8ZnGcJsPWMrHRHrE',
  decryptable: true,
};
```

## Fields

| Field         | Type                                                                                          | Required           | Description                                                                    | Example                       |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------ | ----------------------------- |
| `created`     | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | The date when the secret was created.                                          | 2021-02-10T13:11:49.180Z      |
| `name`        | _string_                                                                                      | :heavy_check_mark: | The name of the secret.                                                        | my-api-key                    |
| `teamId`      | _string_                                                                                      | :heavy_minus_sign: | The unique identifier of the team the secret was created for.                  | team_LLHUOMOoDlqOp8wPE4kFo9pE |
| `uid`         | _string_                                                                                      | :heavy_check_mark: | The unique identifier of the secret.                                           | sec_XCG7t7AIHuO2SBA8667zNUiM  |
| `userId`      | _string_                                                                                      | :heavy_minus_sign: | The unique identifier of the user who created the secret.                      | 2qDDuGFTWXBLDNnqZfWPDp1A      |
| `value`       | _string_                                                                                      | :heavy_minus_sign: | The value of the secret.                                                       |                               |
| `createdAt`   | _number_                                                                                      | :heavy_minus_sign: | Timestamp for when the secret was created.                                     | 1609492210000                 |
| `projectId`   | _string_                                                                                      | :heavy_minus_sign: | The unique identifier of the project which the secret belongs to.              | prj_2WjyKQmM8ZnGcJsPWMrHRHrE  |
| `decryptable` | _boolean_                                                                                     | :heavy_minus_sign: | Indicates whether the secret value can be decrypted after it has been created. | true                          |
