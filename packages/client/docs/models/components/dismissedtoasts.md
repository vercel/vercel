# DismissedToasts

A record of when, under a certain scopeId, a toast was dismissed

## Example Usage

```typescript
import { DismissedToasts } from '@vercel/client/models/components';

let value: DismissedToasts = {
  name: '<value>',
  dismissals: [
    {
      scopeId: '<value>',
      createdAt: 8850.22,
    },
  ],
};
```

## Fields

| Field        | Type                                                             | Required           | Description |
| ------------ | ---------------------------------------------------------------- | ------------------ | ----------- |
| `name`       | _string_                                                         | :heavy_check_mark: | N/A         |
| `dismissals` | [components.Dismissals](../../models/components/dismissals.md)[] | :heavy_check_mark: | N/A         |
