# RemoveProjectMemberRequest

## Example Usage

```typescript
import { RemoveProjectMemberRequest } from '@vercel/client/models/operations';

let value: RemoveProjectMemberRequest = {
  idOrName: 'prj_pavWOn1iLObbXLRiwVvzmPrTWyTf',
  uid: 'ndlgr43fadlPyCtREAqxxdyFK',
};
```

## Fields

| Field      | Type     | Required           | Description                                              | Example                          |
| ---------- | -------- | ------------------ | -------------------------------------------------------- | -------------------------------- |
| `idOrName` | _string_ | :heavy_check_mark: | The ID or name of the Project.                           | prj_pavWOn1iLObbXLRiwVvzmPrTWyTf |
| `uid`      | _string_ | :heavy_check_mark: | The user ID of the member.                               | ndlgr43fadlPyCtREAqxxdyFK        |
| `teamId`   | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |                                  |
| `slug`     | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |                                  |
