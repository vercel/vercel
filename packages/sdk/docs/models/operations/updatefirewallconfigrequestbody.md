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
            type: "target_path",
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
            type: "header",
            op: "neq",
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
  value: 4358.41,
};
```

### `operations.RequestBody6`

```typescript
const value: operations.RequestBody6 = {
  action: "crs.update",
  id: "sqli",
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
    hostname: "unfortunate-sonar.com",
    ip: "df0b:41ca:b080:5447:6f7d:3a1a:0be0:eb7d",
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
    hostname: "incomparable-boyfriend.name",
    ip: "124.174.210.38",
    action: "bypass",
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

