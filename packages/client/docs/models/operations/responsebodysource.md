# ResponseBodySource

Source defines where the configuration was installed from. It is used to analyze user engagement for integration installations in product metrics.

## Example Usage

```typescript
import { ResponseBodySource } from '@vercel/client/models/operations';

let value: ResponseBodySource = 'marketplace';
```

## Values

```typescript
'marketplace' | 'deploy-button' | 'external';
```
