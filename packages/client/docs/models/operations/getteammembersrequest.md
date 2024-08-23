# GetTeamMembersRequest

## Example Usage

```typescript
import { GetTeamMembersRequest } from '@vercel/client/models/operations';

let value: GetTeamMembersRequest = {
  teamId: '<value>',
  limit: 20,
  since: 1540095775951,
  until: 1540095775951,
  role: 'OWNER',
};
```

## Fields

| Field                         | Type                                                                   | Required           | Description                                                                   | Example       |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- | ------------- |
| `teamId`                      | _string_                                                               | :heavy_check_mark: | The Team identifier to perform the request on behalf of.                      |               |
| `limit`                       | _number_                                                               | :heavy_minus_sign: | Limit how many teams should be returned                                       | 20            |
| `since`                       | _number_                                                               | :heavy_minus_sign: | Timestamp in milliseconds to only include members added since then.           | 1540095775951 |
| `until`                       | _number_                                                               | :heavy_minus_sign: | Timestamp in milliseconds to only include members added until then.           | 1540095775951 |
| `search`                      | _string_                                                               | :heavy_minus_sign: | Search team members by their name, username, and email.                       |               |
| `role`                        | [operations.QueryParamRole](../../models/operations/queryparamrole.md) | :heavy_minus_sign: | Only return members with the specified team role.                             | OWNER         |
| `excludeProject`              | _string_                                                               | :heavy_minus_sign: | Exclude members who belong to the specified project.                          |               |
| `eligibleMembersForProjectId` | _string_                                                               | :heavy_minus_sign: | Include team members who are eligible to be members of the specified project. |               |
