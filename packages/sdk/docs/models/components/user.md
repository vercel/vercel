# User

Metadata for the User who generated the event.

## Example Usage

```typescript
import { User } from "@vercel/sdk/models/components/userevent.js";

let value: User = {
  avatar: "https://picsum.photos/seed/YqS02Ajfh/899/3391",
  email: "Montana_Schamberger@gmail.com",
  uid: "<value>",
  username: "Helene.Ondricka",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `avatar`           | *string*           | :heavy_check_mark: | N/A                |
| `email`            | *string*           | :heavy_check_mark: | N/A                |
| `slug`             | *string*           | :heavy_minus_sign: | N/A                |
| `uid`              | *string*           | :heavy_check_mark: | N/A                |
| `username`         | *string*           | :heavy_check_mark: | N/A                |