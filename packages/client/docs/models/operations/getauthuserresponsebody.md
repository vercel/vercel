# GetAuthUserResponseBody

Successful response.

## Example Usage

```typescript
import { GetAuthUserResponseBody } from '@vercel/client/models/operations';

let value: GetAuthUserResponseBody = {
  user: {
    createdAt: 1630748523395,
    softBlock: {
      blockedAt: 3359.77,
      reason: 'UNPAID_INVOICE',
    },
    billing: {
      period: {
        start: 7277.71,
        end: 7945.07,
      },
      plan: 'hobby',
    },
    resourceConfig: {},
    stagingPrefix: '<value>',
    hasTrialAvailable: false,
    id: 'AEIIDYVk59zbFF2Sxfyxxmua',
    email: 'me@example.com',
    name: 'John Doe',
    username: 'jdoe',
    avatar: '22cb30c85ff45ac4c72de8981500006b28114aa1',
    defaultTeamId: '<value>',
    version: 'northstar',
  },
};
```

## Fields

| Field  | Type              | Required           | Description |
| ------ | ----------------- | ------------------ | ----------- |
| `user` | _operations.User_ | :heavy_check_mark: | N/A         |
