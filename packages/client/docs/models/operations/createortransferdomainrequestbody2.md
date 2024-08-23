# CreateOrTransferDomainRequestBody2

move-in

## Example Usage

```typescript
import { CreateOrTransferDomainRequestBody2 } from '@vercel/client/models/operations';

let value: CreateOrTransferDomainRequestBody2 = {
  name: 'example.com',
  method: 'transfer-in',
  token: 'fdhfr820ad#@FAdlj$$',
};
```

## Fields

| Field    | Type     | Required           | Description                                                               | Example             |
| -------- | -------- | ------------------ | ------------------------------------------------------------------------- | ------------------- |
| `name`   | _string_ | :heavy_check_mark: | The domain name you want to add.                                          | example.com         |
| `method` | _string_ | :heavy_check_mark: | The domain operation to perform. It can be either `add` or `transfer-in`. | transfer-in         |
| `token`  | _string_ | :heavy_minus_sign: | The move-in token from Move Requested email.                              | fdhfr820ad#@FAdlj$$ |
