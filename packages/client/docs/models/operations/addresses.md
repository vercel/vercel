# Addresses

## Example Usage

```typescript
import { Addresses } from '@vercel/client/models/operations';

let value: Addresses = {
  value: '<value>',
};
```

## Fields

| Field   | Type     | Required           | Description                                                                                              |
| ------- | -------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| `value` | _string_ | :heavy_check_mark: | The IP addresses that are allowlisted. Supports IPv4 addresses and CIDR notations. IPv6 is not supported |
| `note`  | _string_ | :heavy_minus_sign: | An optional note explaining what the IP address or subnet is used for                                    |
