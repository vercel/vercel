# CreateLogDrainSources

The sources from which logs are currently being delivered to this log drain.

## Example Usage

```typescript
import { CreateLogDrainSources } from '@vercel/client/models/operations';

let value: CreateLogDrainSources = 'firewall';
```

## Values

```typescript
'build' | 'edge' | 'lambda' | 'static' | 'external' | 'firewall';
```
