# ResponseBodyScopes

## Example Usage

```typescript
import { ResponseBodyScopes } from '@vercel/client/models/operations';

let value: ResponseBodyScopes = {
  added: ['read-write:otel-endpoint'],
  upgraded: ['read-write:global-project-env-vars'],
};
```

## Fields

| Field      | Type                                                                                 | Required           | Description |
| ---------- | ------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `added`    | [operations.ResponseBodyAdded](../../models/operations/responsebodyadded.md)[]       | :heavy_check_mark: | N/A         |
| `upgraded` | [operations.ResponseBodyUpgraded](../../models/operations/responsebodyupgraded.md)[] | :heavy_check_mark: | N/A         |
