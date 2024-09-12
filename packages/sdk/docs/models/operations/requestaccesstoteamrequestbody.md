# RequestAccessToTeamRequestBody

## Example Usage

```typescript
import { RequestAccessToTeamRequestBody } from "@vercel/sdk/models/operations";

let value: RequestAccessToTeamRequestBody = {
  joinedFrom: {
    origin: "github",
    commitId: "f498d25d8bd654b578716203be73084b31130cd7",
    repoId: "67753070",
    repoPath: "jane-doe/example",
    gitUserId: "103053343",
    gitUserLogin: "jane-doe",
  },
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `joinedFrom`                                                   | [operations.JoinedFrom](../../models/operations/joinedfrom.md) | :heavy_check_mark:                                             | N/A                                                            |