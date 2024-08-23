# ProjectsMetadata

## Example Usage

```typescript
import { ProjectsMetadata } from '@vercel/client/models/operations';

let value: ProjectsMetadata = {
  id: '<id>',
  name: '<value>',
};
```

## Fields

| Field              | Type                                                                                 | Required           | Description |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `id`               | _string_                                                                             | :heavy_check_mark: | N/A         |
| `name`             | _string_                                                                             | :heavy_check_mark: | N/A         |
| `framework`        | [operations.ResponseBodyFramework](../../models/operations/responsebodyframework.md) | :heavy_minus_sign: | N/A         |
| `latestDeployment` | _string_                                                                             | :heavy_minus_sign: | N/A         |
