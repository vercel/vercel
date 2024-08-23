# CreateTeamRequestBody

## Example Usage

```typescript
import { CreateTeamRequestBody } from '@vercel/client/models/operations';

let value: CreateTeamRequestBody = {
  slug: 'a-random-team',
  name: 'A Random Team',
};
```

## Fields

| Field         | Type                                                             | Required           | Description                                                                                       | Example       |
| ------------- | ---------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- | ------------- |
| `slug`        | _string_                                                         | :heavy_check_mark: | The desired slug for the Team                                                                     | a-random-team |
| `name`        | _string_                                                         | :heavy_minus_sign: | The desired name for the Team. It will be generated from the provided slug if nothing is provided | A Random Team |
| `attribution` | [operations.Attribution](../../models/operations/attribution.md) | :heavy_minus_sign: | Attribution information for the session or current page                                           |               |
