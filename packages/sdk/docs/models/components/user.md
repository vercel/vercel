# User

Metadata for the User who generated the event.

## Example Usage

```typescript
import { User } from "@vercel/sdk/models/components/userevent.js";

let value: User = {
  avatar: "https://loremflickr.com/1860/2436?lock=6816338601578805",
  email: "Tyson.Harvey@gmail.com",
  uid: "<id>",
  username: "Aurelie_Smith20",
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