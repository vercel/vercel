# CreateDeploymentCrons

## Example Usage

```typescript
import { CreateDeploymentCrons } from "@vercel/sdk/models/operations/createdeployment.js";

let value: CreateDeploymentCrons = {
  schedule: "<value>",
  path: "/var/spool",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `schedule`         | *string*           | :heavy_check_mark: | N/A                |
| `path`             | *string*           | :heavy_check_mark: | N/A                |