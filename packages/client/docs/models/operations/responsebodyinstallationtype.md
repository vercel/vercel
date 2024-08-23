# ResponseBodyInstallationType

Defines the installation type. - 'external' integrations are installed via the existing integrations flow - 'marketplace' integrations are natively installed: - when accepting the TOS of a partner during the store creation process - if undefined, assume 'external'

## Example Usage

```typescript
import { ResponseBodyInstallationType } from '@vercel/client/models/operations';

let value: ResponseBodyInstallationType = 'external';
```

## Values

```typescript
'marketplace' | 'external';
```
