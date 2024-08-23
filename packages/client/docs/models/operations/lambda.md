# Lambda

If the output is a Serverless Function, an object containing the name, location and memory size of the function

## Example Usage

```typescript
import { Lambda } from '@vercel/client/models/operations';

let value: Lambda = {
  functionName: '<value>',
  deployedTo: ['<value>'],
};
```

## Fields

| Field          | Type       | Required           | Description |
| -------------- | ---------- | ------------------ | ----------- |
| `functionName` | _string_   | :heavy_check_mark: | N/A         |
| `deployedTo`   | _string_[] | :heavy_check_mark: | N/A         |
| `memorySize`   | _number_   | :heavy_minus_sign: | N/A         |
| `timeout`      | _number_   | :heavy_minus_sign: | N/A         |
| `layers`       | _string_[] | :heavy_minus_sign: | N/A         |
