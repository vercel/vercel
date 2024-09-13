# InstallationType

Defines the installation type. - 'external' integrations are installed via the existing integrations flow - 'marketplace' integrations are natively installed: - when accepting the TOS of a partner during the store creation process - if undefined, assume 'external'

## Example Usage

```typescript
import { InstallationType } from "@vercel/sdk/models/operations/getconfigurations.js";

let value: InstallationType = "marketplace";
```

## Values

```typescript
"marketplace" | "external"
```