# PatchTeamRequest

## Example Usage

```typescript
import { PatchTeamRequest } from "@vercel/sdk/models/operations";

let value: PatchTeamRequest = {
  teamId: "<value>",
  requestBody: {
    description:
      "Our mission is to make cloud computing accessible to everyone",
    emailDomain: "example.com",
    name: "My Team",
    previewDeploymentSuffix: "example.dev",
    regenerateInviteCode: true,
    saml: {
      enforced: true,
    },
    slug: "my-team",
    enablePreviewFeedback: "on",
    enableProductionFeedback: "on",
    sensitiveEnvironmentVariablePolicy: "on",
    remoteCaching: {
      enabled: true,
    },
    hideIpAddresses: false,
  },
};
```

## Fields

| Field                                                                              | Type                                                                               | Required                                                                           | Description                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `teamId`                                                                           | *string*                                                                           | :heavy_check_mark:                                                                 | The Team identifier to perform the request on behalf of.                           |
| `slug`                                                                             | *string*                                                                           | :heavy_minus_sign:                                                                 | The Team slug to perform the request on behalf of.                                 |
| `requestBody`                                                                      | [operations.PatchTeamRequestBody](../../models/operations/patchteamrequestbody.md) | :heavy_minus_sign:                                                                 | N/A                                                                                |