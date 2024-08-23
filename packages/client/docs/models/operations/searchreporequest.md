# SearchRepoRequest

## Example Usage

```typescript
import { SearchRepoRequest } from '@vercel/client/models/operations';

let value: SearchRepoRequest = {
  host: 'ghes-test.now.systems',
};
```

## Fields

| Field            | Type                                                                           | Required           | Description                                                                       | Example               |
| ---------------- | ------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------- | --------------------- |
| `query`          | _string_                                                                       | :heavy_minus_sign: | N/A                                                                               |                       |
| `namespaceId`    | _string_                                                                       | :heavy_minus_sign: | N/A                                                                               |                       |
| `provider`       | [operations.QueryParamProvider](../../models/operations/queryparamprovider.md) | :heavy_minus_sign: | N/A                                                                               |                       |
| `installationId` | _string_                                                                       | :heavy_minus_sign: | N/A                                                                               |                       |
| `host`           | _string_                                                                       | :heavy_minus_sign: | The custom Git host if using a custom Git provider, like GitHub Enterprise Server | ghes-test.now.systems |
| `teamId`         | _string_                                                                       | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.                          |                       |
| `slug`           | _string_                                                                       | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                                |                       |
