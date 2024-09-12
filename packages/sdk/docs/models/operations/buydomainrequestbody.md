# BuyDomainRequestBody

## Example Usage

```typescript
import { BuyDomainRequestBody } from "@vercel/sdk/models/operations";

let value: BuyDomainRequestBody = {
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
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   | Example                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `name`                                                        | *string*                                                      | :heavy_check_mark:                                            | The domain name to purchase.                                  | example.com                                                   |
| `expectedPrice`                                               | *number*                                                      | :heavy_minus_sign:                                            | The price you expect to be charged for the purchase.          | 10                                                            |
| `renew`                                                       | *boolean*                                                     | :heavy_minus_sign:                                            | Indicates whether the domain should be automatically renewed. | true                                                          |
| `country`                                                     | *string*                                                      | :heavy_check_mark:                                            | The country of the domain registrant                          | US                                                            |
| `orgName`                                                     | *string*                                                      | :heavy_minus_sign:                                            | The company name of the domain registrant                     | Acme Inc.                                                     |
| `firstName`                                                   | *string*                                                      | :heavy_check_mark:                                            | The first name of the domain registrant                       | Jane                                                          |
| `lastName`                                                    | *string*                                                      | :heavy_check_mark:                                            | The last name of the domain registrant                        | Doe                                                           |
| `address1`                                                    | *string*                                                      | :heavy_check_mark:                                            | The street address of the domain registrant                   | 340 S Lemon Ave Suite 4133                                    |
| `city`                                                        | *string*                                                      | :heavy_check_mark:                                            | The city of the domain registrant                             | San Francisco                                                 |
| `state`                                                       | *string*                                                      | :heavy_check_mark:                                            | The state of the domain registrant                            | CA                                                            |
| `postalCode`                                                  | *string*                                                      | :heavy_check_mark:                                            | The postal code of the domain registrant                      | 91789                                                         |
| `phone`                                                       | *string*                                                      | :heavy_check_mark:                                            | The phone number of the domain registrant                     | +1.4158551452                                                 |
| `email`                                                       | *string*                                                      | :heavy_check_mark:                                            | The email of the domain registrant                            | jane.doe@someplace.com                                        |