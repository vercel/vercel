# Paths

## Example Usage

```typescript
import { Paths } from '@vercel/client/models/operations';

let value: Paths = {
  value: '<value>',
};
```

## Fields

| Field   | Type     | Required           | Description                                                          |
| ------- | -------- | ------------------ | -------------------------------------------------------------------- |
| `value` | _string_ | :heavy_check_mark: | The regex path that should not be protected by Deployment Protection |
