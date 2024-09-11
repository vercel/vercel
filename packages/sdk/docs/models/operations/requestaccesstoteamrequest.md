# RequestAccessToTeamRequest

## Example Usage

```typescript
import { RequestAccessToTeamRequest } from "@vercel/sdk/models/operations";

let value: RequestAccessToTeamRequest = {
  teamId: "<value>",
  requestBody: {
    joinedFrom: {
      origin: "github",
      commitId: "f498d25d8bd654b578716203be73084b31130cd7",
      repoId: "67753070",
      repoPath: "jane-doe/example",
      gitUserId: "103053343",
      gitUserLogin: "jane-doe",
    },
  },
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `teamId`                                                                                               | *string*                                                                                               | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `requestBody`                                                                                          | [operations.RequestAccessToTeamRequestBody](../../models/operations/requestaccesstoteamrequestbody.md) | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |