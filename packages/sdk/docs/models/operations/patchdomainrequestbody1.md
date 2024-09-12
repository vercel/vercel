# PatchDomainRequestBody1

update

## Example Usage

```typescript
import { PatchDomainRequestBody1 } from "@vercel/sdk/models/operations";

let value: PatchDomainRequestBody1 = {
  op: "update",
};
```

## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    | Example                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `op`                                                                           | *string*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            | update                                                                         |
| `renew`                                                                        | *boolean*                                                                      | :heavy_minus_sign:                                                             | Specifies whether domain should be renewed.                                    |                                                                                |
| `customNameservers`                                                            | *string*[]                                                                     | :heavy_minus_sign:                                                             | The custom nameservers for this project.                                       |                                                                                |
| `zone`                                                                         | *boolean*                                                                      | :heavy_minus_sign:                                                             | Specifies whether this is a DNS zone that intends to use Vercel's nameservers. |                                                                                |