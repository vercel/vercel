# VerifyTokenResponseBody

The verification was successful.

## Example Usage

```typescript
import { VerifyTokenResponseBody } from "@vercel/sdk/models/operations";

let value: VerifyTokenResponseBody = {
  token: "1ioXyz9Ue4xdCYGROet1dlKd",
  email: "amy@example.com",
  teamId: "team_LLHUOMOoDlqOp8wPE4kFo9pE",
};
```

## Fields

| Field                                                                                                           | Type                                                                                                            | Required                                                                                                        | Description                                                                                                     | Example                                                                                                         |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `token`                                                                                                         | *string*                                                                                                        | :heavy_check_mark:                                                                                              | The user authentication token that can be used to perform API requests.                                         | 1ioXyz9Ue4xdCYGROet1dlKd                                                                                        |
| `email`                                                                                                         | *string*                                                                                                        | :heavy_check_mark:                                                                                              | Email address of the authenticated user.                                                                        | amy@example.com                                                                                                 |
| `teamId`                                                                                                        | *string*                                                                                                        | :heavy_minus_sign:                                                                                              | When completing SAML Single Sign-On authentication, this will be the ID of the Team that was authenticated for. | team_LLHUOMOoDlqOp8wPE4kFo9pE                                                                                   |