# JoinedFrom

## Example Usage

```typescript
import { JoinedFrom } from '@vercel/client/models/components';

let value: JoinedFrom = {
  origin: 'import',
};
```

## Fields

| Field              | Type                                                   | Required           | Description |
| ------------------ | ------------------------------------------------------ | ------------------ | ----------- |
| `origin`           | [components.Origin](../../models/components/origin.md) | :heavy_check_mark: | N/A         |
| `commitId`         | _string_                                               | :heavy_minus_sign: | N/A         |
| `repoId`           | _string_                                               | :heavy_minus_sign: | N/A         |
| `repoPath`         | _string_                                               | :heavy_minus_sign: | N/A         |
| `gitUserId`        | _components.GitUserId_                                 | :heavy_minus_sign: | N/A         |
| `gitUserLogin`     | _string_                                               | :heavy_minus_sign: | N/A         |
| `ssoUserId`        | _string_                                               | :heavy_minus_sign: | N/A         |
| `ssoConnectedAt`   | _number_                                               | :heavy_minus_sign: | N/A         |
| `idpUserId`        | _string_                                               | :heavy_minus_sign: | N/A         |
| `dsyncUserId`      | _string_                                               | :heavy_minus_sign: | N/A         |
| `dsyncConnectedAt` | _number_                                               | :heavy_minus_sign: | N/A         |
