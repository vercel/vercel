# CreateCheckRequestBody

## Example Usage

```typescript
import { CreateCheckRequestBody } from "@vercel/sdk/models/operations";

let value: CreateCheckRequestBody = {
  name: "Performance Check",
  path: "/",
  blocking: true,
  detailsUrl: "http://example.com",
  externalId: "1234abc",
  rerequestable: true,
};
```

## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    | Example                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `name`                                                                         | *string*                                                                       | :heavy_check_mark:                                                             | The name of the check being created                                            | Performance Check                                                              |
| `path`                                                                         | *string*                                                                       | :heavy_minus_sign:                                                             | Path of the page that is being checked                                         | /                                                                              |
| `blocking`                                                                     | *boolean*                                                                      | :heavy_check_mark:                                                             | Whether the check should block a deployment from succeeding                    | true                                                                           |
| `detailsUrl`                                                                   | *string*                                                                       | :heavy_minus_sign:                                                             | URL to display for further details                                             | http://example.com                                                             |
| `externalId`                                                                   | *string*                                                                       | :heavy_minus_sign:                                                             | An identifier that can be used as an external reference                        | 1234abc                                                                        |
| `rerequestable`                                                                | *boolean*                                                                      | :heavy_minus_sign:                                                             | Whether a user should be able to request for the check to be rerun if it fails | true                                                                           |