# NodeVersion

Override the Node.js version that should be used for this deployment

## Example Usage

```typescript
import { NodeVersion } from "@vercel/sdk/models/operations/createdeployment.js";

let value: NodeVersion = "16.x";
```

## Values

```typescript
"20.x" | "18.x" | "16.x"
```