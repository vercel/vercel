# Https

## Example Usage

```typescript
import { Https } from "@vercel/sdk/models/operations/updaterecord.js";

let value: Https = {
  priority: 801816,
  target: "example2.com.",
};
```

## Fields

| Field              | Type               | Required           | Description        | Example            |
| ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| `priority`         | *number*           | :heavy_check_mark: | N/A                |                    |
| `target`           | *string*           | :heavy_check_mark: | N/A                | example2.com.      |
| `params`           | *string*           | :heavy_minus_sign: | N/A                |                    |