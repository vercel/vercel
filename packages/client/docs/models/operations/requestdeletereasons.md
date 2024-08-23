# RequestDeleteReasons

An object describing the reason why the User account is being deleted.

## Example Usage

```typescript
import { RequestDeleteReasons } from '@vercel/client/models/operations';

let value: RequestDeleteReasons = {
  slug: '<value>',
  description: 'Reactive composite firmware',
};
```

## Fields

| Field         | Type     | Required           | Description                                                           |
| ------------- | -------- | ------------------ | --------------------------------------------------------------------- |
| `slug`        | _string_ | :heavy_check_mark: | Idenitifier slug of the reason why the User account is being deleted. |
| `description` | _string_ | :heavy_check_mark: | Description of the reason why the User account is being deleted.      |
