# Encoding

The file content encoding, it could be either a base64 (useful for images, etc.) of the files or the plain text for source code.

## Example Usage

```typescript
import { Encoding } from "@vercel/sdk/models/operations/createdeployment.js";

let value: Encoding = "utf-8";
```

## Values

```typescript
"base64" | "utf-8"
```