# DeleteSecretResponseBody

## Example Usage

```typescript
import { DeleteSecretResponseBody } from "@vercel/client/models/operations";

let value: DeleteSecretResponseBody = {
  uid: "sec_XCG7t7AIHuO2SBA8667zNUiM",
  name: "my-api-key",
  created: 2021-02-10T13:11:49.180Z,
};
```

## Fields

| Field     | Type     | Required           | Description                                  | Example                      |
| --------- | -------- | ------------------ | -------------------------------------------- | ---------------------------- |
| `uid`     | _string_ | :heavy_check_mark: | The unique identifier of the deleted secret. | sec_XCG7t7AIHuO2SBA8667zNUiM |
| `name`    | _string_ | :heavy_check_mark: | The name of the deleted secret.              | my-api-key                   |
| `created` | _number_ | :heavy_check_mark: | The date when the secret was created.        | 2021-02-10T13:11:49.180Z     |
