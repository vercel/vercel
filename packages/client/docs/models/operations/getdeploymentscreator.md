# GetDeploymentsCreator

Metadata information of the user who created the deployment.

## Example Usage

```typescript
import { GetDeploymentsCreator } from '@vercel/client/models/operations';

let value: GetDeploymentsCreator = {
  uid: 'eLrCnEgbKhsHyfbiNR7E8496',
  email: 'example@example.com',
  username: 'johndoe',
  githubLogin: 'johndoe',
  gitlabLogin: 'johndoe',
};
```

## Fields

| Field         | Type     | Required           | Description                        | Example                  |
| ------------- | -------- | ------------------ | ---------------------------------- | ------------------------ |
| `uid`         | _string_ | :heavy_check_mark: | The unique identifier of the user. | eLrCnEgbKhsHyfbiNR7E8496 |
| `email`       | _string_ | :heavy_minus_sign: | The email address of the user.     | example@example.com      |
| `username`    | _string_ | :heavy_minus_sign: | The username of the user.          | johndoe                  |
| `githubLogin` | _string_ | :heavy_minus_sign: | The GitHub login of the user.      | johndoe                  |
| `gitlabLogin` | _string_ | :heavy_minus_sign: | The GitLab login of the user.      | johndoe                  |
