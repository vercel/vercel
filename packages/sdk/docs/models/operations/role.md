# Role

The project role that will be added to this Access Group. \"null\" will remove this project level role.

## Example Usage

```typescript
import { Role } from "@vercel/sdk/models/operations";

let value: Role = "ADMIN";
```

## Values

```typescript
"ADMIN" | "PROJECT_VIEWER" | "PROJECT_DEVELOPER"
```