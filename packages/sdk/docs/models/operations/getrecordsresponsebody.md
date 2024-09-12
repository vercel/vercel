# GetRecordsResponseBody

Successful response retrieving a list of paginated DNS records.

## Example Usage

```typescript
import { GetRecordsResponseBody } from "@vercel/sdk/models/operations";

let value: GetRecordsResponseBody = {
  records: [
    {
      id: "<id>",
      slug: "<value>",
      name: "<value>",
      type: "HTTPS",
      value: "<value>",
      creator: "<value>",
      created: 9799.63,
      updated: 9672.6,
      createdAt: 4237.06,
      updatedAt: 999.58,
    },
  ],
};
```

## Supported Types

### `string`

```typescript
const value: string = /* values here */
```

### `operations.GetRecordsResponseBody2`

```typescript
const value: operations.GetRecordsResponseBody2 = /* values here */
```

### `operations.ResponseBody3`

```typescript
const value: operations.ResponseBody3 = /* values here */
```

