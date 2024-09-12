# UpdateTeamMemberRole

The project role of the member that will be added. \"null\" will remove this project level role.

## Example Usage

```typescript
import { UpdateTeamMemberRole } from "@vercel/sdk/models/operations";

let value: UpdateTeamMemberRole = "ADMIN";
```

## Values

```typescript
"ADMIN" | "PROJECT_VIEWER" | "PROJECT_DEVELOPER"
```