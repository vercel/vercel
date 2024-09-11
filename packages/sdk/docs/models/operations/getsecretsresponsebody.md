# GetSecretsResponseBody

Successful response retrieving a list of secrets.

## Example Usage

```typescript
import { GetSecretsResponseBody } from "@vercel/sdk/models/operations";

let value: GetSecretsResponseBody = {
  secrets: [
    {
      created: new Date("2021-02-10T13:11:49.180Z"),
      name: "my-api-key",
      teamId: "team_LLHUOMOoDlqOp8wPE4kFo9pE",
      uid: "sec_XCG7t7AIHuO2SBA8667zNUiM",
      userId: "2qDDuGFTWXBLDNnqZfWPDp1A",
      createdAt: 1609492210000,
      projectId: "prj_2WjyKQmM8ZnGcJsPWMrHRHrE",
      decryptable: true,
    },
  ],
  pagination: {
    count: 20,
    next: 1540095775951,
    prev: 1540095775951,
  },
};
```

## Fields

| Field                                                                                                                                                           | Type                                                                                                                                                            | Required                                                                                                                                                        | Description                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `secrets`                                                                                                                                                       | [operations.Secrets](../../models/operations/secrets.md)[]                                                                                                      | :heavy_check_mark:                                                                                                                                              | N/A                                                                                                                                                             |
| `pagination`                                                                                                                                                    | [components.Pagination](../../models/components/pagination.md)                                                                                                  | :heavy_check_mark:                                                                                                                                              | This object contains information related to the pagination of the current request, including the necessary parameters to get the next or previous page of data. |