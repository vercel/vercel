# SkipAutoDetectionConfirmation

Allows to skip framework detection so the API would not fail to ask for confirmation

## Example Usage

```typescript
import { SkipAutoDetectionConfirmation } from "@vercel/sdk/models/operations/createdeployment.js";

let value: SkipAutoDetectionConfirmation = "0";
```

## Values

```typescript
"0" | "1"
```