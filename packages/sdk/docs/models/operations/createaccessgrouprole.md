# CreateAccessGroupRole

The project role that will be added to this Access Group. \"null\" will remove this project level role.

## Example Usage

```typescript
import { CreateAccessGroupRole } from "@vercel/sdk/models/operations";

let value: CreateAccessGroupRole = "ADMIN";
```

## Values

```typescript
"ADMIN" | "PROJECT_VIEWER" | "PROJECT_DEVELOPER"
```