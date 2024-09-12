# Config

An object that contains the Build's configuration

## Example Usage

```typescript
import { Config } from "@vercel/sdk/models/operations";

let value: Config = {};
```

## Fields

| Field               | Type                | Required            | Description         |
| ------------------- | ------------------- | ------------------- | ------------------- |
| `distDir`           | *string*            | :heavy_minus_sign:  | N/A                 |
| `forceBuildIn`      | *string*            | :heavy_minus_sign:  | N/A                 |
| `reuseWorkPathFrom` | *string*            | :heavy_minus_sign:  | N/A                 |
| `zeroConfig`        | *boolean*           | :heavy_minus_sign:  | N/A                 |