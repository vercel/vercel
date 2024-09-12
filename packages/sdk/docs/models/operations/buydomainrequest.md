# BuyDomainRequest

## Example Usage

```typescript
import { BuyDomainRequest } from "@vercel/sdk/models/operations";

let value: BuyDomainRequest = {
  requestBody: {
    name: "example.com",
    expectedPrice: 10,
    renew: true,
    country: "US",
    orgName: "Acme Inc.",
    firstName: "Jane",
    lastName: "Doe",
    address1: "340 S Lemon Ave Suite 4133",
    city: "San Francisco",
    state: "CA",
    postalCode: "91789",
    phone: "+1.4158551452",
    email: "jane.doe@someplace.com",
  },
};
```

## Fields

| Field                                                                              | Type                                                                               | Required                                                                           | Description                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `teamId`                                                                           | *string*                                                                           | :heavy_minus_sign:                                                                 | The Team identifier to perform the request on behalf of.                           |
| `slug`                                                                             | *string*                                                                           | :heavy_minus_sign:                                                                 | The Team slug to perform the request on behalf of.                                 |
| `requestBody`                                                                      | [operations.BuyDomainRequestBody](../../models/operations/buydomainrequestbody.md) | :heavy_minus_sign:                                                                 | N/A                                                                                |