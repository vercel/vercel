# One

A list of projects and spaces across teams that a user has marked as a favorite.

## Example Usage

```typescript
import { One } from "@vercel/sdk/models/components/authuser.js";

let value: One = {
  projectId: "<id>",
  scopeSlug: "<value>",
  scopeId: "<id>",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `projectId`        | *string*           | :heavy_check_mark: | N/A                |
| `scopeSlug`        | *string*           | :heavy_check_mark: | N/A                |
| `scopeId`          | *string*           | :heavy_check_mark: | N/A                |