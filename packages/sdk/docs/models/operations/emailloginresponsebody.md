# EmailLoginResponseBody

The request was successful and an email was sent

## Example Usage

```typescript
import { EmailLoginResponseBody } from "@vercel/sdk/models/operations";

let value: EmailLoginResponseBody = {
  token: "<value>",
  securityCode: "<value>",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `token`            | *string*           | :heavy_check_mark: | N/A                |
| `securityCode`     | *string*           | :heavy_check_mark: | N/A                |