# UpdateProjectMitigate

## Example Usage

```typescript
import { UpdateProjectMitigate } from '@vercel/client/models/operations';

let value: UpdateProjectMitigate = {
  action: 'challenge',
  ruleId: '<value>',
};
```

## Fields

| Field    | Type                                                                             | Required           | Description |
| -------- | -------------------------------------------------------------------------------- | ------------------ | ----------- |
| `action` | [operations.UpdateProjectAction](../../models/operations/updateprojectaction.md) | :heavy_check_mark: | N/A         |
| `ruleId` | _string_                                                                         | :heavy_check_mark: | N/A         |
| `ttl`    | _number_                                                                         | :heavy_minus_sign: | N/A         |
| `erl`    | [operations.UpdateProjectErl](../../models/operations/updateprojecterl.md)       | :heavy_minus_sign: | N/A         |
