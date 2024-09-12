# GitForkProtection

Specifies whether PRs from Git forks should require a team member's authorization before it can be deployed

## Example Usage

```typescript
import { GitForkProtection } from "@vercel/sdk/models/operations";

let value: GitForkProtection = "1";
```

## Values

```typescript
"1" | "0"
```