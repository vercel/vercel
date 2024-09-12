# CreateSecretResponseBody

Successful response showing the created secret.

## Example Usage

```typescript
import { CreateSecretResponseBody } from "@vercel/sdk/models/operations";

let value: CreateSecretResponseBody = {
  value: {},
  created: new Date("2021-02-10T13:11:49.180Z"),
  name: "my-api-key",
  teamId: "team_LLHUOMOoDlqOp8wPE4kFo9pE",
  uid: "sec_XCG7t7AIHuO2SBA8667zNUiM",
  userId: "2qDDuGFTWXBLDNnqZfWPDp1A",
  createdAt: 1609492210000,
  projectId: "prj_2WjyKQmM8ZnGcJsPWMrHRHrE",
  decryptable: true,
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   | Example                                                                                       |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `value`                                                                                       | [operations.CreateSecretValue](../../models/operations/createsecretvalue.md)                  | :heavy_check_mark:                                                                            | N/A                                                                                           |                                                                                               |
| `created`                                                                                     | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | The date when the secret was created.                                                         | 2021-02-10T13:11:49.180Z                                                                      |
| `name`                                                                                        | *string*                                                                                      | :heavy_check_mark:                                                                            | The name of the secret.                                                                       | my-api-key                                                                                    |
| `teamId`                                                                                      | *string*                                                                                      | :heavy_minus_sign:                                                                            | The unique identifier of the team the secret was created for.                                 | team_LLHUOMOoDlqOp8wPE4kFo9pE                                                                 |
| `uid`                                                                                         | *string*                                                                                      | :heavy_check_mark:                                                                            | The unique identifier of the secret.                                                          | sec_XCG7t7AIHuO2SBA8667zNUiM                                                                  |
| `userId`                                                                                      | *string*                                                                                      | :heavy_minus_sign:                                                                            | The unique identifier of the user who created the secret.                                     | 2qDDuGFTWXBLDNnqZfWPDp1A                                                                      |
| `createdAt`                                                                                   | *number*                                                                                      | :heavy_minus_sign:                                                                            | Timestamp for when the secret was created.                                                    | 1609492210000                                                                                 |
| `projectId`                                                                                   | *string*                                                                                      | :heavy_minus_sign:                                                                            | The unique identifier of the project which the secret belongs to.                             | prj_2WjyKQmM8ZnGcJsPWMrHRHrE                                                                  |
| `decryptable`                                                                                 | *boolean*                                                                                     | :heavy_minus_sign:                                                                            | Indicates whether the secret value can be decrypted after it has been created.                | true                                                                                          |