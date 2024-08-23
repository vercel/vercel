# CreateProjectFirewallRoutes

## Example Usage

```typescript
import { CreateProjectFirewallRoutes } from '@vercel/client/models/operations';

let value: CreateProjectFirewallRoutes = {};
```

## Fields

| Field      | Type                                                                                 | Required           | Description |
| ---------- | ------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `src`      | _operations.CreateProjectSrc_                                                        | :heavy_minus_sign: | N/A         |
| `has`      | [operations.CreateProjectHas](../../models/operations/createprojecthas.md)[]         | :heavy_minus_sign: | N/A         |
| `missing`  | [operations.CreateProjectMissing](../../models/operations/createprojectmissing.md)[] | :heavy_minus_sign: | N/A         |
| `dest`     | _string_                                                                             | :heavy_minus_sign: | N/A         |
| `status`   | _number_                                                                             | :heavy_minus_sign: | N/A         |
| `handle`   | [operations.CreateProjectHandle](../../models/operations/createprojecthandle.md)     | :heavy_minus_sign: | N/A         |
| `mitigate` | [operations.CreateProjectMitigate](../../models/operations/createprojectmitigate.md) | :heavy_minus_sign: | N/A         |
