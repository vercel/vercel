# UpdateFirewallConfigRequestBody


## Supported Types

### `operations.UpdateFirewallConfigRequestBody1`

```typescript
const value: operations.UpdateFirewallConfigRequestBody1 = {
  action: "firewallEnabled",
  value: false,
};
```

### `operations.UpdateFirewallConfigRequestBody2`

```typescript
const value: operations.UpdateFirewallConfigRequestBody2 = {
  action: "rules.insert",
  value: {
    name: "<value>",
    active: false,
    conditionGroup: [
      {
        conditions: [
          {
            type: "path",
            op: "ninc",
          },
        ],
      },
    ],
    action: {},
  },
};
```

### `operations.UpdateFirewallConfigRequestBody3`

```typescript
const value: operations.UpdateFirewallConfigRequestBody3 = {
  action: "rules.update",
  id: "<id>",
  value: {
    name: "<value>",
    active: false,
    conditionGroup: [
      {
        conditions: [
          {
            type: "host",
            op: "gte",
          },
        ],
      },
    ],
    action: {},
  },
};
```

### `operations.UpdateFirewallConfigRequestBody4`

```typescript
const value: operations.UpdateFirewallConfigRequestBody4 = {
  action: "rules.remove",
  id: "<id>",
};
```

### `operations.UpdateFirewallConfigRequestBody5`

```typescript
const value: operations.UpdateFirewallConfigRequestBody5 = {
  action: "rules.priority",
  id: "<id>",
  value: 9504.86,
};
```

### `operations.RequestBody6`

```typescript
const value: operations.RequestBody6 = {
  action: "crs.update",
  id: "sd",
  value: {
    active: false,
    action: "log",
  },
};
```

### `operations.RequestBody7`

```typescript
const value: operations.RequestBody7 = {
  action: "crs.disable",
};
```

### `operations.RequestBody8`

```typescript
const value: operations.RequestBody8 = {
  action: "ip.insert",
  value: {
    hostname: "sore-formula.org",
    ip: "104.24.168.7",
    action: "challenge",
  },
};
```

### `operations.RequestBody9`

```typescript
const value: operations.RequestBody9 = {
  action: "ip.update",
  id: "<id>",
  value: {
    hostname: "rich-slime.com",
    ip: "fcc2:d8d6:c9d5:1a9c:0edd:08fe:3afb:0d52",
    action: "challenge",
  },
};
```

### `operations.RequestBody10`

```typescript
const value: operations.RequestBody10 = {
  action: "ip.remove",
  id: "<id>",
};
```

### `operations.Eleven`

```typescript
const value: operations.Eleven = {
  action: "managedRules.update",
  id: "owasp",
  value: {
    active: false,
  },
};
```

