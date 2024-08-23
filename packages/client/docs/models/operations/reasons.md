# Reasons

An object describing the reason why the team is being deleted.

## Example Usage

```typescript
import { Reasons } from '@vercel/client/models/operations';

let value: Reasons = {
  slug: '<value>',
  description: 'Virtual dynamic installation',
};
```

## Fields

| Field         | Type     | Required           | Description                                                   |
| ------------- | -------- | ------------------ | ------------------------------------------------------------- |
| `slug`        | _string_ | :heavy_check_mark: | Idenitifier slug of the reason why the team is being deleted. |
| `description` | _string_ | :heavy_check_mark: | Description of the reason why the team is being deleted.      |
