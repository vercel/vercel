# GitAccount

## Example Usage

```typescript
import { GitAccount } from "@vercel/sdk/models/operations";

let value: GitAccount = {
  provider: "bitbucket",
  namespaceId: 6675.93,
};
```

## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `provider`                                                                     | [operations.SearchRepoProvider](../../models/operations/searchrepoprovider.md) | :heavy_check_mark:                                                             | N/A                                                                            |
| `namespaceId`                                                                  | *operations.NamespaceId*                                                       | :heavy_check_mark:                                                             | N/A                                                                            |