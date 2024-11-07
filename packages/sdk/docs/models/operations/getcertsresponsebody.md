# GetCertsResponseBody

## Example Usage

```typescript
import { GetCertsResponseBody } from "@vercel/sdk/models/operations/getcerts.js";

let value: GetCertsResponseBody = {
  certs: [
    {
      cn: "<value>",
      uid: "<id>",
      created: new Date("2023-10-23T15:05:16.239Z"),
      expiration: new Date("2023-08-21T04:36:26.084Z"),
      autoRenew: false,
    },
  ],
};
```

## Fields

| Field                                                  | Type                                                   | Required                                               | Description                                            |
| ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `certs`                                                | [operations.Certs](../../models/operations/certs.md)[] | :heavy_check_mark:                                     | N/A                                                    |