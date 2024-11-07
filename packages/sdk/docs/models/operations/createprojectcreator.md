# CreateProjectCreator

## Example Usage

```typescript
import { CreateProjectCreator } from "@vercel/sdk/models/operations/createproject.js";

let value: CreateProjectCreator = {
  email: "Lenny.Graham@gmail.com",
  uid: "<id>",
  username: "Jaclyn.Witting",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `email`            | *string*           | :heavy_check_mark: | N/A                |
| `githubLogin`      | *string*           | :heavy_minus_sign: | N/A                |
| `gitlabLogin`      | *string*           | :heavy_minus_sign: | N/A                |
| `uid`              | *string*           | :heavy_check_mark: | N/A                |
| `username`         | *string*           | :heavy_check_mark: | N/A                |