# UpdateProjectFirewallRoutes

## Example Usage

```typescript
import { UpdateProjectFirewallRoutes } from '@vercel/client/models/operations';

let value: UpdateProjectFirewallRoutes = {};
```

## Fields

| Field      | Type                                                                                 | Required           | Description |
| ---------- | ------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `src`      | _operations.UpdateProjectSrc_                                                        | :heavy_minus_sign: | N/A         |
| `has`      | [operations.UpdateProjectHas](../../models/operations/updateprojecthas.md)[]         | :heavy_minus_sign: | N/A         |
| `missing`  | [operations.UpdateProjectMissing](../../models/operations/updateprojectmissing.md)[] | :heavy_minus_sign: | N/A         |
| `dest`     | _string_                                                                             | :heavy_minus_sign: | N/A         |
| `status`   | _number_                                                                             | :heavy_minus_sign: | N/A         |
| `handle`   | [operations.UpdateProjectHandle](../../models/operations/updateprojecthandle.md)     | :heavy_minus_sign: | N/A         |
| `mitigate` | [operations.UpdateProjectMitigate](../../models/operations/updateprojectmitigate.md) | :heavy_minus_sign: | N/A         |
