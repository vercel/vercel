# Lambda

If the output is a Serverless Function, an object containing the name, location and memory size of the function

## Example Usage

```typescript
import { Lambda } from "@vercel/sdk/models/operations";

let value: Lambda = {
  functionName: "<value>",
  deployedTo: [
    "<value>",
  ],
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `functionName`     | *string*           | :heavy_check_mark: | N/A                |
| `deployedTo`       | *string*[]         | :heavy_check_mark: | N/A                |
| `memorySize`       | *number*           | :heavy_minus_sign: | N/A                |
| `timeout`          | *number*           | :heavy_minus_sign: | N/A                |
| `layers`           | *string*[]         | :heavy_minus_sign: | N/A                |