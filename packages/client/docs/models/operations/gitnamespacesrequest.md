# GitNamespacesRequest

## Example Usage

```typescript
import { GitNamespacesRequest } from '@vercel/client/models/operations';

let value: GitNamespacesRequest = {
  host: 'ghes-test.now.systems',
};
```

## Fields

| Field      | Type                                                       | Required           | Description                                                                       | Example               |
| ---------- | ---------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- | --------------------- |
| `host`     | _string_                                                   | :heavy_minus_sign: | The custom Git host if using a custom Git provider, like GitHub Enterprise Server | ghes-test.now.systems |
| `provider` | [operations.Provider](../../models/operations/provider.md) | :heavy_minus_sign: | N/A                                                                               |                       |
| `teamId`   | _string_                                                   | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.                          |                       |
| `slug`     | _string_                                                   | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                                |                       |
