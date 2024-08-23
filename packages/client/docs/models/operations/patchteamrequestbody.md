# PatchTeamRequestBody

## Example Usage

```typescript
import { PatchTeamRequestBody } from '@vercel/client/models/operations';

let value: PatchTeamRequestBody = {
  description: 'Our mission is to make cloud computing accessible to everyone',
  emailDomain: 'example.com',
  name: 'My Team',
  previewDeploymentSuffix: 'example.dev',
  regenerateInviteCode: true,
  saml: {
    enforced: true,
  },
  slug: 'my-team',
  enablePreviewFeedback: 'on',
  enableProductionFeedback: 'on',
  sensitiveEnvironmentVariablePolicy: 'on',
  remoteCaching: {
    enabled: true,
  },
  hideIpAddresses: false,
};
```

## Fields

| Field                                | Type                                                                 | Required           | Description                                                       | Example                                                       |
| ------------------------------------ | -------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `avatar`                             | _string_                                                             | :heavy_minus_sign: | The hash value of an uploaded image.                              |                                                               |
| `description`                        | _string_                                                             | :heavy_minus_sign: | A short text that describes the team.                             | Our mission is to make cloud computing accessible to everyone |
| `emailDomain`                        | _string_                                                             | :heavy_minus_sign: | N/A                                                               | example.com                                                   |
| `name`                               | _string_                                                             | :heavy_minus_sign: | The name of the team.                                             | My Team                                                       |
| `previewDeploymentSuffix`            | _string_                                                             | :heavy_minus_sign: | Suffix that will be used for all preview deployments.             | example.dev                                                   |
| `regenerateInviteCode`               | _boolean_                                                            | :heavy_minus_sign: | Create a new invite code and replace the current one.             | true                                                          |
| `saml`                               | [operations.Saml](../../models/operations/saml.md)                   | :heavy_minus_sign: | N/A                                                               |                                                               |
| `slug`                               | _string_                                                             | :heavy_minus_sign: | A new slug for the team.                                          | my-team                                                       |
| `enablePreviewFeedback`              | _string_                                                             | :heavy_minus_sign: | Enable preview toolbar: one of on, off or default.                | on                                                            |
| `enableProductionFeedback`           | _string_                                                             | :heavy_minus_sign: | Enable production toolbar: one of on, off or default.             | on                                                            |
| `sensitiveEnvironmentVariablePolicy` | _string_                                                             | :heavy_minus_sign: | Sensitive environment variable policy: one of on, off or default. | on                                                            |
| `remoteCaching`                      | [operations.RemoteCaching](../../models/operations/remotecaching.md) | :heavy_minus_sign: | Whether or not remote caching is enabled for the team             |                                                               |
| `hideIpAddresses`                    | _boolean_                                                            | :heavy_minus_sign: | Display or hide IP addresses in Monitoring queries.               | false                                                         |
