# Target

Either not defined, `staging`, or `production`. If `staging`, a staging alias in the format `<project>-<team>.vercel.app` will be assigned. If `production`, any aliases defined in `alias` will be assigned. If omitted, the target will be `preview`

## Example Usage

```typescript
import { Target } from "@vercel/sdk/models/operations/createdeployment.js";

let value: Target = "production";
```

## Values

```typescript
"staging" | "production"
```