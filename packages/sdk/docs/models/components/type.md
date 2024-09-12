# Type

String indicating the type of file tree entry.

## Example Usage

```typescript
import { Type } from "@vercel/sdk/models/components";

let value: Type = "file";
```

## Values

```typescript
"directory" | "file" | "symlink" | "lambda" | "middleware" | "invalid"
```