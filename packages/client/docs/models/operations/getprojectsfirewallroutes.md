# GetProjectsFirewallRoutes

## Example Usage

```typescript
import { GetProjectsFirewallRoutes } from '@vercel/client/models/operations';

let value: GetProjectsFirewallRoutes = {};
```

## Fields

| Field      | Type                                                                             | Required           | Description |
| ---------- | -------------------------------------------------------------------------------- | ------------------ | ----------- |
| `src`      | _operations.GetProjectsSrc_                                                      | :heavy_minus_sign: | N/A         |
| `has`      | [operations.GetProjectsHas](../../models/operations/getprojectshas.md)[]         | :heavy_minus_sign: | N/A         |
| `missing`  | [operations.GetProjectsMissing](../../models/operations/getprojectsmissing.md)[] | :heavy_minus_sign: | N/A         |
| `dest`     | _string_                                                                         | :heavy_minus_sign: | N/A         |
| `status`   | _number_                                                                         | :heavy_minus_sign: | N/A         |
| `handle`   | [operations.GetProjectsHandle](../../models/operations/getprojectshandle.md)     | :heavy_minus_sign: | N/A         |
| `mitigate` | [operations.GetProjectsMitigate](../../models/operations/getprojectsmitigate.md) | :heavy_minus_sign: | N/A         |
