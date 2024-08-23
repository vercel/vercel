# JoinTeamRequest

## Example Usage

```typescript
import { JoinTeamRequest } from '@vercel/client/models/operations';

let value: JoinTeamRequest = {
  teamId: '<value>',
  requestBody: {
    inviteCode: 'fisdh38aejkeivn34nslfore9vjtn4ls',
  },
};
```

## Fields

| Field         | Type                                                                             | Required           | Description |
| ------------- | -------------------------------------------------------------------------------- | ------------------ | ----------- |
| `teamId`      | _string_                                                                         | :heavy_check_mark: | N/A         |
| `requestBody` | [operations.JoinTeamRequestBody](../../models/operations/jointeamrequestbody.md) | :heavy_minus_sign: | N/A         |
