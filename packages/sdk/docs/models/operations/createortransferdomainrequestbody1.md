# CreateOrTransferDomainRequestBody1

add

## Example Usage

```typescript
import { CreateOrTransferDomainRequestBody1 } from "@vercel/sdk/models/operations";

let value: CreateOrTransferDomainRequestBody1 = {
  name: "example.com",
  cdnEnabled: true,
  method: "transfer-in",
};
```

## Fields

| Field                                                                     | Type                                                                      | Required                                                                  | Description                                                               | Example                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `name`                                                                    | *string*                                                                  | :heavy_check_mark:                                                        | The domain name you want to add.                                          | example.com                                                               |
| `cdnEnabled`                                                              | *boolean*                                                                 | :heavy_minus_sign:                                                        | Whether the domain has the Vercel Edge Network enabled or not.            | true                                                                      |
| `zone`                                                                    | *boolean*                                                                 | :heavy_minus_sign:                                                        | N/A                                                                       |                                                                           |
| `method`                                                                  | *string*                                                                  | :heavy_minus_sign:                                                        | The domain operation to perform. It can be either `add` or `transfer-in`. | transfer-in                                                               |