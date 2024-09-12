# Flags1

Flags defined in the Build Output API, used by this deployment. Primarily used by the Toolbar to know about the used flags.

## Example Usage

```typescript
import { Flags1 } from "@vercel/sdk/models/operations";

let value: Flags1 = {
  definitions: {},
};
```

## Fields

| Field                                                                                      | Type                                                                                       | Required                                                                                   | Description                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `definitions`                                                                              | Record<string, [operations.FlagsDefinitions](../../models/operations/flagsdefinitions.md)> | :heavy_check_mark:                                                                         | N/A                                                                                        |