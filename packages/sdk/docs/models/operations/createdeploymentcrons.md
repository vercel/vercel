# CreateDeploymentCrons

## Example Usage

```typescript
import { CreateDeploymentCrons } from "@vercel/sdk/models/operations/createdeployment.js";

let value: CreateDeploymentCrons = {
  schedule: "<value>",
  path: "/boot",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `schedule`         | *string*           | :heavy_check_mark: | N/A                |
| `path`             | *string*           | :heavy_check_mark: | N/A                |