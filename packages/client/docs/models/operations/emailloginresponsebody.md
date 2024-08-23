# EmailLoginResponseBody

The request was successful and an email was sent

## Example Usage

```typescript
import { EmailLoginResponseBody } from '@vercel/client/models/operations';

let value: EmailLoginResponseBody = {
  token: '<value>',
  securityCode: '<value>',
};
```

## Fields

| Field          | Type     | Required           | Description |
| -------------- | -------- | ------------------ | ----------- |
| `token`        | _string_ | :heavy_check_mark: | N/A         |
| `securityCode` | _string_ | :heavy_check_mark: | N/A         |
