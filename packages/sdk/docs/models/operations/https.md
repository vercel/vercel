# Https

## Example Usage

```typescript
import { Https } from "@vercel/sdk/models/operations";

let value: Https = {
  priority: 405036,
  target: "example2.com.",
};
```

## Fields

| Field              | Type               | Required           | Description        | Example            |
| ------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| `priority`         | *number*           | :heavy_check_mark: | N/A                |                    |
| `target`           | *string*           | :heavy_check_mark: | N/A                | example2.com.      |
| `params`           | *string*           | :heavy_minus_sign: | N/A                |                    |