# VerifyTokenRequest

## Example Usage

```typescript
import { VerifyTokenRequest } from '@vercel/client/models/operations';

let value: VerifyTokenRequest = {
  token: '<value>',
  tokenName: 'Your Client App Name',
};
```

## Fields

| Field                      | Type                                                       | Required           | Description                                                                              | Example              |
| -------------------------- | ---------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- | -------------------- |
| `email`                    | _string_                                                   | :heavy_minus_sign: | Email to verify the login.                                                               |                      |
| `token`                    | _string_                                                   | :heavy_check_mark: | The token returned when the login was requested.                                         |                      |
| `tokenName`                | _string_                                                   | :heavy_minus_sign: | The desired name for the token. It will be displayed on the user account details.        | Your Client App Name |
| `ssoUserId`                | _string_                                                   | :heavy_minus_sign: | The SAML Profile ID, when connecting a SAML Profile to a Team member for the first time. |                      |
| `teamName`                 | _string_                                                   | :heavy_minus_sign: | The name of this user's team.                                                            |                      |
| `teamSlug`                 | _string_                                                   | :heavy_minus_sign: | The slug for this user's team.                                                           |                      |
| `teamPlan`                 | [operations.TeamPlan](../../models/operations/teamplan.md) | :heavy_minus_sign: | The plan for this user's team (pro or hobby).                                            |                      |
| `sessionReferrer`          | _string_                                                   | :heavy_minus_sign: | Referrer to the session.                                                                 |                      |
| `landingPage`              | _string_                                                   | :heavy_minus_sign: | The page on which the user started their session.                                        |                      |
| `pageBeforeConversionPage` | _string_                                                   | :heavy_minus_sign: | The page that sent the user to the signup page.                                          |                      |
| `utmSource`                | _string_                                                   | :heavy_minus_sign: | N/A                                                                                      |                      |
| `utmMedium`                | _string_                                                   | :heavy_minus_sign: | N/A                                                                                      |                      |
| `utmCampaign`              | _string_                                                   | :heavy_minus_sign: | N/A                                                                                      |                      |
| `utmTerm`                  | _string_                                                   | :heavy_minus_sign: | N/A                                                                                      |                      |
| `oppId`                    | _string_                                                   | :heavy_minus_sign: | N/A                                                                                      |                      |
