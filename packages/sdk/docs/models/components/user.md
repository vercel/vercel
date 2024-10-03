# User

Metadata for the User who generated the event.

## Example Usage

```typescript
import { User } from "@vercel/sdk/models/components/userevent.js";

let value: User = {
  avatar: "https://loremflickr.com/2842/2020?lock=2197223561898772",
  email: "Bertram.Sporer-Lesch@hotmail.com",
  uid: "<id>",
  username: "Shane.Kutch33",
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