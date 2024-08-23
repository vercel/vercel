# CreateSecretRequestBody

## Example Usage

```typescript
import { CreateSecretRequestBody } from '@vercel/client/models/operations';

let value: CreateSecretRequestBody = {
  name: 'my-api-key',
  value: 'some secret value',
  decryptable: true,
};
```

## Fields

| Field           | Type      | Required           | Description                                                                                                                                                       | Example                      |
| --------------- | --------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `name`          | _string_  | :heavy_check_mark: | The name of the secret (max 100 characters).                                                                                                                      | my-api-key                   |
| `value`         | _string_  | :heavy_check_mark: | The value of the new secret.                                                                                                                                      | some secret value            |
| `decryptable`   | _boolean_ | :heavy_minus_sign: | Whether the secret value can be decrypted after it has been created.                                                                                              | true                         |
| ~~`projectId`~~ | _string_  | :heavy_minus_sign: | : warning: ** DEPRECATED **: This will be removed in a future release, please migrate away from it as soon as possible.<br/><br/>Associate a secret to a project. | prj_2WjyKQmM8ZnGcJsPWMrHRHrE |
